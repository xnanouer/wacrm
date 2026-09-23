import type { Metadata } from 'next';

import { QuotationList } from '@/components/quotes/quotation-list';
import { requireRole } from '@/lib/auth/account';
import { loadQuotations } from '@/lib/quotes/server';
import {
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from '@/lib/quotes/types';

export const metadata: Metadata = { title: 'Cotizaciones | Nexora' };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    contactId?: string | string[];
    q?: string | string[];
    status?: string | string[];
  }>;
}) {
  const ctx = await requireRole('agent');
  const params = await searchParams;
  const page = typeof params.page === 'string' ? Number(params.page) || 1 : 1;
  const contactId =
    typeof params.contactId === 'string' ? params.contactId : undefined;
  const query = typeof params.q === 'string' ? params.q : '';
  const requestedStatus =
    typeof params.status === 'string' ? params.status : '';
  const status = Object.hasOwn(QUOTATION_STATUS_LABELS, requestedStatus)
    ? (requestedStatus as QuotationStatus)
    : undefined;
  const result = await loadQuotations(ctx, {
    page,
    pageSize: 20,
    contactId,
    query,
    status,
  });
  return (
    <QuotationList
      initialQuotations={result.quotations}
      initialTotal={result.total}
      initialPage={result.page}
      pageSize={result.pageSize}
      initialQuery={query}
      initialStatus={status}
      contactId={contactId}
      role={ctx.role}
    />
  );
}
