import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { renderQuotationArtifacts } from '@/lib/quotes/render-document';
import { buildQuotationDocumentData, loadQuotation } from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function safeFilePart(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'cotizacion'
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  let versionId: string | null = null;
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quotation-generate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { quotation } = await loadQuotation(ctx, id);
    const snapshot = await buildQuotationDocumentData(ctx, quotation);

    const { data: reserved, error: reserveError } = await ctx.supabase.rpc(
      'reserve_quotation_version',
      { p_quotation_id: id, p_snapshot: snapshot }
    );
    if (reserveError || !reserved) {
      console.error('[quotes] version reservation failed:', reserveError);
      return NextResponse.json(
        { error: 'No fue posible reservar una nueva versión.' },
        { status: 500 }
      );
    }
    versionId = reserved.id as string;
    const versionNumber = Number(reserved.version_number);
    let artifacts: Awaited<ReturnType<typeof renderQuotationArtifacts>>;
    try {
      const renderUrl = new URL(`/quote-render/${id}`, request.url);
      renderUrl.searchParams.set('version', String(versionNumber));
      artifacts = await renderQuotationArtifacts({
        url: renderUrl.toString(),
        cookieHeader: request.headers.get('cookie') ?? '',
      });
    } catch (renderError) {
      const reason =
        renderError instanceof Error
          ? renderError.message.slice(0, 2000)
          : 'render_failed';
      await ctx.supabase
        .from('quotation_versions')
        .update({ generation_status: 'failed', generation_error: reason })
        .eq('id', versionId);
      console.error('[quotes] document render failed:', renderError);
      return NextResponse.json(
        { error: 'No fue posible renderizar el documento.' },
        { status: 500 }
      );
    }
    const basename = `${safeFilePart(quotation.quoteNumber)}-v${versionNumber}`;
    const basePath = `account-${ctx.accountId}/quotes/${id}/${versionNumber}`;
    const pdfPath = `${basePath}/${basename}.pdf`;
    const pngPath = `${basePath}/${basename}.png`;

    const [pdfUpload, pngUpload] = await Promise.all([
      ctx.supabase.storage
        .from('quotation-documents')
        .upload(pdfPath, artifacts.pdf, {
          contentType: 'application/pdf',
          cacheControl: '31536000',
          upsert: false,
        }),
      ctx.supabase.storage
        .from('quotation-documents')
        .upload(pngPath, artifacts.png, {
          contentType: 'image/png',
          cacheControl: '31536000',
          upsert: false,
        }),
    ]);
    if (pdfUpload.error || pngUpload.error) {
      const uploadedPaths = [
        pdfUpload.error ? null : pdfPath,
        pngUpload.error ? null : pngPath,
      ].filter((path): path is string => Boolean(path));
      if (uploadedPaths.length) {
        await ctx.supabase.storage
          .from('quotation-documents')
          .remove(uploadedPaths);
      }
      const reason =
        pdfUpload.error?.message ||
        pngUpload.error?.message ||
        'storage_failed';
      await ctx.supabase
        .from('quotation_versions')
        .update({ generation_status: 'failed', generation_error: reason })
        .eq('id', versionId);
      return NextResponse.json(
        {
          error:
            'La versión se reservó, pero no fue posible guardar sus archivos.',
        },
        { status: 500 }
      );
    }

    const { error: finalizeError } = await ctx.supabase
      .from('quotation_versions')
      .update({
        generation_status: 'ready',
        generation_error: null,
        pdf_storage_path: pdfPath,
        png_storage_path: pngPath,
        pdf_sha256: artifacts.pdfSha256,
        png_sha256: artifacts.pngSha256,
      })
      .eq('id', versionId);
    if (finalizeError) {
      await ctx.supabase
        .from('quotation_versions')
        .update({
          generation_status: 'failed',
          generation_error: finalizeError.message,
        })
        .eq('id', versionId);
      return NextResponse.json(
        {
          error:
            'Los archivos se guardaron, pero la versión no pudo finalizarse.',
        },
        { status: 500 }
      );
    }
    if (['draft', 'rejected', 'expired'].includes(quotation.status)) {
      await ctx.supabase.rpc('set_quotation_status', {
        p_quotation_id: id,
        p_status: 'generated',
      });
    }
    return NextResponse.json({
      success: true,
      version: versionNumber,
      pdfUrl: `/api/quotes/${id}/artifact?format=pdf&version=${versionNumber}`,
      pngUrl: `/api/quotes/${id}/artifact?format=png&version=${versionNumber}`,
    });
  } catch (error) {
    if (versionId)
      console.error(
        '[quotes] generation failed for version:',
        versionId,
        error
      );
    else console.error('[quotes] generation failed:', error);
    return toErrorResponse(error);
  }
}
