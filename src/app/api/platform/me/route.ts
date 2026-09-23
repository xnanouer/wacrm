import { NextResponse } from 'next/server';

import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';

export async function GET() {
  try {
    const context = await requirePlatformRole('platform_support');
    return NextResponse.json({ role: context.role });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
