import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

type AccountContext = Awaited<ReturnType<typeof requireRole>>;

async function deactivateConnection(input: {
  ctx: AccountContext;
  id: string;
  remove: boolean;
}) {
  const { data: connection } = await input.ctx.supabase
    .from('channel_connections')
    .select('id, metadata')
    .eq('id', input.id)
    .eq('account_id', input.ctx.accountId)
    .maybeSingle();
  const metadata =
    connection?.metadata && typeof connection.metadata === 'object'
      ? (connection.metadata as Record<string, unknown>)
      : {};
  if (!connection || typeof metadata.removed_at === 'string') {
    return NextResponse.json({ error: 'Canal no encontrado' }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from('channel_connections')
    .update({
      status: 'disconnected',
      connected_at: null,
      token_expires_at: null,
      metadata: input.remove
        ? {
            ...metadata,
            removed_at: new Date().toISOString(),
            removed_by_user_id: input.ctx.userId,
          }
        : metadata,
    })
    .eq('id', input.id)
    .eq('account_id', input.ctx.accountId);
  if (error) {
    return NextResponse.json(
      {
        error: input.remove
          ? 'No se pudo eliminar la conexión'
          : 'No se pudo desconectar el canal',
      },
      { status: 500 }
    );
  }

  // The row remains as a tombstone so old conversations preserve their
  // channel reference. Its credential is removed and it no longer consumes
  // a plan slot. Reauthorizing the same Meta account safely reuses the row.
  const { error: secretError } = await admin
    .from('channel_connection_secrets')
    .delete()
    .eq('connection_id', input.id)
    .eq('account_id', input.ctx.accountId);
  if (secretError) {
    console.error('[meta connection] secret delete failed:', secretError);
    return NextResponse.json(
      {
        error:
          'La conexión se desactivó, pero la credencial requiere limpieza del servidor',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, removed: input.remove });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `meta-disconnect:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
    } | null;
    if (body?.action !== 'disconnect') {
      return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const { id } = await context.params;
    return deactivateConnection({ ctx, id, remove: false });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `meta-remove:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await context.params;
    return deactivateConnection({ ctx, id, remove: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
