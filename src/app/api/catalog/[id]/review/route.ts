import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

type ReviewDecision = 'approved' | 'rejected';

function reviewError(error: { code?: string; message?: string }): NextResponse {
  const message = error.message ?? '';

  if (message.includes('catalog_item_not_found') || error.code === 'P0002') {
    return NextResponse.json(
      { error: 'El vehículo ya no existe.' },
      { status: 404 }
    );
  }
  if (message.includes('catalog_review_forbidden') || error.code === '42501') {
    return NextResponse.json(
      { error: 'No tienes permiso para revisar esta unidad.' },
      { status: 403 }
    );
  }
  if (message.includes('catalog_item_not_pending')) {
    return NextResponse.json(
      { error: 'Esta solicitud ya fue revisada o dejó de estar pendiente.' },
      { status: 409 }
    );
  }
  if (message.includes('catalog_rejection_reason_required')) {
    return NextResponse.json(
      { error: 'Escribe el motivo del rechazo.' },
      { status: 400 }
    );
  }

  console.error('[catalog] review failed:', error);
  return NextResponse.json(
    { error: 'No fue posible guardar la revisión.' },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Vehículo inválido.' },
        { status: 400 }
      );
    }

    const limit = checkRateLimit(
      `catalog-review:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      decision?: unknown;
      reason?: unknown;
    } | null;
    const decision = body?.decision;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json(
        { error: 'Decisión de revisión inválida.' },
        { status: 400 }
      );
    }
    if (decision === 'rejected' && !reason) {
      return NextResponse.json(
        { error: 'Escribe el motivo del rechazo.' },
        { status: 400 }
      );
    }
    if (reason.length > 3000) {
      return NextResponse.json(
        { error: 'El comentario no puede superar los 3.000 caracteres.' },
        { status: 400 }
      );
    }

    const { error } = await ctx.supabase.rpc('review_catalog_item', {
      p_catalog_item_id: id,
      p_decision: decision satisfies ReviewDecision,
      p_reason: reason || null,
    });
    if (error) return reviewError(error);

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
