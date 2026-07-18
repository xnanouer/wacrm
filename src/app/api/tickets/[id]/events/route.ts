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
    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
