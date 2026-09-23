import crypto from 'crypto';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  createGoogleCalendarEvent,
  googleCalendarConnected,
  getGoogleAccessToken,
  listAvailableSlots,
  type SupportCalendarSettings,
} from '@/lib/platform-support/calendar';
import { redactSecrets } from '@/lib/platform-support/security';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const limit = checkRateLimit(
      `support-booking:${ctx.userId}`,
      RATE_LIMITS.platformSupportBooking
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const conversationId =
      typeof body?.conversationId === 'string' ? body.conversationId : '';
    const ticketId = typeof body?.ticketId === 'string' ? body.ticketId : null;
    const attendeeName =
      typeof body?.attendeeName === 'string' ? body.attendeeName.trim() : '';
    const attendeeEmail =
      typeof body?.attendeeEmail === 'string'
        ? body.attendeeEmail.trim().toLowerCase()
        : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const startsAt = typeof body?.startsAt === 'string' ? body.startsAt : '';
    const endsAt = typeof body?.endsAt === 'string' ? body.endsAt : '';
    if (
      !conversationId ||
      attendeeName.length < 2 ||
      !/^\S+@\S+\.\S+$/.test(attendeeEmail) ||
      reason.length < 3 ||
      !startsAt ||
      !endsAt
    )
      return NextResponse.json(
        { error: 'Completa los datos de la reunión.' },
        { status: 400 }
      );
    const admin = supabaseAdmin();
    const { data: settings, error: settingsError } = await admin
      .from('platform_support_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (settingsError) throw settingsError;
    const calendarSettings = settings as SupportCalendarSettings;
    const availableSlots = await listAvailableSlots(admin, calendarSettings);
    if (
      !availableSlots.some(
        (slot) => slot.startsAt === startsAt && slot.endsAt === endsAt
      )
    )
      return NextResponse.json(
        { error: 'Ese horario ya no está disponible. Elige otro.' },
        { status: 409 }
      );
    const cancellationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(cancellationToken)
      .digest('hex');
    const { data: bookingId, error: reservationError } = await ctx.supabase.rpc(
      'reserve_platform_support_booking',
      {
        p_conversation_id: conversationId,
        p_ticket_id: ticketId,
        p_attendee_name: attendeeName,
        p_attendee_email: attendeeEmail,
        p_reason: reason,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_timezone: settings.timezone,
        p_cancellation_token_hash: tokenHash,
      }
    );
    if (reservationError) {
      if (reservationError.message.includes('BOOKING_SLOT_UNAVAILABLE'))
        return NextResponse.json(
          { error: 'Ese horario acaba de ser reservado. Elige otro.' },
          { status: 409 }
        );
      throw reservationError;
    }
    let googleSynced = false;
    let syncWarning: string | null = null;

    if (googleCalendarConnected(calendarSettings)) {
      try {
        await admin
          .from('platform_support_bookings')
          .update({ external_sync_status: 'pending' })
          .eq('id', bookingId);
        const token = await getGoogleAccessToken(admin, calendarSettings);
        const event = await createGoogleCalendarEvent({
          token,
          calendarId: settings.google_calendar_id || 'primary',
          title: `Soporte Nexora · ${ctx.account.name}`,
          description: `Solicitud de soporte Nexora\nEmpresa: ${ctx.account.name}\nMotivo: ${reason}`,
          attendeeEmail,
          startsAt,
          endsAt,
          timezone: settings.timezone,
          requestId: bookingId,
        });
        const { error } = await admin
          .from('platform_support_bookings')
          .update({
            external_event_id: event.externalEventId,
            meeting_url: event.meetingUrl,
            external_sync_status: 'synced',
            external_sync_error: null,
            external_synced_at: new Date().toISOString(),
          })
          .eq('id', bookingId);
        if (error) throw error;
        googleSynced = true;
      } catch (providerError) {
        syncWarning =
          'La sesión está confirmada en Nexora, pero no se pudo sincronizar con Google Calendar.';
        await admin
          .from('platform_support_bookings')
          .update({
            external_sync_status: 'failed',
            external_sync_error: redactSecrets(
              providerError instanceof Error
                ? providerError.message
                : 'Error de sincronización externa'
            ).slice(0, 1000),
          })
          .eq('id', bookingId);
      }
    }

    const { data: booking, error: bookingError } = await admin
      .from('platform_support_bookings')
      .select(
        'id, starts_at, ends_at, timezone, status, provider, meeting_url, external_sync_status'
      )
      .eq('id', bookingId)
      .single();
    if (bookingError) throw bookingError;

    await admin.from('platform_support_tool_audit').insert({
      conversation_id: conversationId,
      user_id: ctx.userId,
      account_id: ctx.account.id,
      tool_name: 'create_nexora_support_booking',
      input_summary: {
        ticket_id: ticketId,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: settings.timezone,
      },
      result_summary: {
        booking_id: bookingId,
        status: 'confirmed',
        google_synced: googleSynced,
      },
      success: true,
    });

    return NextResponse.json({
      booking,
      cancellationToken,
      googleSynced,
      warning: syncWarning,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
