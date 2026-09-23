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

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('tags')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('name');
    if (error) {
      return NextResponse.json(
        { error: 'No se pudieron cargar las etiquetas' },
        { status: 500 }
      );
    }
    return NextResponse.json({ tags: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `tag-catalog:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const color = typeof body?.color === 'string' ? body.color : '#10b981';
    if (!name || name.length > 40 || !COLOR_PATTERN.test(color)) {
      return NextResponse.json(
        { error: 'Nombre o color de etiqueta inválido' },
        { status: 400 }
      );
    }

    const { data: duplicate } = await ctx.supabase
      .from('tags')
      .select('id')
      .eq('account_id', ctx.accountId)
      .ilike('name', name)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json(
        { error: 'Ya existe una etiqueta con ese nombre' },
        { status: 409 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('tags')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name,
        color,
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json(
        { error: 'No se pudo crear la etiqueta' },
        { status: 400 }
      );
    }
    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
