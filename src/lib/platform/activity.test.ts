import { describe, expect, it, vi } from 'vitest';

import { isActiveToday, type PlatformActivityUser } from './activity';

const USER: PlatformActivityUser = {
  user_id: 'u',
  full_name: null,
  email: 'u@example.com',
  role: 'agent',
  account_id: 'a',
  account_name: 'Empresa',
  plan_code: 'starter',
  current_path: '/inbox',
  device_type: 'desktop',
  signed_in_at: null,
  last_seen_at: null,
  presence_status: 'disconnected',
};

describe('platform activity', () => {
  it('recognizes activity inside the last 24 hours', () => {
    vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
    expect(
      isActiveToday({ ...USER, last_seen_at: '2026-08-01T12:00:01Z' })
    ).toBe(true);
    expect(
      isActiveToday({ ...USER, last_seen_at: '2026-08-01T11:59:59Z' })
    ).toBe(false);
    vi.useRealTimers();
  });
});
