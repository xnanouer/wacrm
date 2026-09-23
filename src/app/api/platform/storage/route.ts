import { NextResponse } from 'next/server';

import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  runPlatformStorageMonitor,
  updatePlatformStorageCapacity,
} from '@/lib/platform/storage-monitor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GIB = 1024 ** 3;

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const overview = await runPlatformStorageMonitor();
    return NextResponse.json(overview, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const platform = await requirePlatformRole('platform_owner');
    const body = (await request.json().catch(() => null)) as {
      databaseCapacityGb?: unknown;
      storageCapacityGb?: unknown;
    } | null;
    const databaseCapacityGb = Number(body?.databaseCapacityGb);
    const storageCapacityGb = Number(body?.storageCapacityGb);
    if (
      !Number.isFinite(databaseCapacityGb) ||
      !Number.isFinite(storageCapacityGb) ||
      databaseCapacityGb < 0.01 ||
      storageCapacityGb < 0.01 ||
      databaseCapacityGb > 10_240 ||
      storageCapacityGb > 10_240
    ) {
      return NextResponse.json(
        { error: 'Indica capacidades válidas entre 0,01 y 10.240 GB.' },
        { status: 400 }
      );
    }
    const overview = await updatePlatformStorageCapacity({
      databaseCapacityBytes: Math.round(databaseCapacityGb * GIB),
      storageCapacityBytes: Math.round(storageCapacityGb * GIB),
      userId: platform.userId,
    });
    return NextResponse.json(overview, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'INVALID_STORAGE_CAPACITY'
    ) {
      return NextResponse.json(
        { error: 'La capacidad indicada está fuera del rango permitido.' },
        { status: 400 }
      );
    }
    return toPlatformErrorResponse(error);
  }
}
