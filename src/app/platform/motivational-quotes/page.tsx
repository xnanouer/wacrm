import { redirect } from 'next/navigation';

import { MotivationalQuotesManager } from '@/components/platform/motivational-quotes-manager';
import { listMotivationalQuotes } from '@/lib/motivational-quotes';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';

export default async function PlatformMotivationalQuotesPage() {
  try {
    await requirePlatformRole('platform_owner');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/dashboard');
    throw error;
  }

  return (
    <MotivationalQuotesManager initialQuotes={await listMotivationalQuotes()} />
  );
}
