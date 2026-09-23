import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  parseCatalogVehicleInput,
  toCatalogVehiclePayload,
} from '@/lib/catalog/payload';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

function mutationError(error: {
  code?: string;
  message?: string;
}): NextResponse {
  const message = error.message ?? '';
  if (message.includes('catalog_possible_duplicate')) {
    return NextResponse.json(
      {
        error: 'Ya existe una unidad con la misma patente.',
        code: 'possible_duplicate',
      },
      { status: 409 }
    );
  }
  if (message.includes('catalog_update_forbidden')) {
    return NextResponse.json(
      { error: 'No tienes permiso para editar esta unidad.' },
      { status: 403 }
    );
  }
  if (error.code === '23505') {
    return NextResponse.json(
      {
        error: 'El código interno ya está siendo utilizado.',
        code: 'duplicate_code',
      },
      { status: 409 }
    );
  }
  console.error('[catalog] update failed:', error);
  return NextResponse.json(
    { error: 'No fue posible actualizar el vehículo.' },
    { status: 500 }
  );
}

export async function PATCH(
  request: Request,
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
      `catalog-update:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const parsed = parseCatalogVehicleInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const confirmDuplicate = Boolean(
      body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>).confirmDuplicate
    );
    const { data, error } = await ctx.supabase.rpc('update_catalog_vehicle', {
      p_catalog_item_id: id,
      p_payload: toCatalogVehiclePayload(parsed.value),
      p_confirm_possible_duplicate: confirmDuplicate,
    });
    if (error) return mutationError(error);

    return NextResponse.json({ id: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
