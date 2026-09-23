import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const admin = supabaseAdmin();
    const [conversations, tickets, bookings, documents, settings, statistics] =
      await Promise.all([
        admin
          .from('platform_support_conversations')
          .select(
            'id, user_id, account_id, status, resolution_type, current_path, feedback, escalated_at, closed_at, created_at, updated_at, platform_support_messages(id, sender_type, sender_user_id, content, metadata, created_at)'
          )
          .order('updated_at', { ascending: false })
          .limit(100),
        admin
          .from('platform_support_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        admin
          .from('platform_support_bookings')
          .select(
            'id, support_conversation_id, support_ticket_id, user_id, account_id, attendee_name, attendee_email, reason, starts_at, ends_at, timezone, status, provider, external_event_id, meeting_url, external_sync_status, external_sync_error, external_synced_at, cancelled_at, completed_at, created_at, updated_at'
          )
          .order('starts_at', { ascending: false })
          .limit(100),
        admin
          .from('platform_support_documents')
          .select(
            'id, title, category, content, status, published_at, created_at, updated_at'
          )
          .order('updated_at', { ascending: false }),
        admin
          .from('platform_support_settings')
          .select(
            'timezone, meeting_duration_minutes, minimum_notice_minutes, buffer_minutes, max_meetings_per_day, availability, blocked_dates, google_calendar_id, google_account_email, connected_at'
          )
          .eq('id', 1)
          .single(),
        admin.rpc('platform_support_statistics'),
      ]);
    const firstError = [
      conversations.error,
      tickets.error,
      bookings.error,
      documents.error,
      settings.error,
      statistics.error,
    ].find(Boolean);
    if (firstError) throw firstError;
    const userIds = Array.from(
      new Set((conversations.data ?? []).map((item) => item.user_id))
    );
    const accountIds = Array.from(
      new Set((conversations.data ?? []).map((item) => item.account_id))
    );
    const [profiles, accounts] = await Promise.all([
      userIds.length
        ? admin
            .from('profiles')
            .select('user_id, full_name, email')
            .in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      accountIds.length
        ? admin
            .from('accounts')
            .select('id, name, plan_code')
            .in('id', accountIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profiles.error || accounts.error)
      throw profiles.error ?? accounts.error;
    return NextResponse.json(
      {
        conversations: conversations.data ?? [],
        tickets: tickets.data ?? [],
        bookings: bookings.data ?? [],
        documents: documents.data ?? [],
        settings: settings.data,
        statistics: statistics.data,
        profiles: profiles.data ?? [],
        accounts: accounts.data ?? [],
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
