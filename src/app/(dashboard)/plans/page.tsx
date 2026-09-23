import type { Metadata } from 'next';

import { PlansAndPayments } from '@/components/billing/plans-and-payments';
import { requireRole } from '@/lib/auth/account';
import { getAccountPlanSummary } from '@/lib/billing/summary';

export const metadata: Metadata = {
  title: 'Planes y pagos | Nexora',
};

export default async function PlansPage() {
  const context = await requireRole('admin');
  const summary = await getAccountPlanSummary(context);

  return <PlansAndPayments summary={summary} />;
}
