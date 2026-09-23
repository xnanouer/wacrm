import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (request.headers.get('x-cron-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: expiredTrials, error: trialError } = await admin
    .from('accounts')
    .update({
      subscription_status: 'suspended',
      suspended_at: now,
      suspension_reason: 'Período de prueba finalizado',
    })
    .eq('subscription_status', 'trialing')
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', now)
    .select('id');
  if (trialError) {
    return NextResponse.json({ error: trialError.message }, { status: 500 });
  }

  const { data: expiredGrace, error: graceError } = await admin
    .from('accounts')
    .update({
      subscription_status: 'suspended',
      suspended_at: now,
      suspension_reason: 'Pago pendiente fuera del período de gracia',
    })
    .eq('subscription_status', 'past_due')
    .not('grace_ends_at', 'is', null)
    .lte('grace_ends_at', now)
    .select('id');
  if (graceError) {
    return NextResponse.json({ error: graceError.message }, { status: 500 });
  }

  return NextResponse.json({
    suspendedTrials: expiredTrials?.length ?? 0,
    suspendedPastDue: expiredGrace?.length ?? 0,
  });
}
