import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
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

function deleteError(error: { message?: string }): NextResponse {
  const message = error.message ?? '';
  if (message.includes('catalog_vehicle_not_found')) {
    return NextResponse.json(
      { error: 'El vehículo ya no existe.' },
      { status: 404 }
    );
  }
  if (message.includes('catalog_vehicle_delete_forbidden')) {
    return NextResponse.json(
      { error: 'Solo un administrador puede eliminar vehículos.' },
      { status: 403 }
    );
  }
  console.error('[catalog] permanent deletion failed:', error);
  return NextResponse.json(
    { error: 'No fue posible eliminar el vehículo.' },
    { status: 500 }
  );
}

export async function DELETE(
  _request: Request,
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
      `catalog-delete:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { data, error } = await ctx.supabase.rpc('delete_catalog_vehicle', {
      p_catalog_item_id: id,
    });
    if (error) return deleteError(error);

    const result = data as { storagePaths?: unknown } | null;
    const storagePaths = Array.isArray(result?.storagePaths)
      ? result.storagePaths.filter(
          (path): path is string => typeof path === 'string' && path.length > 0
        )
      : [];

    let warning: string | undefined;
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin()
        .storage.from('catalog-media')
        .remove(storagePaths);
      if (storageError) {
        console.error('[catalog] deleted item but media cleanup failed:', {
          id,
          accountId: ctx.accountId,
          storageError,
        });
        warning =
          'El vehículo fue eliminado, pero algunas fotografías requieren limpieza interna.';
      }
    }

    return NextResponse.json({ deleted: true, warning });
  } catch (error) {
    return toErrorResponse(error);
  }
}
