import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

function submitError(error: { code?: string; message?: string }): NextResponse {
  const message = error.message ?? '';

  if (message.includes('catalog_item_not_found') || error.code === 'P0002') {
    return NextResponse.json(
      { error: 'El vehículo ya no existe.' },
      { status: 404 }
    );
  }
  if (message.includes('catalog_item_forbidden') || error.code === '42501') {
    return NextResponse.json(
      { error: 'No tienes permiso para enviar esta unidad.' },
      { status: 403 }
    );
  }
  if (message.includes('catalog_item_must_be_draft')) {
    return NextResponse.json(
      { error: 'Solo los borradores pueden enviarse a aprobación.' },
      { status: 409 }
    );
  }
  if (message.includes('catalog_primary_image_required')) {
    return NextResponse.json(
      {
        error:
          'Agrega al menos una fotografía principal antes de solicitar la aprobación.',
        code: 'primary_image_required',
      },
      { status: 409 }
    );
  }
  if (message.includes('catalog_vehicle_details_required')) {
    return NextResponse.json(
      { error: 'Completa la ficha del vehículo antes de enviarla.' },
      { status: 409 }
    );
  }

  console.error('[catalog] submit for approval failed:', error);
  return NextResponse.json(
    { error: 'No fue posible enviar el vehículo a aprobación.' },
    { status: 500 }
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Vehículo inválido.' },
        { status: 400 }
      );
    }

    const limit = checkRateLimit(
      `catalog-submit:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { error } = await ctx.supabase.rpc('submit_catalog_item', {
      p_catalog_item_id: id,
    });
    if (error) return submitError(error);

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
