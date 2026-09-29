import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { renderContractPdf } from '@/lib/contracts/render-document';
import { internalRenderUrl } from '@/lib/documents/internal-render-url';
import {
  buildContractDocumentData,
  loadContract,
} from '@/lib/contracts/server';
import { isUuid } from '@/lib/validation/uuid';

export const runtime = 'nodejs';
export const maxDuration = 60;

function safeFilePart(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'contrato'
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let versionId: string | null = null;
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: 'Contrato inválido.' },
        { status: 400 }
      );
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `contract-generate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { contract } = await loadContract(ctx, id);
    const snapshot = await buildContractDocumentData(ctx, contract);
    const missing = [
      ['razón social', snapshot.company.legalName],
      ['RUT de la empresa', snapshot.company.taxId],
      ['dirección legal', snapshot.company.legalAddress],
    ].filter(([, value]) => !value);
    if (missing.length)
      return NextResponse.json(
        {
          error: `Completa ${missing.map(([label]) => label).join(', ')} en Configuración > Empresa antes de generar.`,
        },
        { status: 400 }
      );

    const { data: reserved, error: reserveError } = await ctx.supabase.rpc(
      'reserve_contract_version',
      { p_contract_id: id, p_snapshot: snapshot }
    );
    if (reserveError || !reserved)
      return NextResponse.json(
        { error: 'No fue posible reservar una versión.' },
        { status: 500 }
      );
    versionId = reserved.id as string;
    const version = Number(reserved.version_number);
    const renderUrl = internalRenderUrl(`/contract-render/${id}`);
    renderUrl.searchParams.set('version', String(version));
    let artifact: Awaited<ReturnType<typeof renderContractPdf>>;
    try {
      artifact = await renderContractPdf({
        url: renderUrl.toString(),
        cookieHeader: request.headers.get('cookie') ?? '',
      });
    } catch (renderError) {
      const reason =
        renderError instanceof Error
          ? renderError.message.slice(0, 2000)
          : 'render_failed';
      await ctx.supabase
        .from('contract_versions')
        .update({ generation_status: 'failed', generation_error: reason })
        .eq('id', versionId);
      return NextResponse.json(
        { error: 'No fue posible renderizar el contrato.' },
        { status: 500 }
      );
    }

    const basename = `${safeFilePart(contract.contractNumber)}-v${version}.pdf`;
    const storagePath = `account-${ctx.accountId}/contracts/${id}/${version}/${basename}`;
    const upload = await ctx.supabase.storage
      .from('contract-documents')
      .upload(storagePath, artifact.pdf, {
        contentType: 'application/pdf',
        cacheControl: '31536000',
        upsert: false,
      });
    if (upload.error) {
      await ctx.supabase
        .from('contract_versions')
        .update({
          generation_status: 'failed',
          generation_error: upload.error.message,
        })
        .eq('id', versionId);
      return NextResponse.json(
        { error: 'No fue posible guardar el PDF.' },
        { status: 500 }
      );
    }
    const finalized = await ctx.supabase
      .from('contract_versions')
      .update({
        generation_status: 'ready',
        generation_error: null,
        pdf_storage_path: storagePath,
        pdf_sha256: artifact.sha256,
      })
      .eq('id', versionId);
    if (finalized.error)
      return NextResponse.json(
        { error: 'El PDF se guardó, pero la versión no pudo finalizarse.' },
        { status: 500 }
      );
    return NextResponse.json({
      success: true,
      version,
      pdfUrl: `/api/contracts/${id}/artifact?version=${version}`,
    });
  } catch (error) {
    if (versionId)
      console.error('[contracts] generation failed:', versionId, error);
    return toErrorResponse(error);
  }
}
