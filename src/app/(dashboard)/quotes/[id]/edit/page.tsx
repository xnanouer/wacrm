import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuotationEditor } from '@/components/quotes/quotation-editor';
import { requireRole } from '@/lib/auth/account';
import { loadQuotation } from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = { title: 'Editar cotización | Nexora' };

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireRole('agent');
  const { quotation } = await loadQuotation(ctx, id).catch(() => notFound());
  return <QuotationEditor initialQuotation={quotation} />;
}
