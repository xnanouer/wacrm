import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quick-reply:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 80)
        return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
      updates.title = title;
    }
    if (body.body !== undefined) {
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (!text || text.length > 4000)
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
      updates.body = text;
    }
    if (body.shortcut !== undefined) {
      const shortcut =
        body.shortcut === null
          ? null
          : typeof body.shortcut === 'string'
            ? body.shortcut.trim()
            : '';
      if (shortcut && !/^\/[a-z0-9_-]{1,30}$/.test(shortcut)) {
        return NextResponse.json(
          { error: 'Invalid shortcut' },
          { status: 400 }
        );
      }
      updates.shortcut = shortcut || null;
    }
    if (body.departmentId !== undefined) {
      if (body.departmentId !== null && !isUuid(body.departmentId)) {
        return NextResponse.json(
          { error: 'Invalid departmentId' },
          { status: 400 }
        );
      }
      updates.department_id = body.departmentId;
    }
    if (typeof body.isActive === 'boolean') updates.is_active = body.isActive;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid changes supplied' },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase
      .from('quick_replies')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select()
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { error: 'Failed to update quick reply' },
        { status: 403 }
      );
    if (!data)
      return NextResponse.json(
        { error: 'Quick reply not found' },
        { status: 404 }
      );
    return NextResponse.json({ quickReply: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quick-reply:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const { error } = await ctx.supabase
      .from('quick_replies')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (error)
      return NextResponse.json(
        { error: 'Failed to delete quick reply' },
        { status: 403 }
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
