import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from '@/lib/quotes/types';
import { isUuid } from '@/lib/validation/uuid';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    const status = body?.status;
    if (typeof status !== 'string' || !(status in QUOTATION_STATUS_LABELS)) {
      return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
    }
    const ctx = await requireRole('agent');
    const { data, error } = await ctx.supabase.rpc('set_quotation_status', {
      p_quotation_id: id,
      p_status: status as QuotationStatus,
    });
    if (error || !data) {
      return NextResponse.json(
        {
          error: error?.message?.includes('transition')
            ? 'Ese cambio de estado no está permitido.'
            : 'No fue posible cambiar el estado.',
        },
        { status: error?.message?.includes('transition') ? 409 : 400 }
      );
    }
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
