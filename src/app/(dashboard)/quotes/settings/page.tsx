import type { Metadata } from 'next';

import { QuotationSettingsForm } from '@/components/quotes/quotation-settings';
import { requireRole } from '@/lib/auth/account';
import { loadQuotationSettings } from '@/lib/quotes/server';

export const metadata: Metadata = { title: 'Configurar cotizaciones | Nexora' };

export default async function QuotationSettingsPage() {
  const ctx = await requireRole('admin');
  return (
    <QuotationSettingsForm initialSettings={await loadQuotationSettings(ctx)} />
  );
}
