import crypto from 'crypto';

import type { MetaOAuthChannel } from './config';

export const META_OAUTH_COOKIE = 'wacrm_meta_oauth';
export const META_OAUTH_TTL_SECONDS = 10 * 60;

export interface MetaOAuthState {
  accountId: string;
  userId: string;
  channel: MetaOAuthChannel;
  nonce: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.META_APP_SECRET?.trim();
  if (!value) throw new Error('META_APP_SECRET is required');
  return value;
}

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
}

export function createMetaOAuthState(input: {
  accountId: string;
  userId: string;
  channel: MetaOAuthChannel;
  now?: number;
}): { token: string; nonce: string } {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const state: MetaOAuthState = {
    accountId: input.accountId,
    userId: input.userId,
    channel: input.channel,
    nonce,
    expiresAt:
      Math.floor((input.now ?? Date.now()) / 1000) + META_OAUTH_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, nonce };
}

export function verifyMetaOAuthState(
  token: string,
  expectedNonce: string,
  now = Date.now()
): MetaOAuthState | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expected = sign(payload);
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    givenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(givenBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as Partial<MetaOAuthState>;
    if (
      typeof parsed.accountId !== 'string' ||
      typeof parsed.userId !== 'string' ||
      (parsed.channel !== 'facebook' && parsed.channel !== 'instagram') ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.nonce !== expectedNonce ||
      parsed.expiresAt < Math.floor(now / 1000)
    ) {
      return null;
    }
    return parsed as MetaOAuthState;
  } catch {
    return null;
  }
}
