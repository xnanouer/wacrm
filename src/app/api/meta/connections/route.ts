import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isMetaConfigured, resolvePublicOrigin } from '@/lib/meta/config';

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
      connections: data ?? [],
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
