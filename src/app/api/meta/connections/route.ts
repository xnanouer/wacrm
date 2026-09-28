import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { subscribePageWebhooks } from '@/lib/meta/api';
import {
  isMetaConfigured,
  resolvePublicOrigin,
  type MetaOAuthChannel,
} from '@/lib/meta/config';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('channel_connections')
      .select(
        'id, channel, external_account_id, display_name, status, scopes, metadata, connected_at, token_expires_at, created_at, updated_at'
      )
      .eq('account_id', ctx.accountId)
      .order('channel')
      .order('display_name');
    if (error) {
      console.error('[GET /api/meta/connections]', error);
      return NextResponse.json(
        { error: 'No se pudieron cargar los canales' },
        { status: 500 }
      );
    }
    const origin = resolvePublicOrigin(request);
    return NextResponse.json({
      connections: (data ?? []).filter((connection) => {
        const metadata =
          connection.metadata && typeof connection.metadata === 'object'
            ? (connection.metadata as Record<string, unknown>)
            : {};
        return typeof metadata.removed_at !== 'string';
      }),
      configuration: {
        configured: isMetaConfigured(),
        webhookTokenConfigured: Boolean(
          process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()
        ),
        oauthCallbackUrl: `${origin}/api/meta/oauth/callback`,
        webhookUrl: `${origin}/api/meta/webhook`,
      },
      canEdit: ctx.role === 'owner' || ctx.role === 'admin',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    const admin = supabaseAdmin();
    const { data: connections, error } = await admin
      .from('channel_connections')
      .select('id, channel, external_account_id, metadata')
      .eq('account_id', ctx.accountId)
      .eq('status', 'connected')
      .in('channel', ['facebook', 'instagram']);
    if (error) throw error;

    let updated = 0;
    let failed = 0;
    for (const connection of connections ?? []) {
      const channel = connection.channel as MetaOAuthChannel;
      const metadata =
        connection.metadata && typeof connection.metadata === 'object'
          ? (connection.metadata as Record<string, unknown>)
          : {};
      const pageId =
        channel === 'facebook'
          ? connection.external_account_id
          : typeof metadata.parent_page_id === 'string'
            ? metadata.parent_page_id
            : null;
      const { data: secret } = await admin
        .from('channel_connection_secrets')
        .select('access_token')
        .eq('account_id', ctx.accountId)
        .eq('connection_id', connection.id)
        .maybeSingle();

      let subscribed = false;
      let subscriptionError: string | null = null;
      try {
        if (!pageId || !secret?.access_token) {
          throw new Error('Falta la página asociada o su credencial');
        }
        subscribed = await subscribePageWebhooks({
          pageId,
          pageAccessToken: decrypt(secret.access_token),
          channel,
        });
        if (!subscribed) throw new Error('Meta no confirmó la suscripción');
        updated += 1;
      } catch (syncError) {
        failed += 1;
        subscriptionError =
          syncError instanceof Error ? syncError.message : 'Error inesperado';
      }

      await admin
        .from('channel_connections')
        .update({
          metadata: {
            ...metadata,
            webhook_subscribed: subscribed,
            webhook_fields:
              channel === 'facebook'
                ? ['messages', 'message_deliveries', 'message_reads']
                : ['messages'],
            webhook_synced_at: new Date().toISOString(),
            subscription_error: subscriptionError,
          },
        })
        .eq('id', connection.id)
        .eq('account_id', ctx.accountId);
    }

    return NextResponse.json({ updated, failed });
  } catch (error) {
    return toErrorResponse(error);
  }
}
