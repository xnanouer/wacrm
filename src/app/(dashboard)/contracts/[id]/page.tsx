import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContractDetail } from '@/components/contracts/contract-detail';
import { requireRole } from '@/lib/auth/account';
import {
  buildContractDocumentData,
  loadContract,
} from '@/lib/contracts/server';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = { title: 'Contrato | Nexora' };

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await requireRole('agent');
  const detail = await loadContract(ctx, id).catch(() => notFound());
  const preview = await buildContractDocumentData(ctx, detail.contract).catch(
    () => notFound()
  );
  return (
    <ContractDetail
      {...detail}
      preview={preview}
      currentUserId={ctx.userId}
      currentRole={ctx.role}
    />
  );
}
