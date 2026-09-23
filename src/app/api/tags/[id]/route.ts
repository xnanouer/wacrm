import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `tag-catalog:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const updates: Record<string, string> = {};
    if (body?.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 40) {
        return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
      }
      updates.name = name;
    }
    if (body?.color !== undefined) {
      const color = typeof body.color === 'string' ? body.color : '';
      if (!COLOR_PATTERN.test(color)) {
        return NextResponse.json({ error: 'Color inválido' }, { status: 400 });
      }
      updates.color = color;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No hay cambios válidos' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('tags')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select()
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: 'No se pudo actualizar la etiqueta' },
        { status: error ? 400 : 404 }
      );
    }
    return NextResponse.json({ tag: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `tag-catalog:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 });
    }
    const { error } = await ctx.supabase
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (error) {
      return NextResponse.json(
        { error: 'No se pudo eliminar la etiqueta' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
