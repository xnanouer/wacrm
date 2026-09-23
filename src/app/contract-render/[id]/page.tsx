import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContractDocument } from '@/components/contracts/contract-document';
import { requireRole } from '@/lib/auth/account';
import { loadContract } from '@/lib/contracts/server';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = {
  title: 'Contrato de consignación',
  robots: { index: false, follow: false },
};

export default async function ContractRenderPage({
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
  const detail = await loadContract(ctx, id).catch(() => notFound());
  const version = detail.versions.find(
    (item) => item.versionNumber === versionNumber
  );
  if (!version || version.generationStatus === 'failed') notFound();
  return <ContractDocument data={version.snapshot} />;
}
