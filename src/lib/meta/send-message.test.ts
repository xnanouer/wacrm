import { describe, expect, it } from 'vitest';

import { isSocialReplyWindowOpen } from './send-message';

describe('isSocialReplyWindowOpen', () => {
  const now = Date.parse('2026-10-01T15:00:00.000Z');

  it('keeps replies open for customer messages newer than 24 hours', () => {
    expect(
      isSocialReplyWindowOpen('2026-09-30T15:00:00.001Z', now)
    ).toBe(true);
  });

  it('closes replies at 24 hours and when no customer message exists', () => {
    expect(isSocialReplyWindowOpen('2026-09-30T15:00:00.000Z', now)).toBe(
      false
    );
    expect(isSocialReplyWindowOpen(null, now)).toBe(false);
  });

  it('rejects invalid timestamps', () => {
    expect(isSocialReplyWindowOpen('not-a-date', now)).toBe(false);
  });
});
