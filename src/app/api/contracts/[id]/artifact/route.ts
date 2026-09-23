import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadContract } from '@/lib/contracts/server';
import { isUuid } from '@/lib/validation/uuid';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: 'Contrato inválido.' },
        { status: 400 }
      );
    const ctx = await requireRole('agent');
    const detail = await loadContract(ctx, id);
    const requested = Number(
      new URL(request.url).searchParams.get('version') || 0
    );
    const version = requested
      ? detail.versions.find((item) => item.versionNumber === requested)
      : detail.versions.find((item) => item.generationStatus === 'ready');
    if (!version?.pdfStoragePath || version.generationStatus !== 'ready')
      return NextResponse.json(
        { error: 'La versión no está disponible.' },
        { status: 404 }
      );
    const { data, error } = await ctx.supabase.storage
      .from('contract-documents')
      .download(version.pdfStoragePath);
    if (error || !data)
      return NextResponse.json(
        { error: 'No fue posible descargar el PDF.' },
        { status: 500 }
      );
    const bytes = await data.arrayBuffer();
    const filename = `${detail.contract.contractNumber.replace(/[^a-zA-Z0-9_-]+/g, '-')}-v${version.versionNumber}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
