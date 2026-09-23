import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  googleCalendarConnected,
  listAvailableSlots,
  type SupportCalendarSettings,
} from '@/lib/platform-support/calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('viewer');
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('platform_support_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    const slots = await listAvailableSlots(
      admin,
      data as SupportCalendarSettings
    );
    return NextResponse.json({
      ready: true,
      calendar: 'nexora',
      googleConnected: googleCalendarConnected(data as SupportCalendarSettings),
      slots,
      message: slots.length
        ? 'Horarios disponibles en el Calendario Nexora.'
        : 'No hay horarios disponibles en los próximos días.',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
