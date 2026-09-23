import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

export interface SupportCalendarSettings {
  id: number;
  timezone: string;
  meeting_duration_minutes: number;
  minimum_notice_minutes: number;
  buffer_minutes: number;
  max_meetings_per_day: number;
  availability: Record<string, Array<[string, string]>>;
  blocked_dates: string[];
  google_calendar_id: string | null;
  google_account_email: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  connected_at: string | null;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
}

export function googleCalendarConnected(settings: SupportCalendarSettings) {
  return Boolean(
    settings.connected_at &&
    (settings.encrypted_refresh_token || settings.encrypted_access_token)
  );
}

export function googleRedirectUri(origin?: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin || '').replace(
    /\/$/,
    ''
  );
  return `${base}/api/platform/support/calendar/callback`;
}

export function buildGoogleAuthorizationUrl(state: string, origin: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(origin),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: ['openid', 'email', 'https://www.googleapis.com/auth/calendar'].join(
      ' '
    ),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, origin: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: googleRedirectUri(origin),
    }),
  });
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        'Google OAuth exchange failed'
    );
  }
  return payload;
}

async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token)
    throw new Error('Google Calendar authorization expired');
  return payload;
}

export async function getGoogleAccessToken(
  admin: SupabaseClient,
  settings: SupportCalendarSettings
) {
  if (!settings.encrypted_refresh_token && !settings.encrypted_access_token) {
    throw new Error('GOOGLE_CALENDAR_NOT_CONNECTED');
  }
  const expiresAt = settings.access_token_expires_at
    ? new Date(settings.access_token_expires_at).getTime()
    : 0;
  if (settings.encrypted_access_token && expiresAt > Date.now() + 60_000) {
    return decrypt(settings.encrypted_access_token);
  }
  if (!settings.encrypted_refresh_token)
    throw new Error('GOOGLE_CALENDAR_RECONNECT_REQUIRED');
  const refreshed = await refreshGoogleToken(
    decrypt(settings.encrypted_refresh_token)
  );
  const nextExpiresAt = new Date(
    Date.now() + (refreshed.expires_in ?? 3600) * 1000
  ).toISOString();
  const { error } = await admin
    .from('platform_support_settings')
    .update({
      encrypted_access_token: encrypt(refreshed.access_token!),
      access_token_expires_at: nextExpiresAt,
    })
    .eq('id', 1);
  if (error) throw error;
  return refreshed.access_token!;
}

function partsInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string
) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let timestamp = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const actual = partsInTimeZone(new Date(timestamp), timezone);
    const actualStamp = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const wantedStamp = Date.UTC(year, month - 1, day, hour, minute, 0);
    timestamp += wantedStamp - actualStamp;
  }
  return new Date(timestamp);
}

