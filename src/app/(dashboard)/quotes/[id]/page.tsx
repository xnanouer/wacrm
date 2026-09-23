import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuotationDetail } from '@/components/quotes/quotation-detail';
import { requireRole } from '@/lib/auth/account';
import { buildQuotationDocumentData, loadQuotation } from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = { title: 'Cotización | Nexora' };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireRole('agent');
  const detail = await loadQuotation(ctx, id).catch(() => notFound());
  const currentDocument = await buildQuotationDocumentData(
    ctx,
    detail.quotation
  ).catch(() => notFound());
  return (
    <QuotationDetail
      quotation={detail.quotation}
      versions={detail.versions}
      sends={detail.sends}
      events={detail.events}
      currentDocument={currentDocument}
      role={ctx.role}
    />
  );
}
