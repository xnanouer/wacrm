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
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const { data, error } = await ctx.supabase
      .from('department_members')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('department_id', id)
      .eq('is_active', true);
    if (error)
      return NextResponse.json(
        { error: 'Failed to load department members' },
        { status: 500 }
      );
    return NextResponse.json({ members: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `department-member:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const memberRole =
      body.memberRole === 'supervisor' ? 'supervisor' : 'member';
    if (!isUuid(userId))
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });

    const { data, error } = await ctx.supabase
      .from('department_members')
      .upsert(
        {
          account_id: ctx.accountId,
          department_id: id,
          user_id: userId,
          member_role: memberRole,
          is_active: true,
        },
        { onConflict: 'department_id,user_id' }
      )
      .select()
      .single();
    if (error)
      return NextResponse.json(
        { error: 'Failed to add department member' },
        { status: 400 }
      );
    return NextResponse.json({ member: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `department-member:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const userId = new URL(request.url).searchParams.get('userId');
    if (!isUuid(userId))
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
    const { error } = await ctx.supabase
      .from('department_members')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('department_id', id)
      .eq('user_id', userId);
    if (error)
      return NextResponse.json(
        { error: 'Failed to remove department member' },
        { status: 500 }
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
