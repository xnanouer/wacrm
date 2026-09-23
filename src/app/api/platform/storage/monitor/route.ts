import { NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/cron/auth';
import { runPlatformStorageMonitor } from '@/lib/platform/storage-monitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const overview = await runPlatformStorageMonitor();
    return NextResponse.json({
      measuredAt: overview.measuredAt,
      databasePercent: overview.databasePercent,
      storagePercent: overview.storagePercent,
      activeAlerts: overview.activeAlerts.length,
    });
  } catch (error) {
    console.error('[platform storage monitor] failed:', error);
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 });
  }
}
