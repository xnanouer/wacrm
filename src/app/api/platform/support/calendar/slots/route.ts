import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  googleCalendarConnected,
  listAvailableSlots,
  type SupportCalendarSettings,
} from '@/lib/platform-support/calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('platform_support_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    const settings = data as SupportCalendarSettings;
    const slots = await listAvailableSlots(admin, settings, 30);
    return NextResponse.json(
      {
        slots,
        calendar: 'nexora',
        googleConnected: googleCalendarConnected(settings),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
