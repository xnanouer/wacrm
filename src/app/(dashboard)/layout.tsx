import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardShell } from './dashboard-shell';
import {
  AccountInactiveError,
  UnauthorizedError,
  getCurrentAccount,
} from '@/lib/auth/account';
import { canAccessAppPath, homePathForRole } from '@/lib/auth/route-access';

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and middleware redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let redirectTo: string | null = null;
  try {
    const [ctx, requestHeaders] = await Promise.all([
      getCurrentAccount(),
      headers(),
    ]);
    const pathname = requestHeaders.get('x-nexora-pathname') ?? '/dashboard';
    if (!ctx.onboardingCompleted) {
      redirectTo = '/onboarding';
    } else if (!canAccessAppPath(ctx.role, pathname)) {
      redirectTo = homePathForRole(ctx.role);
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) redirectTo = '/login';
    else if (error instanceof AccountInactiveError) redirectTo = '/billing';
    else throw error;
  }

  if (redirectTo) redirect(redirectTo);
  return <DashboardShell>{children}</DashboardShell>;
}
