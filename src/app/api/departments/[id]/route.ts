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
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `department-update:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id))
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 80) {
        return NextResponse.json(
          { error: 'Invalid department name' },
          { status: 400 }
        );
      }
      updates.name = name;
    }
    if (body.color !== undefined) {
      if (
        typeof body.color !== 'string' ||
        !/^#[0-9a-fA-F]{6}$/.test(body.color)
      ) {
        return NextResponse.json(
          { error: 'Invalid department color' },
          { status: 400 }
        );
      }
      updates.color = body.color;
    }
    if (typeof body.position === 'number') updates.position = body.position;
    if (typeof body.isActive === 'boolean') updates.is_active = body.isActive;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid changes supplied' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('departments')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select()
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { error: 'Failed to update department' },
        { status: 500 }
      );
    if (!data)
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    return NextResponse.json({ department: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
