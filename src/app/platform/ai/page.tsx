import { redirect } from 'next/navigation';

import { PlatformAiSettings } from '@/components/platform/platform-ai-settings';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';

export default async function PlatformAiPage() {
  try {
    await requirePlatformRole('platform_owner');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/platform');
    throw error;
  }

  return <PlatformAiSettings />;
}
