import { redirect } from 'next/navigation';

import { PlatformActivity } from '@/components/platform/platform-activity';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';

export default async function PlatformActivityPage() {
  try {
    await requirePlatformRole('platform_owner');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/dashboard');
    throw error;
  }
  return <PlatformActivity />;
}
