import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { buildMetaAuthorizationUrl } from '@/lib/meta/api';
import {
  getMetaWebhookVerifyToken,
  isMetaOAuthChannel,
  metaOAuthRedirectUri,
  metaSettingsUrl,
} from '@/lib/meta/config';
import {
  createMetaOAuthState,
  META_OAUTH_COOKIE,
  META_OAUTH_TTL_SECONDS,
} from '@/lib/meta/oauth-state';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const channel = new URL(request.url).searchParams.get('channel');
    if (!isMetaOAuthChannel(channel)) {
      return NextResponse.redirect(metaSettingsUrl(request, 'invalid_channel'));
    }
    getMetaWebhookVerifyToken();
    const limit = checkRateLimit(
      `meta-oauth:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { token, nonce } = createMetaOAuthState({
      accountId: ctx.accountId,
      userId: ctx.userId,
      channel,
    });
    const redirectUri = metaOAuthRedirectUri(request);
    const authorizationUrl = buildMetaAuthorizationUrl({
      redirectUri,
      state: token,
      channel,
    });

    const cookieStore = await cookies();
    cookieStore.set(META_OAUTH_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(redirectUri).protocol === 'https:',
      path: '/api/meta/oauth',
      maxAge: META_OAUTH_TTL_SECONDS,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      /META_(?:APP_|WEBHOOK_)|Meta (?:no|webhook no)/.test(error.message)
    ) {
      return NextResponse.redirect(
        metaSettingsUrl(request, 'not_configured')
      );
    }
    return toErrorResponse(error);
  }
}
