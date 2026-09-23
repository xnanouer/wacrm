import type { Metadata } from 'next';

import { ContractList } from '@/components/contracts/contract-list';
import { requireRole } from '@/lib/auth/account';
import { loadContractCreators, loadContracts } from '@/lib/contracts/server';
import {
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from '@/lib/contracts/types';
import { isUuid } from '@/lib/validation/uuid';

export const metadata: Metadata = { title: 'Contratos | Nexora' };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    creator?: string | string[];
  }>;
}) {
  const ctx = await requireRole('agent');
  const params = await searchParams;
  const query = first(params.q).trim();
  const creatorValue = first(params.creator);
  const creator = isUuid(creatorValue) ? creatorValue : '';
  const statusValue = first(params.status);
  const status =
    statusValue in CONTRACT_STATUS_LABELS
      ? (statusValue as ContractStatus)
      : undefined;
  const [result, creators] = await Promise.all([
    loadContracts(ctx, {
      query: query || undefined,
      status,
      createdByUserId: creator || undefined,
    }),
    loadContractCreators(ctx),
  ]);
  return (
    <ContractList
      contracts={result.contracts}
      total={result.total}
      creators={creators}
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      filters={{ query, status: statusValue, creator }}
    />
  );
}
