import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  parseCatalogVehicleInput,
  toCatalogVehiclePayload,
} from '@/lib/catalog/payload';
import { loadCatalogData } from '@/lib/catalog/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

function catalogMutationError(error: {
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
  if (message.includes('catalog_capacity_reached')) {
    return NextResponse.json(
      {
        error: 'Alcanzaste el límite de unidades activas de tu catálogo.',
        code: 'capacity_reached',
      },
      { status: 409 }
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
  console.error('[catalog] mutation failed:', error);
  return NextResponse.json(
    { error: 'No fue posible guardar el vehículo.' },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const catalog = await loadCatalogData(ctx);
    return NextResponse.json(catalog);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `catalog-create:${ctx.userId}`,
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
    const { data, error } = await ctx.supabase.rpc('create_catalog_vehicle', {
      p_payload: toCatalogVehiclePayload(parsed.value),
      p_confirm_possible_duplicate: confirmDuplicate,
    });
    if (error) return catalogMutationError(error);

    return NextResponse.json({ id: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
