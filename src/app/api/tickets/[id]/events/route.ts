import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { isUuid } from '@/lib/validation/uuid';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
    }
    const { data, error } = await ctx.supabase
      .from('ticket_events')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error)
      return NextResponse.json(
        { error: 'Failed to load ticket history' },
        { status: 500 }
      );

    const events = data ?? [];
    const actorIds = [
      ...new Set(
        events
          .map((event) => event.actor_user_id)
          .filter((actorId): actorId is string => Boolean(actorId))
      ),
    ];
    const actors = new Map<
      string,
      { user_id: string; full_name: string; avatar_url: string | null }
    >();

    if (actorIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .eq('account_id', ctx.accountId)
        .in('user_id', actorIds);

      for (const profile of profiles ?? []) {
        actors.set(profile.user_id, profile);
      }
    }

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        actor: event.actor_user_id
          ? (actors.get(event.actor_user_id) ?? null)
          : null,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
