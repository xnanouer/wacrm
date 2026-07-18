import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  parseTicketAction,
  runTicketAction,
  TicketActionError,
} from '@/lib/tickets/actions';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `ticket-action:${ctx.userId}`,
      RATE_LIMITS.ticketAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
    }
    const input = parseTicketAction(await request.json());
    const ticket = await runTicketAction(ctx.supabase, id, input);
    return NextResponse.json({ ticket });
  } catch (error) {
    if (error instanceof TicketActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