function localDateString(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function weekday(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export interface SupportSlot {
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export async function listAvailableSlots(
  admin: SupabaseClient,
  settings: SupportCalendarSettings,
  days = 14
): Promise<SupportSlot[]> {
  const timezone = settings.timezone || 'America/Santiago';
  const firstDate = localDateString(new Date(), timezone);
  const lastDate = addCalendarDays(
    firstDate,
    Math.min(30, Math.max(1, days)) + 1
  );
  const timeMin = zonedDateTimeToUtc(firstDate, '00:00', timezone);
  const timeMax = zonedDateTimeToUtc(lastDate, '00:00', timezone);
  const calendarId = settings.google_calendar_id || 'primary';
  let busy: Array<{ start: string; end: string }> = [];

  // Nexora is the source of truth. When Google is connected we enrich the
  // availability with its busy periods, but an external outage must not make
  // the native support calendar unusable.
  if (googleCalendarConnected(settings)) {
    try {
      const token = await getGoogleAccessToken(admin, settings);
      const freeBusyResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            timeZone: timezone,
            items: [{ id: calendarId }],
          }),
        }
      );
      if (freeBusyResponse.ok) {
        const freeBusy = (await freeBusyResponse.json()) as {
          calendars?: Record<
            string,
            { busy?: Array<{ start: string; end: string }> }
          >;
        };
        busy = freeBusy.calendars?.[calendarId]?.busy ?? [];
      }
    } catch {
      // The internal booking collision checks still protect Nexora slots.
      busy = [];
    }
  }
  const { data: localBookings, error } = await admin
    .from('platform_support_bookings')
    .select('starts_at, ends_at')
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', timeMin.toISOString())
    .lt('starts_at', timeMax.toISOString());
  if (error) throw error;
  const occupied = [
    ...busy.map((range) => ({
      start: new Date(range.start).getTime(),
      end: new Date(range.end).getTime(),
    })),
    ...(localBookings ?? []).map((range) => ({
      start: new Date(range.starts_at).getTime(),
      end: new Date(range.ends_at).getTime(),
    })),
  ];
  const nowWithNotice = Date.now() + settings.minimum_notice_minutes * 60_000;
  const slots: SupportSlot[] = [];
  const bookedPerDay = new Map<string, number>();
  for (const booking of localBookings ?? []) {
    const bookingDate = localDateString(new Date(booking.starts_at), timezone);
    bookedPerDay.set(bookingDate, (bookedPerDay.get(bookingDate) ?? 0) + 1);
  }
  for (let offset = 0; offset < days; offset += 1) {
    const date = addCalendarDays(firstDate, offset);
    if (settings.blocked_dates.includes(date)) continue;
    const ranges = settings.availability[String(weekday(date))] ?? [];
    for (const [startTime, endTime] of ranges) {
      let cursor = zonedDateTimeToUtc(date, startTime, timezone).getTime();
      const rangeEnd = zonedDateTimeToUtc(date, endTime, timezone).getTime();
      while (cursor + settings.meeting_duration_minutes * 60_000 <= rangeEnd) {
        const end = cursor + settings.meeting_duration_minutes * 60_000;
        const bufferedStart = cursor - settings.buffer_minutes * 60_000;
        const bufferedEnd = end + settings.buffer_minutes * 60_000;
        const collision = occupied.some(
          (item) => item.start < bufferedEnd && item.end > bufferedStart
        );
        const bookedCount = bookedPerDay.get(date) ?? 0;
        if (
          cursor >= nowWithNotice &&
          !collision &&
          bookedCount < settings.max_meetings_per_day
        ) {
          slots.push({
            startsAt: new Date(cursor).toISOString(),
            endsAt: new Date(end).toISOString(),
            timezone,
          });
        }
        cursor = end + settings.buffer_minutes * 60_000;
      }
    }
  }
  return slots.slice(0, 60);
}

export async function createGoogleCalendarEvent(args: {
  token: string;
  calendarId: string;
  title: string;
  description: string;
  attendeeEmail: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  requestId: string;
}) {
  const endpoint = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events`
  );
  endpoint.searchParams.set('conferenceDataVersion', '1');
  endpoint.searchParams.set('sendUpdates', 'all');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: args.title,
      description: args.description,
      start: { dateTime: args.startsAt, timeZone: args.timezone },
      end: { dateTime: args.endsAt, timeZone: args.timezone },
      attendees: [{ email: args.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: args.requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  });
  const payload = (await response.json()) as {
    id?: string;
    hangoutLink?: string;
    htmlLink?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id)
    throw new Error(
      payload.error?.message || 'No se pudo crear el evento en Google Calendar.'
    );
  return {
    externalEventId: payload.id,
    meetingUrl: payload.hangoutLink || payload.htmlLink || null,
  };
}

export async function cancelGoogleCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string
) {
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 410)
    throw new Error('No se pudo cancelar el evento de Google Calendar.');
}

export async function updateGoogleCalendarEvent(args: {
  token: string;
  calendarId: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}) {
  const endpoint = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.eventId)}`
  );
  endpoint.searchParams.set('sendUpdates', 'all');
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${args.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      start: { dateTime: args.startsAt, timeZone: args.timezone },
      end: { dateTime: args.endsAt, timeZone: args.timezone },
    }),
  });
  if (!response.ok)
    throw new Error('No se pudo reprogramar el evento de Google Calendar.');
}
