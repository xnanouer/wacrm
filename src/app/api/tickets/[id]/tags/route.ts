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

async function visibleTicket(
  ctx: Awaited<ReturnType<typeof getCurrentAccount>>,
  ticketId: string
) {
  const { data } = await ctx.supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('id', ticketId)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  return data;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Ticket inválido' }, { status: 400 });
    }
    const ticket = await visibleTicket(ctx, id);
    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket no encontrado' },
        { status: 404 }
      );
    }

    const [
      { data: catalog, error: catalogError },
      { data: applied, error: appliedError },
    ] = await Promise.all([
      ctx.supabase
        .from('tags')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('name'),
      ctx.supabase
        .from('contact_tags')
        .select('id, tag_id, tags(*)')
        .eq('contact_id', ticket.contact_id),
    ]);
    if (catalogError || appliedError) {
      return NextResponse.json(
        { error: 'No se pudieron cargar las etiquetas del ticket' },
        { status: 500 }
      );
    }
    return NextResponse.json({ tags: catalog ?? [], applied: applied ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `ticket-tag:${ctx.userId}`,
      RATE_LIMITS.ticketAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Ticket inválido' }, { status: 400 });
    }
    const payload = (await request.json().catch(() => null)) as {
      tagId?: unknown;
      applied?: unknown;
    } | null;
    if (!isUuid(payload?.tagId) || typeof payload?.applied !== 'boolean') {
      return NextResponse.json(
        { error: 'Etiqueta o acción inválida' },
        { status: 400 }
      );
    }
    const ticket = await visibleTicket(ctx, id);
    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket no encontrado' },
        { status: 404 }
      );
    }
    const { data: tag } = await ctx.supabase
      .from('tags')
      .select('id')
      .eq('id', payload.tagId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!tag) {
      return NextResponse.json(
        { error: 'Etiqueta no encontrada' },
        { status: 404 }
      );
    }

    if (payload.applied) {
      const { error } = await ctx.supabase.from('contact_tags').insert({
        contact_id: ticket.contact_id,
        tag_id: payload.tagId,
      });
      if (error && error.code !== '23505') {
        return NextResponse.json(
          { error: 'No tienes permiso para etiquetar este ticket' },
          { status: 403 }
        );
      }
    } else {
      const { error } = await ctx.supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', ticket.contact_id)
        .eq('tag_id', payload.tagId);
      if (error) {
        return NextResponse.json(
          { error: 'No tienes permiso para quitar esta etiqueta' },
          { status: 403 }
        );
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
