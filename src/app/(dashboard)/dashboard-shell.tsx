'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { NexoraSupportChat } from '@/components/support/nexora-support-chat';
import { NexoraBenefitNotifications } from '@/components/notifications/nexora-benefit-notifications';
import { IncomingMessageNotifier } from '@/components/notifications/incoming-message-notifier';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { cn } from '@/lib/utils';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, account } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isWorkspaceCanvas = pathname.startsWith('/inbox');
  const totalUnread = useTotalUnread();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(
    () => setSidebarOpen(false),
    [setSidebarOpen]
  );

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    document.title =
      totalUnread > 0 ? `(${totalUnread}) Nexora CRM` : 'Nexora CRM';

    return () => {
      document.title = 'Nexora CRM';
    };
  }, [pathname, totalUnread]);

  if (loading) {
    return (
      <div className="subtle-grid bg-background flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary/20 bg-primary/10 shadow-primary/20 relative flex size-14 items-center justify-center rounded-2xl border shadow-2xl">
            <div className="border-primary size-6 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Preparando tu espacio...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="nexora-workspace bg-background flex h-dvh min-h-0 w-full max-w-full overflow-hidden pt-[env(safe-area-inset-top)] md:pt-0">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <NexoraBenefitNotifications />
      <IncomingMessageNotifier userId={user.id} />
      <NexoraSupportChat />
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        totalUnread={totalUnread}
      />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className={cn(isWorkspaceCanvas && 'hidden md:block')}>
          <Header onOpenSidebar={() => setSidebarOpen(true)} />
        </div>
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="nexora-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div
            className={cn(
              'mx-auto w-full',
              isWorkspaceCanvas
                ? 'h-full max-w-none p-0'
                : 'max-w-[1720px] px-4 py-5 sm:px-7 sm:py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-11'
            )}
          >
            {account?.subscription_status === 'past_due' && (
              <div className="mb-6 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-amber-300 shadow-sm">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Pago pendiente</p>
                  <p className="mt-1 text-sm leading-6 text-amber-200/75">
                    La empresa mantiene acceso durante el periodo de gracia
                    {account.grace_ends_at
                      ? ` hasta el ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(account.grace_ends_at))}`
                      : ''}
                    .
                  </p>
                </div>
              </div>
            )}
            {account?.subscription_status === 'trialing' && (
              <div className="border-primary/20 bg-primary/6 text-primary mb-6 flex gap-3 rounded-2xl border p-4 shadow-sm">
                <CalendarClock className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Periodo de prueba</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {account.trial_ends_at
                      ? `Disponible hasta el ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(new Date(account.trial_ends_at))}.`
                      : 'La cuenta se encuentra en evaluación.'}
                  </p>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>
        <MobileBottomNav
          onOpenMore={() => setSidebarOpen(true)}
          moreOpen={sidebarOpen}
          totalUnread={totalUnread}
        />
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
