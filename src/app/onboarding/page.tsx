import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Clock3 } from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { UnauthorizedError, getCurrentAccount } from '@/lib/auth/account';
import { homePathForRole } from '@/lib/auth/route-access';

export const metadata: Metadata = {
  title: 'Configura tu empresa',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  let ctx;
  try {
    ctx = await getCurrentAccount({ allowInactive: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }
  const { data: account, error } = await ctx.supabase
    .from('accounts')
    .select(
      'id, name, logo_url, industry, onboarding_completed, onboarding_answers'
    )
    .eq('id', ctx.accountId)
    .single();
  if (error || !account) throw new Error('No pudimos cargar la empresa');
  if (account.onboarding_completed) redirect(homePathForRole(ctx.role));

  if (ctx.role !== 'owner') {
    return (
      <main className="subtle-grid bg-background flex min-h-screen items-center justify-center p-5">
        <section className="border-border bg-card w-full max-w-lg rounded-[28px] border p-8 text-center shadow-2xl">
          <BrandLockup className="mx-auto h-14 w-44" />
          <span className="bg-primary/10 text-primary mx-auto mt-8 flex size-16 items-center justify-center rounded-2xl">
            <Clock3 className="size-7" />
          </span>
          <h1 className="text-foreground mt-5 text-2xl font-bold">
            Tu empresa está preparando Nexora
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            El administrador principal debe terminar la configuración inicial.
            Cuando esté lista, podrás entrar directamente a tu espacio de
            trabajo.
          </p>
        </section>
      </main>
    );
  }

  const answers =
    account.onboarding_answers &&
    typeof account.onboarding_answers === 'object' &&
    !Array.isArray(account.onboarding_answers)
      ? (account.onboarding_answers as Record<string, unknown>)
      : {};
  return (
    <OnboardingWizard
      accountId={account.id}
      initialName={account.name}
      initialLogoUrl={account.logo_url ?? null}
      initialIndustry={account.industry ?? null}
      initialAnswers={answers}
    />
  );
}
