import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  googleCalendarConnected,
  listAvailableSlots,
  type SupportCalendarSettings,
  zonedDateTimeToUtc,
} from './calendar';

const SETTINGS: SupportCalendarSettings = {
  id: 1,
  timezone: 'America/Santiago',
  meeting_duration_minutes: 30,
  minimum_notice_minutes: 0,
  buffer_minutes: 0,
  max_meetings_per_day: 6,
  availability: { '1': [['09:00', '11:00']] },
  blocked_dates: [],
  google_calendar_id: null,
  google_account_email: null,
  encrypted_access_token: null,
  encrypted_refresh_token: null,
  access_token_expires_at: null,
  connected_at: null,
};

function adminWithBookings(
  bookings: Array<{ starts_at: string; ends_at: string }>
) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockResolvedValue({ data: bookings, error: null });
  return {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;
}

describe('support calendar timezone conversion', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converts a Chile local time into a stable UTC instant', () => {
    expect(
      zonedDateTimeToUtc(
        '2026-08-04',
        '15:00',
        'America/Santiago'
      ).toISOString()
    ).toBe('2026-08-04T19:00:00.000Z');
  });

  it('offers native Nexora slots when Google is disconnected', async () => {
    vi.setSystemTime(new Date('2026-08-03T10:00:00Z'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const slots = await listAvailableSlots(adminWithBookings([]), SETTINGS, 1);

    expect(googleCalendarConnected(SETTINGS)).toBe(false);
    expect(slots).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stops offering a day after the Nexora daily maximum is reached', async () => {
    vi.setSystemTime(new Date('2026-08-03T10:00:00Z'));
    const bookings = Array.from({ length: 6 }, (_, index) => ({
      starts_at: new Date(
        Date.UTC(2026, 7, 3, 13 + Math.floor(index / 2), (index % 2) * 30)
      ).toISOString(),
      ends_at: new Date(
        Date.UTC(
          2026,
          7,
          3,
          13 + Math.floor((index + 1) / 2),
          ((index + 1) % 2) * 30
        )
      ).toISOString(),
    }));
    const slots = await listAvailableSlots(
      adminWithBookings(bookings),
      SETTINGS,
      1
    );

    expect(slots).toHaveLength(0);
  });
});
