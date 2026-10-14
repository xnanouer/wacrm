import { NextResponse } from 'next/server';

import { processDueFollowUpJobs } from '@/lib/ai/follow-up';
import { isAuthorizedCronRequest, isCronConfigured } from '@/lib/cron/auth';

export const maxDuration = 55;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await processDueFollowUpJobs(10));
  } catch (error) {
    console.error('[follow-up cron] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
