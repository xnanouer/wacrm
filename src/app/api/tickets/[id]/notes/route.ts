import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
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
      .from('ticket_notes')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false });
    if (error)
      return NextResponse.json(
        { error: 'Failed to load ticket notes' },
        { status: 500 }
      );

    const notes = data ?? [];
    const authorIds = [
      ...new Set(notes.map((note) => note.author_user_id).filter(Boolean)),
    ];
    const authors = new Map<
      string,
      { user_id: string; full_name: string; avatar_url: string | null }
    >();

    if (authorIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .eq('account_id', ctx.accountId)
        .in('user_id', authorIds);

      for (const profile of profiles ?? []) {
        authors.set(profile.user_id, profile);
      }
    }

    return NextResponse.json({
      notes: notes.map((note) => ({
        ...note,
        author: authors.get(note.author_user_id) ?? null,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `ticket-note:${ctx.userId}`,
      RATE_LIMITS.ticketAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
    }
    const payload = (await request.json()) as Record<string, unknown>;
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!body || body.length > 5000) {
      return NextResponse.json(
        { error: 'Note must contain 1 to 5000 characters' },
        { status: 400 }
      );
    }

    const { data: ticket } = await ctx.supabase
      .from('conversations')
      .select('id, contact_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!ticket)
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const { data, error } = await ctx.supabase
      .from('ticket_notes')
      .insert({
        account_id: ctx.accountId,
        conversation_id: id,
        contact_id: ticket.contact_id,
        author_user_id: ctx.userId,
        body,
      })
      .select()
      .single();
    if (error)
      return NextResponse.json(
        { error: 'Failed to add ticket note' },
        { status: 403 }
      );

    const { data: author } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    return NextResponse.json(
      { note: { ...data, author: author ?? null } },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
