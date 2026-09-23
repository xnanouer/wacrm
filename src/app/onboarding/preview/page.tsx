import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { UnauthorizedError, getCurrentAccount } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';

export const metadata: Metadata = {
  title: 'Vista previa del onboarding',
  robots: { index: false, follow: false },
};

export default async function OnboardingPreviewPage() {
  let ctx;
  try {
    ctx = await getCurrentAccount({ allowInactive: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }
  if (!hasMinRole(ctx.role, 'admin')) redirect('/inbox');

  const { data: account, error } = await ctx.supabase
    .from('accounts')
    .select('id, name, logo_url, industry, onboarding_answers')
    .eq('id', ctx.accountId)
    .single();
  if (error || !account) throw new Error('No pudimos cargar la empresa');

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
      previewMode
    />
  );
}
