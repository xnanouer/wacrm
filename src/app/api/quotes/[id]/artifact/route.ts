import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadQuotation } from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'cotizacion';
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const url = new URL(request.url);
    const format = url.searchParams.get('format') === 'png' ? 'png' : 'pdf';
    const inline = url.searchParams.get('inline') === '1';
    const requestedVersion = Number(url.searchParams.get('version') || 0);
    const ctx = await requireRole('agent');
    const detail = await loadQuotation(ctx, id);
    const version = requestedVersion
      ? detail.versions.find((item) => item.versionNumber === requestedVersion)
      : detail.versions.find((item) => item.generationStatus === 'ready');
    if (!version || version.generationStatus !== 'ready') {
      return NextResponse.json(
        { error: 'La versión no está disponible.' },
        { status: 404 }
      );
    }
    const path =
      format === 'png' ? version.pngStoragePath : version.pdfStoragePath;
    if (!path) {
      return NextResponse.json(
        { error: 'El archivo no está disponible.' },
        { status: 404 }
      );
    }
    const { data, error } = await ctx.supabase.storage
      .from('quotation-documents')
      .download(path);
    if (error || !data) {
      return NextResponse.json(
        { error: 'No fue posible descargar el archivo.' },
        { status: 500 }
      );
    }
    const bytes = await data.arrayBuffer();
    const filename = `${safeFilePart(detail.quotation.quoteNumber)}-v${version.versionNumber}.${format}`;
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': format === 'png' ? 'image/png' : 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
