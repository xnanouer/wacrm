import { redirect } from 'next/navigation';

import { PlatformPaymentSettings } from '@/components/platform/platform-payment-settings';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';

export default async function PlatformPaymentsPage() {
  try {
    await requirePlatformRole('platform_owner');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/platform');
    throw error;
  }

  return <PlatformPaymentSettings />;
}
