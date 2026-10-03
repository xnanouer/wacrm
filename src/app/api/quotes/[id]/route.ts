import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  parseQuotationInput,
  quotationInputToRpcPayload,
} from '@/lib/quotes/payload';
import { loadQuotation, quotationFromRow } from '@/lib/quotes/server';
import { validateQuotationInput } from '@/lib/quotes/validation';
import { isUuid } from '@/lib/validation/uuid';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const ctx = await requireRole('agent');
    return NextResponse.json(await loadQuotation(ctx, id));
  } catch (error) {
    if (error instanceof Error && error.message === 'quotation_not_found') {
      return NextResponse.json(
        { error: 'Cotización no encontrada.' },
        { status: 404 }
      );
    }
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
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
      `quotation-update:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const input = parseQuotationInput(await request.json().catch(() => null));
    if (!input) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }
    const validation = validateQuotationInput(input);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Revisa los campos marcados.', errors: validation.errors },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase.rpc(
      'update_vehicle_quotation_v2',
      {
        p_quotation_id: id,
        p_payload: quotationInputToRpcPayload(input),
      }
    );
    if (error || !data) {
      const forbidden = error?.message?.includes('forbidden');
      return NextResponse.json(
        {
          error: forbidden
            ? 'No puedes editar esta cotización.'
            : 'No fue posible guardar los cambios.',
        },
        { status: forbidden ? 403 : 400 }
      );
    }
    return NextResponse.json({
      quotation: quotationFromRow(data as Record<string, unknown>),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const ctx = await requireRole('agent');
    const { data: quotation, error: quotationError } = await ctx.supabase
      .from('quotations')
      .select('id, status, deletion_hold')
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .single();
    if (quotationError || !quotation) {
      return NextResponse.json(
        { error: 'Cotización no encontrada o sin permiso para eliminarla.' },
        { status: 404 }
      );
    }
    if (quotation.deletion_hold || quotation.status === 'financing_pending') {
      return NextResponse.json(
        {
          error: quotation.deletion_hold
            ? 'Esta cotización está protegida y no puede eliminarse.'
            : 'Una cotización con financiamiento pendiente no puede eliminarse.',
        },
        { status: 409 }
      );
    }
    const { data: versions } = await ctx.supabase
      .from('quotation_versions')
      .select('pdf_storage_path, png_storage_path')
      .eq('quotation_id', id);
    const paths = (versions ?? []).flatMap((version) =>
      [version.pdf_storage_path, version.png_storage_path].filter(
        (path): path is string => Boolean(path)
      )
    );
    const { error } = await ctx.supabase
      .from('quotations')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('id', id);
    if (error) {
      return NextResponse.json(
        { error: 'No fue posible eliminar la cotización.' },
        { status: 500 }
      );
    }
    let storageWarning: string | undefined;
    if (paths.length) {
      const { error: storageError } = await ctx.supabase.storage
        .from('quotation-documents')
        .remove(paths);
      if (storageError) {
        console.error('[quotes] orphaned artifacts after delete:', {
          quotationId: id,
          paths,
          error: storageError.message,
        });
        storageWarning =
          'La cotización se eliminó, pero algunos archivos requieren limpieza administrativa.';
      }
    }
    return NextResponse.json({ success: true, warning: storageWarning });
  } catch (error) {
    return toErrorResponse(error);
  }
}
