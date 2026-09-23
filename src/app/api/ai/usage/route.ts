import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getAiUsageSummary } from '@/lib/ai/points/usage';

export async function GET() {
  try {
    const { accountId } = await requireRole('admin');
    const usage = await getAiUsageSummary(accountId);
    return NextResponse.json({ usage });
  } catch (error) {
    return toErrorResponse(error);
  }
}
