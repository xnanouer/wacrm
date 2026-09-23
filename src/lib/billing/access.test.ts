import { describe, expect, it } from 'vitest';

import { hasOperationalAccess } from './access';

const NOW = new Date('2026-07-21T12:00:00.000Z');

describe('hasOperationalAccess', () => {
  it('allows active and legacy accounts', () => {
    expect(hasOperationalAccess({}, NOW)).toBe(true);
    expect(hasOperationalAccess({ subscription_status: 'active' }, NOW)).toBe(
      true
    );
  });

  it('allows only unexpired trials', () => {
    expect(
      hasOperationalAccess(
        {
          subscription_status: 'trialing',
          trial_ends_at: '2026-07-22T12:00:00Z',
        },
        NOW
      )
    ).toBe(true);
    expect(
      hasOperationalAccess(
        {
          subscription_status: 'trialing',
          trial_ends_at: '2026-07-20T12:00:00Z',
        },
        NOW
      )
    ).toBe(false);
  });

  it('allows past-due accounts only during grace', () => {
    expect(
      hasOperationalAccess(
        {
          subscription_status: 'past_due',
          grace_ends_at: '2026-07-22T12:00:00Z',
        },
        NOW
      )
    ).toBe(true);
    expect(hasOperationalAccess({ subscription_status: 'past_due' }, NOW)).toBe(
      false
    );
  });

  it('blocks suspended and canceled accounts', () => {
    expect(
      hasOperationalAccess({ subscription_status: 'suspended' }, NOW)
    ).toBe(false);
    expect(hasOperationalAccess({ subscription_status: 'canceled' }, NOW)).toBe(
      false
    );
  });
});
