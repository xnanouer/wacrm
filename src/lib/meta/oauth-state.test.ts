import { describe, expect, it } from 'vitest';

import {
  createMetaOAuthState,
  META_OAUTH_TTL_SECONDS,
  verifyMetaOAuthState,
} from './oauth-state';

describe('Meta OAuth state', () => {
  const now = new Date('2026-07-19T12:00:00Z').getTime();

  it('binds a valid state to the account, user and browser nonce', () => {
    const created = createMetaOAuthState({
      accountId: 'account-1',
      userId: 'user-1',
      channel: 'facebook',
      now,
    });
    expect(
      verifyMetaOAuthState(created.token, created.nonce, now)
    ).toMatchObject({
      accountId: 'account-1',
      userId: 'user-1',
      channel: 'facebook',
      nonce: created.nonce,
    });
  });

  it('rejects another browser nonce and a modified signature', () => {
    const created = createMetaOAuthState({
      accountId: 'account-1',
      userId: 'user-1',
      channel: 'instagram',
      now,
    });
    expect(
      verifyMetaOAuthState(created.token, 'another-nonce', now)
    ).toBeNull();
    expect(
      verifyMetaOAuthState(`${created.token}x`, created.nonce, now)
    ).toBeNull();
  });

  it('rejects an expired authorization attempt', () => {
    const created = createMetaOAuthState({
      accountId: 'account-1',
      userId: 'user-1',
      channel: 'facebook',
      now,
    });
    const afterExpiry = now + (META_OAUTH_TTL_SECONDS + 1) * 1000;
    expect(
      verifyMetaOAuthState(created.token, created.nonce, afterExpiry)
    ).toBeNull();
  });
});
