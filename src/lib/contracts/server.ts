import 'server-only';

import type { AccountContext } from '@/lib/auth/account';
import type {
  CompanyContractSnapshot,
  CompanyLegalProfile,
  ContractEvent,
  ContractCreatorOption,
  ContractRecord,
  ContractStatus,
  ContractVersion,
  ContractDocumentData,
  ContractInput,
  ContractTemplateKey,
} from './types';

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function legalProfileFromRow(row: Row): CompanyLegalProfile {
  return {
    accountId: text(row.account_id),
    legalName: text(row.legal_name),
    tradeName: text(row.trade_name),
    taxId: text(row.tax_id),
    businessActivity: text(row.business_activity),
    legalAddress: text(row.legal_address),
    commune: text(row.commune),
    city: text(row.city),
    region: text(row.region),
    phone: text(row.phone),
    email: text(row.email),
    legalRepresentativeName: text(row.legal_representative_name),
    legalRepresentativeTaxId: text(row.legal_representative_tax_id),
    defaultBranchName: text(row.default_branch_name),
    defaultBranchAddress: text(row.default_branch_address),
  };
}

export async function loadCompanyLegalProfile(
  ctx: AccountContext
): Promise<CompanyLegalProfile> {
  const { data, error } = await ctx.supabase
    .from('account_legal_profiles')
    .select('*')
    .eq('account_id', ctx.accountId)
    .single();
  if (error || !data) throw new Error('company_legal_profile_load_failed');
  return legalProfileFromRow(data as Row);
}

