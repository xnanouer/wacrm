// ============================================================
// Shared types for Nexora's managed AI reply assistant.
//
// One small provider-agnostic surface so the inbox draft route and the
// inbound auto-reply bot both talk to `generateReply` without caring
// whether the account is on OpenAI or Anthropic.
// ============================================================

export type AiProvider = 'openai' | 'anthropic';
export type AiResponseMode = 'text' | 'audio' | 'match_inbound';

/**
 * Account behavior combined with Nexora's platform credentials. Produced by
 * `loadAiConfig`; `apiKey` exists only inside the server runtime and is never
 * returned to a tenant client.
 */
export interface AiConfig {
  id: string;
  provider: AiProvider;
  model: string;
  apiKey: string;
  systemPrompt: string | null;
  isActive: boolean;
  autoReplyEnabled: boolean;
  /** Null means unlimited automatic replies. Human assignment, handoff and
   * account switches remain authoritative stop conditions. */
  autoReplyMaxPerConversation: number | null;
  catalogAiEnabled: boolean;
  catalogAiAutoSend: boolean;
  catalogDeliveryMode: import('./agent-schema').AiCatalogDeliveryMode;
  catalogAiMaxItems: number;
  responseMode: AiResponseMode;
  /** Platform-owned speech configuration. These values are resolved only on
   * the server and are never returned to a tenant browser. */
  audioEnabled: boolean;
  transcriptionModel: string | null;
  speechModel: string | null;
  speechVoice: string | null;
  agentName: string;
  agentTitle: string;
  language: string;
  introductionEnabled: boolean;
  introductionText: string;
  welcomeMessage: string;
  outOfHoursMessage: string;
  tone: string;
  customTone: string;
  primaryObjective: string;
  customObjective: string;
  additionalInstructions: string;
  operatingMode: 'suggestion' | 'semi_automatic' | 'automatic';
  activeSchedule: import('./agent-schema').AiActiveSchedule;
  timezone: string;
  afterHoursBehavior: string;
  afterHoursCoverageEnabled: boolean;
  afterHoursScope: 'all' | 'selected';
  afterHoursMaxRepliesPerConversation: number;
  afterHoursDailyPointsLimit: number | null;
  afterHoursMonthlyPointsLimit: number | null;
  afterHoursNoPointsBehavior: 'no_reply' | 'leave_pending' | 'static_message';
  manualAiDelegationEnabled: boolean;
  businessDescription: string;
  businessIndustry: string;
  businessAddresses: string[];
  businessPhones: string[];
  businessEmails: string[];
  businessServiceAreas: string[];
  businessChannels: string[];
  generalPolicies: string;
  generalRequirements: string;
  authorizedCommercialInfo: string;
  permissions: import('./agent-schema').AiPermissions;
  leadFields: string[];
  escalationRules: string[];
  /** Optional OpenAI-compatible key for embeddings. When set, the
   *  knowledge base is embedded and semantic retrieval turns on; when
   *  null, retrieval falls back to lexical full-text search. */
  embeddingsApiKey: string | null;
}

export const AI_CONFIG_RUNTIME_DEFAULTS = {
  catalogDeliveryMode: 'summary_first' as const,
  agentName: 'Asistente Nexora',
  agentTitle: 'Asistente virtual',
  language: 'es-CL',
  introductionEnabled: true,
  introductionText: '',
  welcomeMessage: '',
  outOfHoursMessage: '',
  tone: 'professional',
  customTone: '',
  primaryObjective: 'answer_faqs',
  customObjective: '',
  additionalInstructions: '',
  operatingMode: 'suggestion' as const,
  activeSchedule: 'always' as const,
  timezone: 'America/Santiago',
  afterHoursBehavior: 'suggestions_only',
  afterHoursCoverageEnabled: false,
  afterHoursScope: 'all' as const,
  afterHoursMaxRepliesPerConversation: 5,
  afterHoursDailyPointsLimit: null as number | null,
  afterHoursMonthlyPointsLimit: null as number | null,
  afterHoursNoPointsBehavior: 'leave_pending' as const,
  manualAiDelegationEnabled: true,
  audioEnabled: false,
  transcriptionModel: null as string | null,
  speechModel: null as string | null,
  speechVoice: null as string | null,
  businessDescription: '',
  businessIndustry: '',
  businessAddresses: [] as string[],
  businessPhones: [] as string[],
  businessEmails: [] as string[],
  businessServiceAreas: [] as string[],
  businessChannels: [] as string[],
  generalPolicies: '',
  generalRequirements: '',
  authorizedCommercialInfo: '',
  permissions: {
    generate_suggestions: true,
    summarize_conversations: false,
    classify_leads: false,
    read_contact: false,
    read_opportunities: false,
    query_catalog: false,
    suggest_catalog_items: false,
    create_followups: false,
    recommend_handoff: true,
    understand_audio: false,
    generate_audio: false,
    query_future_availability: false,
    request_future_appointment: false,
  },
  leadFields: [] as string[],
  escalationRules: [] as string[],
};

/** A single conversation turn in the shape both providers accept. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Outcome of a generation call. */
export interface GenerateResult {
  /** The reply text, with any handoff sentinel stripped. */
  text: string;
  /** True when the model asked to hand off to a human (auto-reply mode). */
  handoff: boolean;
  /** The model may request a voice-note reply when the account and platform
   * explicitly allow it. Transport and point checks remain authoritative. */
  replyMode: 'text' | 'audio';
  /** Customer facts explicitly confirmed in this turn. The server persists
   * these only for the automatic inbox workflow, never in the playground. */
  leadProfilePatch: LeadProfilePatch;
}

export interface LeadProfilePatch {
  full_name?: string;
  rut?: string;
  phone?: string;
  email?: string;
  address?: string;
  commune?: string;
  city?: string;
  region?: string;
  occupation?: string;
  company?: string;
  monthly_income?: string;
  vehicle_interest?: string;
  vehicle_plate?: string;
  vehicle_price?: string;
  down_payment?: string;
  payment_method?: string;
  income_proof?: boolean;
  employment_type?: string;
  employment_tenure?: string;
  has_dicom?: boolean;
  trade_in?: boolean;
  trade_in_vehicle?: string;
  purchase_timeline?: string;
  financing_requested?: boolean;
}

export interface ConversationLeadProfile {
  id: string | null;
  account_id: string;
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
  vehicle_interest: string | null;
  vehicle_plate: string | null;
  vehicle_price: string | null;
  down_payment: string | null;
  payment_method: string | null;
  income_proof: boolean | null;
  employment_type: string | null;
  employment_tenure: string | null;
  has_dicom: boolean | null;
  trade_in: boolean | null;
  trade_in_vehicle: string | null;
  purchase_timeline: string | null;
  financing_requested: boolean | null;
  captured_by_ai: boolean;
  updated_at: string | null;
}

/**
 * Typed error for every AI failure mode. `status` maps cleanly to an
 * HTTP response in the draft route; `code` lets the UI/tests branch
 * (invalid_key vs rate_limited vs timeout, etc.).
 */
export class AiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'AiError';
    this.code = opts.code ?? 'ai_error';
    this.status = opts.status ?? 502;
  }
}
