import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { CATALOG_STATUSES } from '@/lib/catalog/config';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

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
      `catalog-status:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    if (
      !body ||
      typeof body.status !== 'string' ||
      !(CATALOG_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
    }

    const { error } = await ctx.supabase.rpc('set_catalog_item_status', {
      p_catalog_item_id: id,
      p_status: body.status,
    });
    if (error) {
      console.error('[catalog] status update failed:', error);
      return NextResponse.json(
        { error: 'No fue posible cambiar el estado del vehículo.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
