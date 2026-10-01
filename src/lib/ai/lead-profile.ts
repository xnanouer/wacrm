import type { SupabaseClient } from '@supabase/supabase-js';

import {
  LEAD_PROFILE_END_SENTINEL,
  LEAD_PROFILE_START_SENTINEL,
} from './defaults';
import type {
  ChatMessage,
  ConversationLeadProfile,
  LeadProfilePatch,
} from './types';

const TEXT_LIMITS: Record<keyof LeadProfilePatch, number> = {
  full_name: 160,
  rut: 20,
  phone: 40,
  email: 254,
  address: 300,
  commune: 160,
  city: 160,
  region: 160,
  occupation: 160,
  company: 200,
  monthly_income: 120,
  vehicle_interest: 300,
  vehicle_plate: 20,
  vehicle_price: 120,
  down_payment: 120,
  payment_method: 160,
  income_proof: 0,
  employment_type: 160,
  employment_tenure: 160,
  has_dicom: 0,
  trade_in: 0,
  trade_in_vehicle: 300,
  purchase_timeline: 160,
  financing_requested: 0,
};

const BOOLEAN_KEYS = new Set<keyof LeadProfilePatch>([
  'income_proof',
  'has_dicom',
  'trade_in',
  'financing_requested',
]);

const PROFILE_COLUMNS =
  'id, account_id, conversation_id, contact_id, full_name, rut, phone, email, address, commune, city, region, occupation, company, monthly_income, vehicle_interest, vehicle_plate, vehicle_price, down_payment, payment_method, income_proof, employment_type, employment_tenure, has_dicom, trade_in, trade_in_vehicle, purchase_timeline, financing_requested, captured_by_ai, updated_at';

export function sanitizeLeadProfilePatch(value: unknown): LeadProfilePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const patch: LeadProfilePatch = {};

  for (const key of Object.keys(TEXT_LIMITS) as Array<keyof LeadProfilePatch>) {
    const candidate = source[key];
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof candidate === 'boolean') {
        (patch as Record<string, unknown>)[key] = candidate;
      }
      continue;
    }
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    (patch as Record<string, unknown>)[key] = normalized.slice(
      0,
      TEXT_LIMITS[key]
    );
  }

  return patch;
}

export function extractLeadProfilePatch(raw: string): LeadProfilePatch {
  const start = raw.lastIndexOf(LEAD_PROFILE_START_SENTINEL);
  if (start < 0) return {};
  const contentStart = start + LEAD_PROFILE_START_SENTINEL.length;
  const end = raw.indexOf(LEAD_PROFILE_END_SENTINEL, contentStart);
  if (end < 0) return {};

  try {
    return sanitizeLeadProfilePatch(
      JSON.parse(raw.slice(contentStart, end).trim())
    );
  } catch {
    return {};
  }
}

/** Parse the dedicated extractor's JSON response. The fence fallback keeps
 * the workflow resilient when a provider wraps otherwise valid JSON in a
 * Markdown code block despite being instructed not to. */
export function parseLeadProfileJson(raw: string): LeadProfilePatch {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return {};

  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'profile' in parsed
    ) {
      return sanitizeLeadProfilePatch(
        (parsed as { profile?: unknown }).profile
      );
    }
    return sanitizeLeadProfilePatch(parsed);
  } catch {
    return {};
  }
}

export function shouldExtractLeadProfile(messages: ChatMessage[]): boolean {
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === 'user' && message.content.trim().length > 0
  );
  if (latestUserIndex < 0) return false;

  const latestUser = messages[latestUserIndex].content;
  const previousAssistant = messages
    .slice(0, latestUserIndex)
    .findLast((message) => message.role === 'assistant')?.content;
  const qualificationSignal = [previousAssistant, latestUser]
    .filter(Boolean)
    .join(' ');

  return /\b(nombre|rut|tel[eé]fono|correo|email|domicilio|direcci[oó]n|ciudad|comuna|regi[oó]n|profesi[oó]n|ocupaci[oó]n|empresa|veh[ií]culo|auto|suv|camioneta|modelo|marca|patente|precio|pie|presupuesto|pago|financia|cr[eé]dito|ingres|contrato|indefinido|plazo fijo|antig[uü]edad|dicom|parte de pago|cotizaci[oó]n|cotizaciones|comprar|compra)\b/i.test(
    qualificationSignal
  );
}

