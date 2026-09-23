import { redirect } from 'next/navigation';

import { PlatformCompanies } from '@/components/platform/platform-companies';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';
import { listPlatformAccounts, listSaasPlans } from '@/lib/platform/accounts';
import { getPlatformStorageOverview } from '@/lib/platform/storage-monitor';

export default async function PlatformPage() {
  let platform;
  try {
    platform = await requirePlatformRole('platform_support');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/dashboard');
    throw error;
  }

  const [accounts, plans] = await Promise.all([
    listPlatformAccounts(),
    listSaasPlans(),
  ]);
  const storageOverview =
    platform.role === 'platform_owner'
      ? await getPlatformStorageOverview()
      : null;

  return (
    <PlatformCompanies
      accounts={accounts}
      plans={plans}
      platformRole={platform.role}
      platformEmail={platform.email}
      storageOverview={storageOverview}
    />
  );
}
