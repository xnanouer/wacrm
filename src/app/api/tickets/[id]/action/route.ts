import { after, NextResponse } from 'next/server';

import { analyzeHumanConversation } from '@/lib/ai/coach';
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

export const maxDuration = 60;

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
    if (input.action === 'resolve') {
      after(async () => {
        try {
          await analyzeHumanConversation({
            accountId: ctx.accountId,
            conversationId: id,
            triggeredByUserId: ctx.userId,
            triggerType: 'ticket_closed',
          });
        } catch (error) {
          // Coaching is advisory: a provider or points failure must never
          // roll back a successfully resolved customer conversation.
          console.error('[ai coach] automatic analysis failed:', error);
        }
      });
    }
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