export function buildLeadProfileExtractionPrompt(
  profile: ConversationLeadProfile,
  configuredFields: string[]
): string {
  const existing = {
    full_name: profile.full_name,
    rut: profile.rut,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    commune: profile.commune,
    city: profile.city,
    region: profile.region,
    occupation: profile.occupation,
    company: profile.company,
    monthly_income: profile.monthly_income,
    vehicle_interest: profile.vehicle_interest,
    vehicle_plate: profile.vehicle_plate,
    vehicle_price: profile.vehicle_price,
    down_payment: profile.down_payment,
    payment_method: profile.payment_method,
    income_proof: profile.income_proof,
    employment_type: profile.employment_type,
    employment_tenure: profile.employment_tenure,
    has_dicom: profile.has_dicom,
    trade_in: profile.trade_in,
    trade_in_vehicle: profile.trade_in_vehicle,
    purchase_timeline: profile.purchase_timeline,
    financing_requested: profile.financing_requested,
  };

  return [
    'Eres un extractor interno de datos de precalificación para un CRM.',
    'Lee la conversación completa y devuelve únicamente un objeto JSON válido, sin Markdown ni explicaciones.',
    `La empresa desea recopilar: ${configuredFields.join(', ')}.`,
    `Datos ya guardados: ${JSON.stringify(existing)}.`,
    'Incluye solo datos nuevos o correcciones que el cliente haya confirmado explícitamente. Usa la pregunta inmediatamente anterior para interpretar respuestas breves como "sí", "Santiago" o "indefinido".',
    'No copies como hecho una afirmación hecha solamente por el asistente. No inventes ni deduzcas aprobación financiera. Si no hay datos nuevos confirmados, devuelve {}.',
    'Extrae también datos permitidos que el cliente entregue espontáneamente, aunque no estén en la lista deseada.',
    'Claves permitidas: full_name, rut, phone, email, address, commune, city, region, occupation, company, monthly_income, vehicle_interest, vehicle_plate, vehicle_price, down_payment, payment_method, income_proof, employment_type, employment_tenure, has_dicom, trade_in, trade_in_vehicle, purchase_timeline, financing_requested.',
    'income_proof, has_dicom, trade_in y financing_requested deben ser booleanos true o false. Todos los demás valores deben ser texto. Omite claves no confirmadas.',
  ].join('\n');
}

export function stripLeadProfileBlock(raw: string): string {
  const escapedStart = LEAD_PROFILE_START_SENTINEL.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
  const escapedEnd = LEAD_PROFILE_END_SENTINEL.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
  return raw
    .replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, 'g'), '')
    .trim();
}

