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
import { hasMinRole } from '@/lib/auth/roles';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const searchParams = new URL(request.url).searchParams;
    const departmentId = searchParams.get('departmentId');
    const mine = searchParams.get('mine') === 'true';
    if (departmentId && !isUuid(departmentId)) {
      return NextResponse.json(
        { error: 'Invalid departmentId' },
        { status: 400 }
      );
    }
    let query = ctx.supabase
      .from('quick_replies')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('title');
    if (mine) {
      query = query
        .eq('visibility', 'personal')
        .eq('created_by_user_id', ctx.userId);
    } else {
      query = query.eq('is_active', true);
    }
    if (departmentId && !mine)
      query = query.or(
        `department_id.is.null,department_id.eq.${departmentId}`
      );
    const { data, error } = await query;
    if (error)
      return NextResponse.json(
        { error: 'Failed to load quick replies' },
        { status: 500 }
      );
    return NextResponse.json({ quickReplies: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quick-reply:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    const shortcut =
      typeof body.shortcut === 'string' && body.shortcut.trim()
        ? body.shortcut.trim()
        : null;
    const departmentId = body.departmentId ?? null;
    const visibility = body.visibility === 'personal' ? 'personal' : 'shared';
    if (!title || title.length > 80 || !text || text.length > 4000) {
      return NextResponse.json(
        { error: 'Invalid quick reply' },
        { status: 400 }
      );
    }
    if (shortcut && !/^\/[a-z0-9_-]{1,30}$/.test(shortcut)) {
      return NextResponse.json(
        { error: 'Shortcut must look like /saludo' },
        { status: 400 }
      );
    }
    if (departmentId !== null && !isUuid(departmentId)) {
      return NextResponse.json(
        { error: 'Invalid departmentId' },
        { status: 400 }
      );
    }
    if (visibility === 'shared' && !hasMinRole(ctx.role, 'supervisor')) {
      return NextResponse.json(
        { error: 'Los agentes solo pueden crear respuestas personales' },
        { status: 403 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('quick_replies')
      .insert({
        account_id: ctx.accountId,
        department_id: visibility === 'personal' ? null : departmentId,
        title,
        shortcut,
        body: text,
        created_by_user_id: ctx.userId,
        visibility,
      })
      .select()
      .single();
    if (error)
      return NextResponse.json(
        { error: 'Failed to create quick reply' },
        { status: 403 }
      );
    return NextResponse.json({ quickReply: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
