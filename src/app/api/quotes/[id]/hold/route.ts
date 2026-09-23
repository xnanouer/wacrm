import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
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
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
      reason?: unknown;
    } | null;
    const enabled = body?.enabled === true;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (enabled && !reason) {
      return NextResponse.json(
        { error: 'Indica el motivo de la protección.' },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('quotations')
      .update({
        deletion_hold: enabled,
        deletion_hold_reason: enabled ? reason : null,
        updated_by_user_id: ctx.userId,
      })
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .select('id, deletion_hold, deletion_hold_reason')
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: 'No fue posible actualizar la protección.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, quotation: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
