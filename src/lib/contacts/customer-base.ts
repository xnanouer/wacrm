export const CUSTOMER_BASE_PAGE_SIZE = 25;
export const CUSTOMER_BASE_EXPORT_LIMIT = 50_000;

export type CustomerBaseSource = 'whatsapp' | 'facebook' | 'instagram';

export type CustomerBaseProfileFilter =
  'all' | 'complete' | 'incomplete' | 'with_data' | 'without_data';

export interface CustomerBaseTag {
  id: string;
  name: string;
  color: string;
}

export interface CustomerBaseRow {
  contact_id: string;
  account_id: string;
  full_name: string;
  rut: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  city: string | null;
  vehicle_interest: string | null;
  down_payment: string | null;
  income_proof: boolean | null;
  employment_type: string | null;
  employment_tenure: string | null;
  has_dicom: boolean | null;
  trade_in: boolean | null;
  trade_in_vehicle: string | null;
  purchase_timeline: string | null;
  financing_requested: boolean | null;
  evaluation_status: string | null;
  source: CustomerBaseSource | null;
  next_follow_up_at: string | null;
  commercial_notes: string | null;
  tag_ids: string[];
  tags: CustomerBaseTag[];
  conversation_id: string | null;
  conversation_status: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  assigned_agent_email: string | null;
  department_id: string | null;
  department_name: string | null;
  last_contact_at: string;
  profile_updated_at: string | null;
  has_profile: boolean;
  profile_completed_fields: number;
  profile_completion: number;
  search_text: string;
}

export interface CustomerBaseFilters {
  search: string;
  tagIds: string[];
  source: CustomerBaseSource | '';
  profile: CustomerBaseProfileFilter;
  assignedAgentId: string;
  departmentId: string;
  evaluationStatus: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_CUSTOMER_BASE_FILTERS: CustomerBaseFilters = {
  search: '',
  tagIds: [],
  source: '',
  profile: 'all',
  assignedAgentId: '',
  departmentId: '',
  evaluationStatus: '',
  dateFrom: '',
  dateTo: '',
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function parseCustomerBaseFilters(
  searchParams: URLSearchParams
): CustomerBaseFilters {
  const source = searchParams.get('source') ?? '';
  const profile = searchParams.get('profile') ?? 'all';
  const tagIds = (searchParams.get('tags') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(isUuid)
    .slice(0, 30);
  const assignedAgentId = searchParams.get('agent') ?? '';
  const departmentId = searchParams.get('department') ?? '';
  const dateFrom = searchParams.get('from') ?? '';
  const dateTo = searchParams.get('to') ?? '';

  return {
    search: (searchParams.get('search') ?? '').trim().slice(0, 200),
    tagIds,
    source:
      source === 'whatsapp' || source === 'facebook' || source === 'instagram'
        ? source
        : '',
    profile:
      profile === 'complete' ||
      profile === 'incomplete' ||
      profile === 'with_data' ||
      profile === 'without_data'
        ? profile
        : 'all',
    assignedAgentId: isUuid(assignedAgentId) ? assignedAgentId : '',
    departmentId: isUuid(departmentId) ? departmentId : '',
    evaluationStatus: (searchParams.get('status') ?? '').trim().slice(0, 80),
    dateFrom: isIsoDate(dateFrom) ? dateFrom : '',
    dateTo: isIsoDate(dateTo) ? dateTo : '',
  };
}

export function customerBaseSearchParams(
  filters: CustomerBaseFilters
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.tagIds.length) params.set('tags', filters.tagIds.join(','));
  if (filters.source) params.set('source', filters.source);
  if (filters.profile !== 'all') params.set('profile', filters.profile);
  if (filters.assignedAgentId) params.set('agent', filters.assignedAgentId);
  if (filters.departmentId) params.set('department', filters.departmentId);
  if (filters.evaluationStatus) params.set('status', filters.evaluationStatus);
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  return params;
}

export function profileFilterLabel(value: CustomerBaseProfileFilter): string {
  if (value === 'complete') return 'Ficha completa';
  if (value === 'incomplete') return 'Ficha incompleta';
  if (value === 'with_data') return 'Con información';
  if (value === 'without_data') return 'Sin información';
  return 'Todas las fichas';
}
