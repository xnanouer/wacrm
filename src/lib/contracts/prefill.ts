export type ContractPrefillSource = 'contact' | 'ai';

export interface ContractContactPrefill {
  contactId: string;
  conversationId: string | null;
  fullName: string;
  rut: string;
  phone: string;
  email: string;
  address: string;
  commune: string;
  city: string;
  region: string;
  company: string;
  occupation: string;
  monthlyIncome: number | null;
  employmentType: string;
  employmentTenure: string;
  downPayment: number | null;
  vehicleInterest: string;
  vehiclePlate: string;
  vehiclePrice: number | null;
  paymentMethod: string;
  financingRequested: boolean | null;
  sources: Partial<Record<ContractPrefillField, ContractPrefillSource>>;
  conflicts: ContractPrefillField[];
}

export type ContractPrefillField = Exclude<
  keyof ContractContactPrefill,
  'contactId' | 'conversationId' | 'sources' | 'conflicts'
>;

export interface ContractContactOption {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  rut: string | null;
  company: string | null;
  prefill: ContractContactPrefill;
}

interface ContactRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  rut: string | null;
  company: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  region: string | null;
  occupation: string | null;
  monthly_income: number | null;
  employment_type: string | null;
  employment_tenure: string | null;
  down_payment: number | null;
  interest_product: string | null;
  vehicle_plate: string | null;
  vehicle_price: number | null;
  payment_method: string | null;
  financing_requested: boolean | null;
  profile_sources: unknown;
}

interface LeadProfileRow {
  conversation_id: string;
  contact_id: string;
  full_name: string | null;
  rut: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  region: string | null;
  occupation: string | null;
  company: string | null;
  monthly_income: string | null;
  employment_type: string | null;
  employment_tenure: string | null;
  down_payment: string | null;
  vehicle_interest: string | null;
  vehicle_plate: string | null;
  vehicle_price: string | null;
  payment_method: string | null;
  financing_requested: boolean | null;
}

export function parseCustomerMoney(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  const millions = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:mill[oó]n|millones|mm)\b/
  );
  if (millions) {
    const amount = Number(millions[1].replace(',', '.')) * 1_000_000;
    return Number.isFinite(amount) ? Math.round(amount) : null;
  }
  const digits = normalized.replace(/[^\d]/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

function sourceForContactField(
  profileSources: unknown,
  field: string
): ContractPrefillSource {
  if (!profileSources || typeof profileSources !== 'object') return 'contact';
  const entry = (profileSources as Record<string, unknown>)[field];
  return entry &&
    typeof entry === 'object' &&
    (entry as { source?: unknown }).source === 'ai'
    ? 'ai'
    : 'contact';
}

export function buildContractContactPrefill(
  contact: ContactRow,
  profile: LeadProfileRow | null
): ContractContactPrefill {
  const sources: ContractContactPrefill['sources'] = {};
  const conflicts = new Set<ContractPrefillField>();
  const text = (
    field: ContractPrefillField,
    contactKey: keyof ContactRow,
    profileKey: keyof LeadProfileRow
  ): string => {
    const aiValue = profile?.[profileKey];
    if (typeof aiValue === 'string' && aiValue.trim()) {
      const contactValue = contact[contactKey];
      if (
        typeof contactValue === 'string' &&
        contactValue.trim() &&
        contactValue.trim().toLocaleLowerCase('es-CL') !==
          aiValue.trim().toLocaleLowerCase('es-CL')
      ) {
        conflicts.add(field);
      }
      sources[field] = 'ai';
      return aiValue.trim();
    }
    const contactValue = contact[contactKey];
    if (typeof contactValue === 'string' && contactValue.trim()) {
      sources[field] = sourceForContactField(
        contact.profile_sources,
        String(contactKey)
      );
      return contactValue.trim();
    }
    return '';
  };
  const money = (
    field: ContractPrefillField,
    contactKey: keyof ContactRow,
    profileKey: keyof LeadProfileRow
  ): number | null => {
    const aiValue = profile?.[profileKey];
    const parsed =
      typeof aiValue === 'string' ? parseCustomerMoney(aiValue) : null;
    if (parsed !== null) {
      const contactValue = contact[contactKey];
      if (
        typeof contactValue === 'number' &&
        Number.isFinite(contactValue) &&
        contactValue !== parsed
      ) {
        conflicts.add(field);
      }
      sources[field] = 'ai';
      return parsed;
    }
    const contactValue = contact[contactKey];
    if (typeof contactValue === 'number' && Number.isFinite(contactValue)) {
      sources[field] = sourceForContactField(
        contact.profile_sources,
        String(contactKey)
      );
      return contactValue;
    }
    return null;
  };

  let financingRequested = contact.financing_requested;
  if (typeof profile?.financing_requested === 'boolean') {
    if (
      typeof contact.financing_requested === 'boolean' &&
      contact.financing_requested !== profile.financing_requested
    ) {
      conflicts.add('financingRequested');
    }
    financingRequested = profile.financing_requested;
    sources.financingRequested = 'ai';
  } else if (typeof financingRequested === 'boolean') {
    sources.financingRequested = sourceForContactField(
      contact.profile_sources,
      'financing_requested'
    );
  }

  const result: ContractContactPrefill = {
    contactId: contact.id,
    conversationId: profile?.conversation_id ?? null,
    fullName: text('fullName', 'name', 'full_name'),
    rut: text('rut', 'rut', 'rut'),
    phone: text('phone', 'phone', 'phone'),
    email: text('email', 'email', 'email'),
    address: text('address', 'address', 'address'),
    commune: text('commune', 'commune', 'commune'),
    city: text('city', 'city', 'city'),
    region: text('region', 'region', 'region'),
    company: text('company', 'company', 'company'),
    occupation: text('occupation', 'occupation', 'occupation'),
    monthlyIncome: money('monthlyIncome', 'monthly_income', 'monthly_income'),
    employmentType: text(
      'employmentType',
      'employment_type',
      'employment_type'
    ),
    employmentTenure: text(
      'employmentTenure',
      'employment_tenure',
      'employment_tenure'
    ),
    downPayment: money('downPayment', 'down_payment', 'down_payment'),
    vehicleInterest: text(
      'vehicleInterest',
      'interest_product',
      'vehicle_interest'
    ),
    vehiclePlate: text('vehiclePlate', 'vehicle_plate', 'vehicle_plate'),
    vehiclePrice: money('vehiclePrice', 'vehicle_price', 'vehicle_price'),
    paymentMethod: text('paymentMethod', 'payment_method', 'payment_method'),
    financingRequested,
    sources,
    conflicts: [...conflicts],
  };

  // Keep the source map restricted to values actually present.
  for (const [field, source] of Object.entries(result.sources)) {
    if (!source || !hasValue(result[field as ContractPrefillField])) {
      delete result.sources[field as ContractPrefillField];
    }
  }
  return result;
}
