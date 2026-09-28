const DEFAULT_GRAPH_VERSION = 'v24.0';

export const META_OAUTH_SCOPES = [
  'business_management',
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
] as const;

export type MetaOAuthChannel = 'facebook' | 'instagram';

const META_CHANNEL_SCOPES: Record<
  MetaOAuthChannel,
  readonly (typeof META_OAUTH_SCOPES)[number][]
> = {
  facebook: [
    'business_management',
    'pages_show_list',
    'pages_messaging',
    'pages_manage_metadata',
    'pages_read_engagement',
  ],
  instagram: [
    'business_management',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_manage_messages',
  ],
};

export function metaOAuthScopesFor(
  channel: MetaOAuthChannel
): readonly (typeof META_OAUTH_SCOPES)[number][] {
  return META_CHANNEL_SCOPES[channel];
}

export function isMetaOAuthChannel(
  value: string | null
): value is MetaOAuthChannel {
  return value === 'facebook' || value === 'instagram';
}

export interface MetaServerConfig {
  appId: string;
  appSecret: string;
  graphVersion: string;
  loginConfigId?: string;
}

export function getMetaServerConfig(): MetaServerConfig {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error(
      'Meta no está configurado: agrega META_APP_ID y META_APP_SECRET.'
    );
  }

  return {
    appId,
    appSecret,
    graphVersion:
      process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
    loginConfigId: process.env.META_LOGIN_CONFIG_ID?.trim() || undefined,
  };
}

export function isMetaConfigured(): boolean {
  return Boolean(
    process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim()
  );
}

export function getMetaWebhookVerifyToken(): string {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'Meta webhook no está configurado: agrega META_WEBHOOK_VERIFY_TOKEN.'
    );
  }
  return token;
}

export function resolvePublicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}

export function metaOAuthRedirectUri(request: Request): string {
  return `${resolvePublicOrigin(request)}/api/meta/oauth/callback`;
}

export function metaSettingsUrl(request: Request, result: string): URL {
  const url = new URL('/settings', resolvePublicOrigin(request));
  url.searchParams.set('tab', 'channels');
  url.searchParams.set('meta', result);
  return url;
}
