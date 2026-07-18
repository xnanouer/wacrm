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

function departmentSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('departments')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('position')
      .order('name');
    if (error) {
      console.error('[GET /api/departments]', error);
      return NextResponse.json(
        { error: 'Failed to load departments' },
        { status: 500 }
      );
    }
    return NextResponse.json({ departments: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `department-create:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const color = typeof body.color === 'string' ? body.color : '#64748b';
    if (!name || name.length > 80) {
      return NextResponse.json(
        { error: 'Name must contain 1 to 80 characters' },
        { status: 400 }
      );
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json(
        { error: 'Invalid department color' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('departments')
      .insert({
        account_id: ctx.accountId,
        name,
        slug: departmentSlug(name),
        color,
        position: typeof body.position === 'number' ? body.position : 100,
        created_by_user_id: ctx.userId,
      })
      .select()
      .single();
    if (error) {
      const duplicate = error.code === '23505';
      return NextResponse.json(
        {
          error: duplicate
            ? 'A department with that name already exists'
            : 'Failed to create department',
        },
        { status: duplicate ? 409 : 500 }
      );
    }
    return NextResponse.json({ department: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
