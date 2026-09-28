import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  exchangeAuthorizationCode,
  exchangeLongLivedToken,
  fetchInstagramAccount,
  fetchManagedPages,
  subscribePageWebhooks,
} from '@/lib/meta/api';
import {
  metaOAuthRedirectUri,
  metaOAuthScopesFor,
  metaSettingsUrl,
  type MetaOAuthChannel,
} from '@/lib/meta/config';
import {
  META_OAUTH_COOKIE,
  verifyMetaOAuthState,
} from '@/lib/meta/oauth-state';

function settingsRedirect(request: Request, result: string): URL {
  return metaSettingsUrl(request, result);
}

function redirectAndClearState(request: Request, result: string): NextResponse {
  const response = NextResponse.redirect(settingsRedirect(request, result));
  response.cookies.set(META_OAUTH_COOKIE, '', {
    path: '/api/meta/oauth',
    maxAge: 0,
  });
  return response;
}

async function accountHasChannelCapacity(input: {
  admin: ReturnType<typeof supabaseAdmin>;
  accountId: string;
  channel: MetaOAuthChannel;
  externalAccountIds: string[];
}): Promise<boolean> {
  const uniqueExternalIds = [...new Set(input.externalAccountIds)];
  const [accountResult, whatsappResult, socialResult, existingResult] =
    await Promise.all([
      input.admin
        .from('accounts')
        .select('plan_code')
        .eq('id', input.accountId)
        .single(),
      input.admin
        .from('whatsapp_config')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', input.accountId),
      input.admin
        .from('channel_connections')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', input.accountId)
        .neq('status', 'disconnected'),
      uniqueExternalIds.length
        ? input.admin
            .from('channel_connections')
            .select('external_account_id')
            .eq('account_id', input.accountId)
            .eq('channel', input.channel)
            .neq('status', 'disconnected')
            .in('external_account_id', uniqueExternalIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (accountResult.error || !accountResult.data?.plan_code) {
    throw new Error('No se pudo consultar el plan de la empresa');
  }
  if (whatsappResult.error || socialResult.error || existingResult.error) {
    throw new Error('No se pudo calcular el uso de canales');
  }

  const { data: plan, error: planError } = await input.admin
    .from('saas_plans')
    .select('max_channels')
    .eq('code', accountResult.data.plan_code)
    .single();
  if (planError || !plan) {
    throw new Error('No se pudo consultar el límite de canales');
  }
  if (plan.max_channels === null) return true;

  const alreadyActive = new Set(
    (existingResult.data ?? []).map((row) => row.external_account_id)
  ).size;
  const requestedNew = Math.max(0, uniqueExternalIds.length - alreadyActive);
  const current = (whatsappResult.count ?? 0) + (socialResult.count ?? 0);
  return current + requestedNew <= Number(plan.max_channels);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const cookieStore = await cookies();
  const nonce = cookieStore.get(META_OAUTH_COOKIE)?.value;

  if (oauthError) {
    return redirectAndClearState(request, 'cancelled');
  }
  if (!code || !stateToken || !nonce) {
    return redirectAndClearState(request, 'invalid_state');
  }

  const state = verifyMetaOAuthState(stateToken, nonce);
  if (!state) {
    return redirectAndClearState(request, 'invalid_state');
  }

  try {
    const ctx = await requireRole('admin');
    if (ctx.accountId !== state.accountId || ctx.userId !== state.userId) {
      return redirectAndClearState(request, 'invalid_state');
    }

    const shortToken = await exchangeAuthorizationCode({
      code,
      redirectUri: metaOAuthRedirectUri(request),
    });
    let userToken = shortToken;
    try {
      userToken = await exchangeLongLivedToken(shortToken.accessToken);
    } catch (error) {
      console.warn(
        '[meta oauth] no se pudo extender el token; se usará el token original:',
        error instanceof Error ? error.message : error
      );
    }

    const pages = await fetchManagedPages(userToken.accessToken);
    if (pages.length === 0) {
      return redirectAndClearState(request, 'no_pages');
    }

    const admin = supabaseAdmin();
    const selectedPages =
      state.channel === 'facebook'
        ? pages
        : pages.filter((page) => page.instagram_business_account?.id);
    if (selectedPages.length === 0) {
      return redirectAndClearState(
        request,
        state.channel === 'instagram' ? 'no_instagram_accounts' : 'no_pages'
      );
    }

    const externalAccountIds = selectedPages.map((page) =>
      state.channel === 'facebook'
        ? page.id
        : page.instagram_business_account!.id
    );
    const hasCapacity = await accountHasChannelCapacity({
      admin,
      accountId: ctx.accountId,
      channel: state.channel,
      externalAccountIds,
    });
    if (!hasCapacity) {
      return redirectAndClearState(request, 'plan_limit');
    }

    const tokenExpiresAt = userToken.expiresIn
      ? new Date(Date.now() + userToken.expiresIn * 1000).toISOString()
      : null;
    let facebookCount = 0;
    let instagramCount = 0;
    let warningCount = 0;
    const grantedScopes = [...metaOAuthScopesFor(state.channel)];

    for (const page of selectedPages) {
      let subscribed = false;
      let subscriptionError: string | null = null;
      try {
        subscribed = await subscribePageWebhooks({
          pageId: page.id,
          pageAccessToken: page.access_token,
        });
      } catch (error) {
        subscriptionError =
          error instanceof Error ? error.message : 'No se pudo suscribir';
        warningCount += 1;
      }

      if (state.channel === 'facebook') {
        const { data: facebookConnection, error: facebookError } = await admin
          .from('channel_connections')
          .upsert(
            {
              account_id: ctx.accountId,
              channel: 'facebook',
              external_account_id: page.id,
              display_name: page.name,
              status: subscribed ? 'connected' : 'error',
              scopes: grantedScopes,
              metadata: {
                page_id: page.id,
                tasks: page.tasks ?? [],
                webhook_subscribed: subscribed,
                subscription_error: subscriptionError,
                auth_flow: 'facebook_login_for_business',
              },
              connected_at: subscribed ? new Date().toISOString() : null,
              token_expires_at: tokenExpiresAt,
              created_by_user_id: ctx.userId,
            },
            { onConflict: 'account_id,channel,external_account_id' }
          )
          .select('id')
          .single();
        if (facebookError || !facebookConnection) {
          throw facebookError ?? new Error('No se pudo guardar la página');
        }
        const { error: facebookSecretError } = await admin
          .from('channel_connection_secrets')
          .upsert({
            connection_id: facebookConnection.id,
            account_id: ctx.accountId,
            access_token: encrypt(page.access_token),
            refresh_token: null,
          });
        if (facebookSecretError) {
          throw new Error(
            `No se pudo guardar la credencial de ${page.name}: ${facebookSecretError.message}`
          );
        }
        facebookCount += 1;
        continue;
      }

      const instagramId = page.instagram_business_account?.id;
      if (!instagramId) continue;

      let instagramProfile: Awaited<ReturnType<typeof fetchInstagramAccount>> =
        {
          id: instagramId,
        };
      try {
        instagramProfile = await fetchInstagramAccount({
          instagramId,
          pageAccessToken: page.access_token,
        });
      } catch (error) {
        console.warn(
          `[meta oauth] perfil de Instagram ${instagramId} no disponible:`,
          error instanceof Error ? error.message : error
        );
      }

      const instagramName =
        instagramProfile.username ||
        instagramProfile.name ||
        `Instagram ${instagramId}`;
      const { data: instagramConnection, error: instagramError } = await admin
        .from('channel_connections')
        .upsert(
          {
            account_id: ctx.accountId,
            channel: 'instagram',
            external_account_id: instagramId,
            display_name: instagramName,
            status: subscribed ? 'connected' : 'error',
            scopes: grantedScopes,
            metadata: {
              parent_page_id: page.id,
              parent_page_name: page.name,
              username: instagramProfile.username ?? null,
              profile_picture_url: instagramProfile.profile_picture_url ?? null,
              webhook_subscribed: subscribed,
              subscription_error: subscriptionError,
              subscription_method: 'linked_facebook_page',
              auth_flow: 'facebook_login',
            },
            connected_at: subscribed ? new Date().toISOString() : null,
            token_expires_at: tokenExpiresAt,
            created_by_user_id: ctx.userId,
          },
          { onConflict: 'account_id,channel,external_account_id' }
        )
        .select('id')
        .single();
      if (instagramError || !instagramConnection) {
        throw new Error(
          `No se pudo guardar Instagram ${instagramName}: ${instagramError?.message ?? 'sin datos'}`
        );
      }
      const { error: instagramSecretError } = await admin
        .from('channel_connection_secrets')
        .upsert({
          connection_id: instagramConnection.id,
          account_id: ctx.accountId,
          access_token: encrypt(page.access_token),
          refresh_token: null,
        });
      if (instagramSecretError) {
        throw new Error(
          `No se pudo guardar la credencial de Instagram ${instagramName}: ${instagramSecretError.message}`
        );
      }
      instagramCount += 1;
    }

    const responseUrl = settingsRedirect(
      request,
      warningCount > 0
        ? 'connected_with_warnings'
        : `connected_${state.channel}`
    );
    responseUrl.searchParams.set('facebook', String(facebookCount));
    responseUrl.searchParams.set('instagram', String(instagramCount));
    const response = NextResponse.redirect(responseUrl);
    response.cookies.set(META_OAUTH_COOKIE, '', {
      path: '/api/meta/oauth',
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error('[meta oauth] callback failed:', error);
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
    if (
      message.includes('idx_channel_connections_active_external_unique') ||
      message.includes('duplicate key')
    ) {
      return redirectAndClearState(request, 'already_connected_elsewhere');
    }
    if (message.includes('PLAN_CHANNEL_LIMIT_REACHED')) {
      return redirectAndClearState(request, 'plan_limit');
    }
    return redirectAndClearState(request, 'failed');
  }
}
