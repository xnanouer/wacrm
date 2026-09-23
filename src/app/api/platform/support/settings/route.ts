import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import { googleOAuthConfigured } from '@/lib/platform-support/calendar';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const SAFE_COLUMNS =
  'timezone, meeting_duration_minutes, minimum_notice_minutes, buffer_minutes, max_meetings_per_day, availability, blocked_dates, google_calendar_id, google_account_email, connected_at';

function validAvailability(
  value: unknown
): value is Record<string, Array<[string, string]>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([day, ranges]) =>
      /^[0-6]$/.test(day) &&
      Array.isArray(ranges) &&
      ranges.length <= 3 &&
      ranges.every(
        (range) =>
          Array.isArray(range) &&
          range.length === 2 &&
          range.every(
            (time) =>
              typeof time === 'string' &&
              /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
          ) &&
          range[0] < range[1]
      )
  );
}

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const { data, error } = await supabaseAdmin()
      .from('platform_support_settings')
      .select(SAFE_COLUMNS)
      .eq('id', 1)
      .single();
    if (error) throw error;
    return NextResponse.json({
      settings: data,
      oauthConfigured: googleOAuthConfigured(),
    });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `platform-support-settings:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body)
      return NextResponse.json(
        { error: 'Solicitud inválida.' },
        { status: 400 }
      );
    const duration = Number(body.meeting_duration_minutes);
    const notice = Number(body.minimum_notice_minutes);
    const buffer = Number(body.buffer_minutes);
    const maximum = Number(body.max_meetings_per_day);
    const timezone =
      typeof body.timezone === 'string' ? body.timezone.trim() : '';
    const availability = body.availability;
    const blockedDates = body.blocked_dates;
    if (
      !timezone ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      duration > 180 ||
      !Number.isInteger(notice) ||
      notice < 0 ||
      notice > 43200 ||
      !Number.isInteger(buffer) ||
      buffer < 0 ||
      buffer > 180 ||
      !Number.isInteger(maximum) ||
      maximum < 1 ||
      maximum > 50 ||
      !validAvailability(availability) ||
      !Array.isArray(blockedDates) ||
      blockedDates.some(
        (date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      )
    ) {
      return NextResponse.json(
        { error: 'La disponibilidad no es válida.' },
        { status: 400 }
      );
    }
    try {
      new Intl.DateTimeFormat('es-CL', { timeZone: timezone }).format(
        new Date()
      );
    } catch {
      return NextResponse.json(
        { error: 'Zona horaria inválida.' },
        { status: 400 }
      );
    }
    const { error } = await supabaseAdmin()
      .from('platform_support_settings')
      .update({
        timezone,
        meeting_duration_minutes: duration,
        minimum_notice_minutes: notice,
        buffer_minutes: buffer,
        max_meetings_per_day: maximum,
        availability,
        blocked_dates: blockedDates.slice(0, 100),
        updated_by: actor.userId,
      })
      .eq('id', 1);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const { error } = await supabaseAdmin()
      .from('platform_support_settings')
      .update({
        google_calendar_id: null,
        google_account_email: null,
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        access_token_expires_at: null,
        connected_at: null,
        updated_by: actor.userId,
      })
      .eq('id', 1);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
