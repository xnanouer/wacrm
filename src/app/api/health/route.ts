import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  const baseline = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
  ] as const;
  const production = [
    'NEXT_PUBLIC_SITE_URL',
    'WHATSAPP_WEB_BRIDGE_SECRET',
    'AUTOMATION_CRON_SECRET',
    'CRON_SECRET',
    'PLATFORM_OWNER_EMAILS',
  ] as const;
  const required =
    process.env.NODE_ENV === 'production'
      ? [...baseline, ...production]
      : baseline;
  const missing = required.filter((name) => !process.env[name]);
  const healthy = missing.length === 0;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'misconfigured',
      release: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      timestamp: new Date().toISOString(),
      ...(healthy ? {} : { configuration: 'incomplete' }),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
