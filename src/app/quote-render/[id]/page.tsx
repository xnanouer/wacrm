import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuotationDocument } from '@/components/quotes/quotation-document';
import { requireRole } from '@/lib/auth/account';
import { loadQuotation } from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = {
  title: 'Documento de cotización',
  robots: { index: false, follow: false },
};

export default async function QuotationRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const versionNumber =
    typeof query.version === 'string' ? Number(query.version) : 0;
  if (!Number.isInteger(versionNumber) || versionNumber < 1) notFound();
  const ctx = await requireRole('agent');
  const detail = await loadQuotation(ctx, id).catch(() => notFound());
  const version = detail.versions.find(
    (item) => item.versionNumber === versionNumber
  );
  if (!version || version.generationStatus === 'failed') notFound();
  return <QuotationDocument data={version.snapshot} />;
}