export async function loadConversationLeadProfile(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
}): Promise<ConversationLeadProfile> {
  const { db, accountId, conversationId, contactId } = args;
  const [{ data: profile, error }, { data: contact }] = await Promise.all([
    db
      .from('conversation_lead_profiles')
      .select(PROFILE_COLUMNS)
      .eq('account_id', accountId)
      .eq('conversation_id', conversationId)
      .maybeSingle(),
    db
      .from('contacts')
      .select('name, phone, email, company')
      .eq('account_id', accountId)
      .eq('id', contactId)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (profile) return profile as ConversationLeadProfile;

  return {
    id: null,
    account_id: accountId,
    conversation_id: conversationId,
    contact_id: contactId,
    full_name: contact?.name?.trim() || null,
    rut: null,
    phone: contact?.phone?.trim() || null,
    email: contact?.email?.trim() || null,
    address: null,
    commune: null,
    city: null,
    region: null,
    occupation: null,
    company: contact?.company?.trim() || null,
    monthly_income: null,
    vehicle_interest: null,
    vehicle_plate: null,
    vehicle_price: null,
    down_payment: null,
    payment_method: null,
    income_proof: null,
    employment_type: null,
    employment_tenure: null,
    has_dicom: null,
    trade_in: null,
    trade_in_vehicle: null,
    purchase_timeline: null,
    financing_requested: null,
    captured_by_ai: true,
    updated_at: null,
  };
}

export async function saveConversationLeadProfile(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  sourceMessageId: string | null;
  patch: LeadProfilePatch;
}): Promise<void> {
  const cleanPatch = sanitizeLeadProfilePatch(args.patch);
  if (Object.keys(cleanPatch).length === 0) return;

  const current = await loadConversationLeadProfile(args);
  const payload = {
    account_id: args.accountId,
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    full_name: current.full_name,
    rut: current.rut,
    phone: current.phone,
    email: current.email,
    address: current.address,
    commune: current.commune,
    city: current.city,
    region: current.region,
    occupation: current.occupation,
    company: current.company,
    monthly_income: current.monthly_income,
    vehicle_interest: current.vehicle_interest,
    vehicle_plate: current.vehicle_plate,
    vehicle_price: current.vehicle_price,
    down_payment: current.down_payment,
    payment_method: current.payment_method,
    income_proof: current.income_proof,
    employment_type: current.employment_type,
    employment_tenure: current.employment_tenure,
    has_dicom: current.has_dicom,
    trade_in: current.trade_in,
    trade_in_vehicle: current.trade_in_vehicle,
    purchase_timeline: current.purchase_timeline,
    financing_requested: current.financing_requested,
    captured_by_ai: true,
    last_source_message_id: args.sourceMessageId,
    ...cleanPatch,
  };

  const { error } = await args.db
    .from('conversation_lead_profiles')
    .upsert(payload, { onConflict: 'conversation_id' });
  if (error) throw error;

  try {
    await syncMissingContactFields({
      db: args.db,
      accountId: args.accountId,
      contactId: args.contactId,
      conversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId,
      profile: payload,
    });
  } catch (syncError) {
    // The conversation profile remains available even if the central contact
    // could not be completed. A CRM write must never suppress a valid reply.
    console.error('[ai-lead-profile] contact sync failed', syncError);
  }
}

export function parseLeadProfileMoney(value: string | null): number | null {
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

function normalizeRut(value: string): string {
  return value.replace(/[^0-9kK]/g, '').toUpperCase();
}

async function syncMissingContactFields(args: {
  db: SupabaseClient;
  accountId: string;
  contactId: string;
  conversationId: string;
  sourceMessageId: string | null;
  profile: Record<string, unknown>;
}): Promise<void> {
  const { data: contact, error } = await args.db
    .from('contacts')
    .select(
      'name, rut, email, company, address, commune, city, region, occupation, monthly_income, employment_type, employment_tenure, payment_method, interest_product, vehicle_plate, vehicle_price, down_payment, financing_requested, profile_sources'
    )
    .eq('account_id', args.accountId)
    .eq('id', args.contactId)
    .maybeSingle();
  if (error) throw error;
  if (!contact) return;

  const textMappings = {
    name: 'full_name',
    rut: 'rut',
    email: 'email',
    company: 'company',
    address: 'address',
    commune: 'commune',
    city: 'city',
    region: 'region',
    occupation: 'occupation',
    employment_type: 'employment_type',
    employment_tenure: 'employment_tenure',
    payment_method: 'payment_method',
    interest_product: 'vehicle_interest',
    vehicle_plate: 'vehicle_plate',
  } as const;
  const update: Record<string, unknown> = {};
  const sources =
    contact.profile_sources &&
    typeof contact.profile_sources === 'object' &&
    !Array.isArray(contact.profile_sources)
      ? { ...(contact.profile_sources as Record<string, unknown>) }
      : {};
  const source = {
    source: 'ai',
    status: 'captured',
    conversationId: args.conversationId,
    messageId: args.sourceMessageId,
    updatedAt: new Date().toISOString(),
  };

  for (const [contactKey, profileKey] of Object.entries(textMappings)) {
    const current = contact[contactKey as keyof typeof contact];
    const candidate = args.profile[profileKey];
    if (
      (current === null || current === undefined || current === '') &&
      typeof candidate === 'string' &&
      candidate.trim()
    ) {
      update[contactKey] = candidate.trim();
      sources[contactKey] = source;
      if (contactKey === 'rut') update.rut_normalized = normalizeRut(candidate);
    }
  }

  for (const [contactKey, profileKey] of [
    ['monthly_income', 'monthly_income'],
    ['vehicle_price', 'vehicle_price'],
    ['down_payment', 'down_payment'],
  ] as const) {
    if (contact[contactKey] !== null) continue;
    const candidate = args.profile[profileKey];
    const amount =
      typeof candidate === 'string' ? parseLeadProfileMoney(candidate) : null;
    if (amount !== null) {
      update[contactKey] = amount;
      sources[contactKey] = source;
    }
  }

  if (
    contact.financing_requested === null &&
    typeof args.profile.financing_requested === 'boolean'
  ) {
    update.financing_requested = args.profile.financing_requested;
    sources.financing_requested = source;
  }

  if (Object.keys(update).length === 0) return;
  update.profile_sources = sources;
  update.last_profile_conversation_id = args.conversationId;
  update.last_profile_source_message_id = args.sourceMessageId;
  const { error: updateError } = await args.db
    .from('contacts')
    .update(update)
    .eq('account_id', args.accountId)
    .eq('id', args.contactId);
  if (updateError) throw updateError;
}

function answer(value: boolean | null): string {
  return value === null ? 'sin confirmar' : value ? 'sí' : 'no';
}

export function buildLeadQualificationContext(
  profile: ConversationLeadProfile,
  configuredFields: string[]
): string {
  return [
    'Herramienta interna de precalificación de Nexora.',
    `Datos solicitados por la empresa: ${configuredFields.join(', ')}.`,
    'Datos ya confirmados (no vuelvas a preguntarlos):',
    `- Nombre completo: ${profile.full_name || 'sin confirmar'}`,
    `- RUT: ${profile.rut || 'sin confirmar'}`,
    `- Teléfono: ${profile.phone || 'sin confirmar'}`,
    `- Correo: ${profile.email || 'sin confirmar'}`,
    `- Domicilio: ${profile.address || 'sin confirmar'}`,
    `- Comuna: ${profile.commune || 'sin confirmar'}`,
    `- Ciudad o comuna: ${profile.city || 'sin confirmar'}`,
    `- Región: ${profile.region || 'sin confirmar'}`,
    `- Ocupación: ${profile.occupation || 'sin confirmar'}`,
    `- Empresa: ${profile.company || 'sin confirmar'}`,
    `- Ingreso mensual: ${profile.monthly_income || 'sin confirmar'}`,
    `- Vehículo que busca: ${profile.vehicle_interest || 'sin confirmar'}`,
    `- Patente: ${profile.vehicle_plate || 'sin confirmar'}`,
    `- Precio del vehículo: ${profile.vehicle_price || 'sin confirmar'}`,
    `- Pie disponible: ${profile.down_payment || 'sin confirmar'}`,
    `- Forma de pago: ${profile.payment_method || 'sin confirmar'}`,
    `- Acredita ingresos: ${answer(profile.income_proof)}`,
    `- Tipo de contrato: ${profile.employment_type || 'sin confirmar'}`,
    `- Antigüedad laboral: ${profile.employment_tenure || 'sin confirmar'}`,
    `- Declara DICOM: ${answer(profile.has_dicom)}`,
    `- Entrega vehículo en parte de pago: ${answer(profile.trade_in)}`,
    `- Vehículo en parte de pago: ${profile.trade_in_vehicle || 'sin confirmar'}`,
    `- Cuándo desea comprar: ${profile.purchase_timeline || 'sin confirmar'}`,
    `- Solicita financiamiento: ${answer(profile.financing_requested)}`,
    'Conversa como un asesor humano. Primero ayuda con la necesidad del cliente y recopila gradualmente, como máximo dos preguntas relacionadas por mensaje. Pregunta solamente datos incluidos en "Datos solicitados por la empresa"; conserva cualquier otro dato si el cliente lo entrega espontáneamente. No envíes un formulario ni preguntes de nuevo algo confirmado.',
    'Pregunta RUT, acreditación de ingresos, contrato, antigüedad y DICOM únicamente si el cliente pide financiamiento. Explica brevemente que se usan para orientar una precalificación; no prometas aprobación ni consultes bases externas.',
    'El RUT y DICOM son datos sensibles: no los repitas completos en la respuesta. Si el cliente no desea entregarlos, respétalo y ofrece continuar con un ejecutivo.',
    'Al final de tu respuesta agrega obligatoriamente un bloque interno cuando el cliente haya confirmado datos nuevos o corregido datos anteriores. Este bloque es una excepción autorizada a la regla de responder solo con el mensaje visible. Incluye únicamente esos campos, nunca supongas valores:',
    `${LEAD_PROFILE_START_SENTINEL}{"full_name":"...","rut":"...","phone":"...","email":"...","address":"...","commune":"...","city":"...","region":"...","occupation":"...","company":"...","monthly_income":"...","vehicle_interest":"...","vehicle_plate":"...","vehicle_price":"...","down_payment":"...","payment_method":"...","income_proof":true,"employment_type":"...","employment_tenure":"...","has_dicom":false,"trade_in":true,"trade_in_vehicle":"...","purchase_timeline":"...","financing_requested":true}${LEAD_PROFILE_END_SENTINEL}`,
    'Los booleanos deben ser true o false. Omite cualquier campo no confirmado. Este bloque no lo verá el cliente.',
  ].join('\n');
}
