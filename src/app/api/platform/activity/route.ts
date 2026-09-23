import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import type { PlatformActivitySnapshot } from '@/lib/platform/activity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const { data, error } = await supabaseAdmin().rpc(
      'platform_activity_snapshot'
    );
    if (error) throw error;
    return NextResponse.json(data as PlatformActivitySnapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
