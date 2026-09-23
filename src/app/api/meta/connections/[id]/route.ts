import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `meta-disconnect:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await context.params;
    const { data: connection } = await ctx.supabase
      .from('channel_connections')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!connection) {
      return NextResponse.json(
        { error: 'Canal no encontrado' },
        { status: 404 }
      );
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from('channel_connections')
      .update({
        status: 'disconnected',
        connected_at: null,
        token_expires_at: null,
      })
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (error) {
      return NextResponse.json(
        { error: 'No se pudo desconectar el canal' },
        { status: 500 }
      );
    }

    // Disable routing before deleting the credential. If the second step
    // fails, the token remains encrypted at rest but the channel can no
    // longer receive or send messages as an active tenant connection.
    const { error: secretError } = await admin
      .from('channel_connection_secrets')
      .delete()
      .eq('connection_id', id)
      .eq('account_id', ctx.accountId);
    if (secretError) {
      console.error('[meta disconnect] secret delete failed:', secretError);
      return NextResponse.json(
        {
          error:
            'El canal fue desconectado, pero la credencial requiere limpieza del servidor',
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
