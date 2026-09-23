import crypto from 'crypto';

import {
  getMetaServerConfig,
  metaOAuthScopesFor,
  type MetaOAuthChannel,
} from './config';

const REQUEST_TIMEOUT_MS = 20_000;

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

interface MetaErrorPayload {
  error?: { message?: string; code?: number };
}

async function metaFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as T &
    MetaErrorPayload;
  if (!response.ok || payload.error) {
    throw new MetaApiError(
      payload.error?.message || `Meta API respondió ${response.status}`,
      response.status,
      payload.error?.code
    );
  }
  return payload;
}

function graphUrl(path: string): string {
  const { graphVersion } = getMetaServerConfig();
  return `https://graph.facebook.com/${graphVersion}/${path.replace(/^\//, '')}`;
}

function appSecretProof(token: string): string {
  return crypto
    .createHmac('sha256', getMetaServerConfig().appSecret)
    .update(token)
    .digest('hex');
}

function authorizedParams(token: string): URLSearchParams {
  return new URLSearchParams({
    access_token: token,
    appsecret_proof: appSecretProof(token),
  });
}

export function buildMetaAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
  channel: MetaOAuthChannel;
}): string {
  const config = getMetaServerConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: 'code',
    scope: metaOAuthScopesFor(input.channel).join(','),
  });
  if (config.loginConfigId) {
    params.set('config_id', config.loginConfigId);
    params.set('override_default_response_type', 'true');
  }
  return `https://www.facebook.com/${config.graphVersion}/dialog/oauth?${params}`;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; expiresIn?: number }> {
  const config = getMetaServerConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const payload = await metaFetch<{
    access_token: string;
    expires_in?: number;
  }>(`${graphUrl('oauth/access_token')}?${params}`);
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
  };
}

export async function exchangeLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const config = getMetaServerConfig();
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const payload = await metaFetch<{
    access_token: string;
    expires_in?: number;
  }>(`${graphUrl('oauth/access_token')}?${params}`);
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
  };
}

export interface ManagedMetaPage {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: { id: string };
}

export async function fetchManagedPages(
  userAccessToken: string
): Promise<ManagedMetaPage[]> {
  const params = authorizedParams(userAccessToken);
  params.set('fields', 'id,name,access_token,tasks,instagram_business_account');
  params.set('limit', '100');
  const payload = await metaFetch<{ data?: ManagedMetaPage[] }>(
    `${graphUrl('me/accounts')}?${params}`
  );
  return payload.data ?? [];
}

export async function fetchInstagramAccount(input: {
  instagramId: string;
  pageAccessToken: string;
}): Promise<{
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}> {
  const params = authorizedParams(input.pageAccessToken);
  params.set('fields', 'id,username,name,profile_picture_url');
  return metaFetch(`${graphUrl(input.instagramId)}?${params}`);
}

export async function subscribePageWebhooks(input: {
  pageId: string;
  pageAccessToken: string;
}): Promise<boolean> {
  const params = authorizedParams(input.pageAccessToken);
  params.set('subscribed_fields', 'messages,messaging_feedback');
  const payload = await metaFetch<{ success?: boolean }>(
    `${graphUrl(`${input.pageId}/subscribed_apps`)}?${params}`,
    { method: 'POST' }
  );
  return payload.success === true;
}

export async function fetchSocialParticipant(input: {
  channel: 'facebook' | 'instagram';
  participantId: string;
  accessToken: string;
}): Promise<{ name?: string; username?: string; avatarUrl?: string }> {
  const params = authorizedParams(input.accessToken);
  params.set(
    'fields',
    input.channel === 'facebook'
      ? 'first_name,last_name,profile_pic'
      : 'name,username,profile_pic'
  );
  const payload = await metaFetch<{
    name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
    profile_pic?: string;
  }>(`${graphUrl(input.participantId)}?${params}`);
  return {
    name:
      payload.name ||
      [payload.first_name, payload.last_name].filter(Boolean).join(' ') ||
      undefined,
    username: payload.username,
    avatarUrl: payload.profile_pic || undefined,
  };
}

export async function sendSocialText(input: {
  channel: 'facebook' | 'instagram';
  channelAccountId: string;
  participantId: string;
  accessToken: string;
  text: string;
}): Promise<{ messageId: string }> {
  const params = authorizedParams(input.accessToken);
  const payload = await metaFetch<{ message_id?: string }>(
    `${graphUrl(`${input.channelAccountId}/messages`)}?${params}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: input.participantId },
        message: { text: input.text },
        ...(input.channel === 'facebook' ? { messaging_type: 'RESPONSE' } : {}),
      }),
    }
  );
  if (!payload.message_id) {
    throw new MetaApiError('Meta no devolvió un identificador de mensaje', 502);
  }
  return { messageId: payload.message_id };
}
