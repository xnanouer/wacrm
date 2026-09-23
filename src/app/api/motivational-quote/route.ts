import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { getDailyMotivationalQuote } from '@/lib/motivational-quotes';

export async function GET() {
  try {
    const context = await getCurrentAccount();
    const quote = await getDailyMotivationalQuote({
      userId: context.userId,
      accountId: context.accountId,
      role: context.role,
    });
    return NextResponse.json({ quote });
  } catch (error) {
    return toErrorResponse(error);
  }
}