export function contractFromRow(row: Row): ContractRecord {
  const supportedTemplates: ContractTemplateKey[] = [
    'vehicle_consignment_v1',
    'payment_commitment_v1',
    'vehicle_sale_direct_v1',
    'vehicle_sale_civil_union_v1',
    'vehicle_sale_company_v1',
    'vehicle_sale_seller_power_v1',
    'vehicle_sale_purchase_power_v1',
    'vehicle_reservation_v1',
    'vehicle_sale_power_v1',
    'vehicle_responsibility_declaration_v1',
  ];
  const templateKey = supportedTemplates.includes(
    row.template_key as ContractTemplateKey
  )
    ? (row.template_key as ContractTemplateKey)
    : 'vehicle_consignment_v1';
  return {
    id: text(row.id),
    accountId: text(row.account_id),
    contractNumber: text(row.contract_number),
    sequenceNumber: numberValue(row.sequence_number),
    templateKey,
    templateVersion: numberValue(row.template_version),
    status: row.status as ContractStatus,
    contactId: nullableText(row.contact_id),
    conversationId: nullableText(row.conversation_id),
    catalogItemId: nullableText(row.catalog_item_id),
    executiveUserId: nullableText(row.executive_user_id),
    consignorName: text(row.consignor_name),
    vehicleLabel: text(row.vehicle_label),
    issueDate: text(row.issue_date),
    input: (row.payload ?? {}) as ContractInput,
    currentVersion: numberValue(row.current_version),
    generatedAt: nullableText(row.generated_at),
    createdByUserId: text(row.created_by_user_id),
    createdByName: text(row.created_by_name) || 'Usuario de Nexora',
    updatedByUserId: text(row.updated_by_user_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function loadContracts(
  ctx: AccountContext,
  filters: {
    query?: string;
    status?: ContractStatus;
    createdByUserId?: string;
    page?: number;
  } = {}
): Promise<{ contracts: ContractRecord[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * 20;
  let query = ctx.supabase
    .from('contracts')
    .select('*', { count: 'exact' })
    .eq('account_id', ctx.accountId)
    .order('updated_at', { ascending: false })
    .range(from, from + 19);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.createdByUserId)
    query = query.eq('created_by_user_id', filters.createdByUserId);
  if (filters.query?.trim()) {
    const safe = filters.query.trim().replace(/[%_,()]/g, '');
    if (safe)
      query = query.or(
        `contract_number.ilike.%${safe}%,consignor_name.ilike.%${safe}%,vehicle_label.ilike.%${safe}%`
      );
  }
  const { data, error, count } = await query;
  if (error) throw new Error('contracts_load_failed');
  const rows = (data ?? []) as Row[];
  const creatorIds = [
    ...new Set(rows.map((row) => text(row.created_by_user_id)).filter(Boolean)),
  ];
  const creatorResult = creatorIds.length
    ? await ctx.supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('account_id', ctx.accountId)
        .in('user_id', creatorIds)
    : { data: [], error: null };
  if (creatorResult.error) throw new Error('contract_creators_load_failed');
  const creatorNames = new Map(
    (creatorResult.data ?? []).map((profile) => [
      profile.user_id,
      profile.full_name || profile.email || 'Usuario de Nexora',
    ])
  );
  return {
    contracts: rows.map((row) =>
      contractFromRow({
        ...row,
        created_by_name: creatorNames.get(text(row.created_by_user_id)),
      })
    ),
    total: count ?? 0,
  };
}

export async function loadContractCreators(
  ctx: AccountContext
): Promise<ContractCreatorOption[]> {
  const contractResult = await ctx.supabase
    .from('contracts')
    .select('created_by_user_id')
    .eq('account_id', ctx.accountId);
  if (contractResult.error) throw new Error('contract_creators_load_failed');
  const userIds = [
    ...new Set(
      (contractResult.data ?? [])
        .map((contract) => contract.created_by_user_id)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  if (!userIds.length) return [];
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('user_id, full_name, email')
    .eq('account_id', ctx.accountId)
    .in('user_id', userIds)
    .order('full_name');
  if (error) throw new Error('contract_creators_load_failed');
  return (data ?? []).map((profile) => ({
    userId: profile.user_id,
    name: profile.full_name || profile.email || 'Usuario de Nexora',
    email: profile.email || '',
  }));
}

export async function loadContract(
  ctx: AccountContext,
  contractId: string
): Promise<{
  contract: ContractRecord;
  versions: ContractVersion[];
  events: ContractEvent[];
}> {
  const [contractResult, versionResult, eventResult] = await Promise.all([
    ctx.supabase
      .from('contracts')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('id', contractId)
      .single(),
    ctx.supabase
      .from('contract_versions')
      .select('*')
      .eq('contract_id', contractId)
      .order('version_number', { ascending: false }),
    ctx.supabase
      .from('contract_events')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false }),
  ]);
  if (contractResult.error || !contractResult.data)
    throw new Error('contract_not_found');
  return {
    contract: contractFromRow(contractResult.data as Row),
    versions: ((versionResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      contractId: text(row.contract_id),
      versionNumber: numberValue(row.version_number),
      snapshot: row.snapshot as unknown as ContractDocumentData,
      generationStatus:
        row.generation_status === 'ready' || row.generation_status === 'failed'
          ? row.generation_status
          : 'pending',
      generationError: nullableText(row.generation_error),
      pdfStoragePath: nullableText(row.pdf_storage_path),
      createdAt: text(row.created_at),
    })),
    events: ((eventResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      eventType: row.event_type as ContractEvent['eventType'],
      actorUserId: nullableText(row.actor_user_id),
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: text(row.created_at),
    })),
  };
}

export async function buildContractDocumentData(
  ctx: AccountContext,
  contract: ContractRecord
): Promise<ContractDocumentData> {
  const [legalProfile, accountResult] = await Promise.all([
    loadCompanyLegalProfile(ctx),
    ctx.supabase
      .from('accounts')
      .select('name, logo_url')
      .eq('id', ctx.accountId)
      .single(),
  ]);
  if (accountResult.error || !accountResult.data)
    throw new Error('contract_company_load_failed');
  const company: CompanyContractSnapshot = {
    ...legalProfile,
    displayName:
      legalProfile.tradeName ||
      legalProfile.legalName ||
      accountResult.data.name,
    logoUrl: nullableText(accountResult.data.logo_url),
  };
  return { contract, company, generatedAt: new Date().toISOString() };
}
