import { redirect } from 'next/navigation';

import { PlatformStorageMonitor } from '@/components/platform/platform-storage-monitor';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';
import { getPlatformStorageOverview } from '@/lib/platform/storage-monitor';

export default async function PlatformStoragePage() {
  try {
    await requirePlatformRole('platform_owner');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/dashboard');
    throw error;
  }

  return (
    <PlatformStorageMonitor
      initialOverview={await getPlatformStorageOverview()}
    />
  );
}
