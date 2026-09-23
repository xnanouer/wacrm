import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Database,
  LifeBuoy,
  LockKeyhole,
} from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { BillingSignOut } from '@/components/billing/billing-sign-out';
import { BillingRecoveryActions } from '@/components/billing/billing-recovery-actions';
import { buttonVariants } from '@/components/ui/button';
import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentAccount,
} from '@/lib/auth/account';
import {
  hasOperationalAccess,
  subscriptionStatusLabel,
} from '@/lib/billing/access';
import { requirePlatformRole } from '@/lib/platform/auth';

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function BillingPage() {
  let context;
  try {
    context = await getCurrentAccount({ allowInactive: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    if (error instanceof ForbiddenError) redirect('/login');
    throw error;
  }

  if (hasOperationalAccess(context.account)) redirect('/dashboard');

  let hasPlatformAccess = false;
  try {
    await requirePlatformRole('platform_support');
    hasPlatformAccess = true;
  } catch {
    hasPlatformAccess = false;
  }

  const account = context.account;
  const isManager = context.role === 'owner' || context.role === 'admin';
  const relevantDate =
    account.subscription_status === 'trialing'
      ? formatDate(account.trial_ends_at)
      : formatDate(account.suspended_at);

  return (
    <main className="subtle-grid bg-background flex min-h-screen items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <BrandLockup className="h-16 w-[194px]" />
          <div className="flex items-center gap-2">
            {hasPlatformAccess && (
              <Link
                href="/platform"
                className={buttonVariants({ variant: 'outline' })}
              >
                Administrar Nexora
              </Link>
            )}
            <BillingSignOut />
          </div>
        </div>

        <section className="surface-elevated overflow-hidden rounded-3xl">
          <div className="border-border border-b bg-[linear-gradient(120deg,color-mix(in_oklab,var(--card)_97%,transparent),color-mix(in_oklab,var(--destructive)_9%,var(--card)))] p-6 sm:p-9">
            <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <LockKeyhole className="size-7" />
            </div>
            <p className="text-muted-foreground text-xs font-bold tracking-[0.15em] uppercase">
              {account.name} · {account.plan_code}
            </p>
            <h1 className="text-foreground mt-2 text-3xl font-bold tracking-tight">
              Acceso temporalmente restringido
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
              La cuenta está{' '}
              {subscriptionStatusLabel(
                account.subscription_status
              ).toLowerCase()}
              . Sus datos continúan protegidos y no han sido eliminados.
            </p>
          </div>

          <div className="space-y-6 p-6 sm:p-9">
            {account.suspension_reason && (
              <div className="flex gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    Motivo
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {account.suspension_reason}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Database,
                  title: 'Datos conservados',
                  text: 'Contactos y conversaciones permanecen seguros.',
                },
                {
                  icon: CreditCard,
                  title: 'Sin operaciones',
                  text: 'Se bloquean envíos y cambios mientras dure la restricción.',
                },
                {
                  icon: CheckCircle2,
                  title: 'Reactivación simple',
                  text: 'El acceso vuelve al regularizar la suscripción.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="border-border bg-muted/25 rounded-2xl border p-4"
                >
                  <item.icon className="text-primary size-5" />
                  <p className="text-foreground mt-3 text-sm font-semibold">
                    {item.title}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            {relevantDate && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <CalendarClock className="size-4" /> Fecha relacionada:{' '}
                {relevantDate}
              </div>
            )}

            <div className="border-border flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <LifeBuoy className="text-primary mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {isManager
                      ? 'Regulariza la cuenta con soporte Nexora'
                      : 'Contacta al administrador de tu empresa'}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {isManager
                      ? 'Puedes regularizar el plan directamente con Mercado Pago.'
                      : 'Solo un administrador puede resolver la suscripción.'}
                  </p>
                </div>
              </div>
            </div>

            {isManager ? (
              <BillingRecoveryActions currentPlanCode={account.plan_code} />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
