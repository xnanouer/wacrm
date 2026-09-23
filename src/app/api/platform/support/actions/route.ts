import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import { redactSecrets } from '@/lib/platform-support/security';
import {
  cancelGoogleCalendarEvent,
  googleCalendarConnected,
  getGoogleAccessToken,
  listAvailableSlots,
  type SupportCalendarSettings,
  updateGoogleCalendarEvent,
} from '@/lib/platform-support/calendar';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `support-action:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const action = String(body?.action ?? '');
    const admin = supabaseAdmin();
    let warning: string | null = null;
    if (action === 'reply') {
      const conversationId =
        typeof body?.conversationId === 'string' ? body.conversationId : '';
      const content = redactSecrets(
        typeof body?.content === 'string' ? body.content.trim() : ''
      );
      if (!conversationId || !content)
        return NextResponse.json(
          { error: 'Respuesta inválida.' },
          { status: 400 }
        );
      const { error } = await admin.from('platform_support_messages').insert({
        conversation_id: conversationId,
        sender_type: 'creator',
        sender_user_id: actor.userId,
        content,
      });
      if (error) throw error;
      await admin
        .from('platform_support_conversations')
        .update({ status: 'waiting_user' })
        .eq('id', conversationId);
    } else if (action === 'ticket') {
      const ticketId = typeof body?.ticketId === 'string' ? body.ticketId : '';
      const status = String(body?.status ?? '');
      const priority = String(body?.priority ?? '');
      if (
        !ticketId ||
        !['open', 'waiting_user', 'in_progress', 'resolved', 'closed'].includes(
          status
        ) ||
        !['low', 'normal', 'high', 'urgent'].includes(priority)
      )
        return NextResponse.json(
          { error: 'Cambio inválido.' },
          { status: 400 }
        );
      const { data: ticket, error } = await admin
        .from('platform_support_tickets')
        .update({
          status,
          priority,
          assigned_to: actor.userId,
          resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        })
        .eq('id', ticketId)
        .select('conversation_id')
        .single();
      if (error) throw error;
      if (status === 'resolved')
        await admin
          .from('platform_support_conversations')
          .update({
            status: 'resolved',
            resolution_type: 'creator_resolved',
            closed_at: new Date().toISOString(),
          })
          .eq('id', ticket.conversation_id);
    } else if (action === 'cancel_booking') {
      const bookingId =
        typeof body?.bookingId === 'string' ? body.bookingId : '';
      if (!bookingId)
        return NextResponse.json(
          { error: 'Reserva inválida.' },
          { status: 400 }
        );
      const [
        { data: booking, error: bookingError },
        { data: settings, error: settingsError },
      ] = await Promise.all([
        admin
          .from('platform_support_bookings')
          .select('external_event_id, status')
          .eq('id', bookingId)
          .single(),
        admin
          .from('platform_support_settings')
          .select('*')
          .eq('id', 1)
          .single(),
      ]);
      if (bookingError || settingsError) throw bookingError ?? settingsError;
      const { error } = await admin
        .from('platform_support_bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          external_sync_status: booking.external_event_id
            ? 'pending'
            : 'not_connected',
          external_sync_error: null,
        })
        .eq('id', bookingId);
      if (error) throw error;
      const calendarSettings = settings as SupportCalendarSettings;
      if (
        booking.external_event_id &&
        googleCalendarConnected(calendarSettings)
      ) {
        try {
          const token = await getGoogleAccessToken(admin, calendarSettings);
          await cancelGoogleCalendarEvent(
            token,
            settings.google_calendar_id || 'primary',
            booking.external_event_id
          );
          await admin
            .from('platform_support_bookings')
            .update({
              external_sync_status: 'cancelled',
              external_sync_error: null,
              external_synced_at: new Date().toISOString(),
            })
            .eq('id', bookingId);
        } catch (providerError) {
          warning =
            'La sesión se canceló en Nexora, pero no pudo cancelarse en Google Calendar.';
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
    } else if (action === 'booking_status') {
      const bookingId =
        typeof body?.bookingId === 'string' ? body.bookingId : '';
      const status = String(body?.status ?? '');
      if (!bookingId || !['completed', 'no_show'].includes(status))
        return NextResponse.json(
          { error: 'Estado de sesión inválido.' },
          { status: 400 }
        );
      const { error } = await admin
        .from('platform_support_bookings')
        .update({
          status,
          completed_at:
            status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', bookingId)
        .in('status', ['pending', 'confirmed']);
      if (error) throw error;
    } else if (action === 'reschedule_booking') {
      const bookingId =
        typeof body?.bookingId === 'string' ? body.bookingId : '';
      const startsAt = typeof body?.startsAt === 'string' ? body.startsAt : '';
      const endsAt = typeof body?.endsAt === 'string' ? body.endsAt : '';
      const timezone =
        typeof body?.timezone === 'string' ? body.timezone.trim() : '';
      if (
        !bookingId ||
        !startsAt ||
        !endsAt ||
        !timezone ||
        !Number.isFinite(Date.parse(startsAt)) ||
        !Number.isFinite(Date.parse(endsAt))
      )
        return NextResponse.json(
          { error: 'Nuevo horario inválido.' },
          { status: 400 }
        );
      const [bookingResult, settingsResult] = await Promise.all([
        admin
          .from('platform_support_bookings')
          .select('external_event_id, status')
          .eq('id', bookingId)
          .single(),
        admin
          .from('platform_support_settings')
          .select('*')
          .eq('id', 1)
          .single(),
      ]);
      if (bookingResult.error || settingsResult.error)
        throw bookingResult.error ?? settingsResult.error;
      const calendarSettings = settingsResult.data as SupportCalendarSettings;
      const availableSlots = await listAvailableSlots(
        admin,
        calendarSettings,
        30
      );
      if (
        !availableSlots.some(
          (slot) => slot.startsAt === startsAt && slot.endsAt === endsAt
        )
      )
        return NextResponse.json(
          { error: 'Ese horario ya no está disponible.' },
          { status: 409 }
        );
      const supabase = await createClient();
      const { error: rescheduleError } = await supabase.rpc(
        'reschedule_platform_support_booking',
        {
          p_booking_id: bookingId,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_timezone: timezone,
        }
      );
      if (rescheduleError) {
        if (rescheduleError.message.includes('BOOKING_SLOT_UNAVAILABLE'))
          return NextResponse.json(
            { error: 'Ese horario acaba de ser reservado.' },
            { status: 409 }
          );
        throw rescheduleError;
      }
      if (
        bookingResult.data.external_event_id &&
        googleCalendarConnected(calendarSettings)
      ) {
        try {
          const token = await getGoogleAccessToken(admin, calendarSettings);
          await updateGoogleCalendarEvent({
            token,
            calendarId: calendarSettings.google_calendar_id || 'primary',
            eventId: bookingResult.data.external_event_id,
            startsAt,
            endsAt,
            timezone,
          });
          await admin
            .from('platform_support_bookings')
            .update({
              external_sync_status: 'synced',
              external_sync_error: null,
              external_synced_at: new Date().toISOString(),
            })
            .eq('id', bookingId);
        } catch (providerError) {
          warning =
            'La sesión se reprogramó en Nexora, pero Google Calendar no pudo actualizarse.';
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
    } else {
      return NextResponse.json(
        { error: 'Acción no permitida.' },
        { status: 400 }
      );
    }
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: `platform.support_${action}`,
      next_data:
        action === 'reply'
          ? {
              conversation_id: body?.conversationId,
              content_length:
                typeof body?.content === 'string' ? body.content.length : 0,
            }
          : ['cancel_booking', 'booking_status', 'reschedule_booking'].includes(
                action
              )
            ? {
                booking_id: body?.bookingId,
                status:
                  action === 'cancel_booking' ? 'cancelled' : body?.status,
                starts_at: body?.startsAt,
                ends_at: body?.endsAt,
              }
            : {
                ticket_id: body?.ticketId,
                status: body?.status,
                priority: body?.priority,
              },
      reason: 'Acción realizada desde Soporte Nexora',
    });
    return NextResponse.json({ success: true, warning });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
