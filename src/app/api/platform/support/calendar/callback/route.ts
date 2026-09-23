import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import { exchangeGoogleCode } from '@/lib/platform-support/calendar';
import { encrypt } from '@/lib/whatsapp/encryption';

export async function GET(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)nexora_google_oauth_state=([^;]+)/)?.[1];
    if (
      !code ||
      !state ||
      !cookieState ||
      decodeURIComponent(cookieState) !== state
    ) {
      return NextResponse.redirect(
        new URL('/platform/support?calendar=invalid_state', url.origin)
      );
    }
    const tokens = await exchangeGoogleCode(code, url.origin);
    const userInfoResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );
    const userInfo = userInfoResponse.ok
      ? ((await userInfoResponse.json()) as { email?: string })
      : {};
    const admin = supabaseAdmin();
    const { data: existing } = await admin
      .from('platform_support_settings')
      .select('encrypted_refresh_token')
      .eq('id', 1)
      .single();
    const { error } = await admin
      .from('platform_support_settings')
      .update({
        encrypted_access_token: encrypt(tokens.access_token!),
        encrypted_refresh_token: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : existing?.encrypted_refresh_token,
        access_token_expires_at: new Date(
          Date.now() + (tokens.expires_in ?? 3600) * 1000
        ).toISOString(),
        google_account_email: userInfo.email ?? null,
        google_calendar_id: 'primary',
        connected_at: new Date().toISOString(),
        updated_by: actor.userId,
      })
      .eq('id', 1);
    if (error) throw error;
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.support_calendar_connected',
      next_data: { email: userInfo.email ?? null },
      reason: 'Conexión OAuth autorizada por el propietario',
    });
    const response = NextResponse.redirect(
      new URL('/platform/support?calendar=connected', url.origin)
    );
    response.cookies.delete('nexora_google_oauth_state');
    return response;
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
