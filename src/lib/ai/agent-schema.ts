export const AI_TONES = [
  'professional',
  'friendly',
  'direct',
  'formal',
  'commercial',
  'technical',
  'custom',
] as const;

export type AiTone = (typeof AI_TONES)[number];

export const AI_OBJECTIVES = [
  'answer_faqs',
  'capture_customer_data',
  'qualify_leads',
  'create_opportunities',
  'get_visit',
  'handoff',
  'catalog_support',
  'follow_up',
  'custom',
] as const;

export type AiObjective = (typeof AI_OBJECTIVES)[number];
export type AiOperatingMode = 'suggestion' | 'semi_automatic' | 'automatic';
export type AiAfterHoursBehavior =
  | 'suggestions_only'
  | 'automatic'
  | 'log_only'
  | 'handoff'
  | 'send_out_of_hours_message'
  | 'disabled';
export type AiAfterHoursScope = 'all' | 'selected';
export type AiNoPointsBehavior =
  'no_reply' | 'leave_pending' | 'static_message';

export const MAX_AI_REPLIES_PER_CONVERSATION = 50;

export const AI_PERMISSION_KEYS = [
  'generate_suggestions',
  'summarize_conversations',
  'classify_leads',
  'read_contact',
  'read_opportunities',
  'query_catalog',
  'suggest_catalog_items',
  'create_followups',
  'recommend_handoff',
  'understand_audio',
  'generate_audio',
  'query_future_availability',
  'request_future_appointment',
] as const;

export type AiPermissionKey = (typeof AI_PERMISSION_KEYS)[number];
export type AiPermissions = Record<AiPermissionKey, boolean>;

export const DEFAULT_AI_PERMISSIONS: AiPermissions = {
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
};

export interface AiBusinessHour {
  day_of_week: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

export interface AiAgentConnectionSelection {
  whatsapp_config_id: string | null;
  channel_connection_id: string | null;
  is_enabled: boolean;
}

export interface AvailableAiConnection {
  id: string;
  kind: 'whatsapp' | 'facebook' | 'instagram';
  name: string;
  detail: string | null;
  status: string;
}

export interface StructuredAiConfig {
  system_prompt: string | null;
  is_active: boolean;
  auto_reply_enabled: boolean;
  auto_reply_max_per_conversation: number | null;
  catalog_ai_enabled: boolean;
  catalog_ai_auto_send: boolean;
  catalog_ai_max_items: number;
  response_mode: 'text';
  agent_name: string;
  agent_title: string;
  agent_avatar_url: string | null;
  language: 'es-CL' | 'es' | 'en' | 'pt-BR';
  introduction_enabled: boolean;
  introduction_text: string;
  welcome_message: string;
  out_of_hours_message: string;
  tone: AiTone;
  custom_tone: string;
  primary_objective: AiObjective;
  custom_objective: string;
  additional_instructions: string;
  operating_mode: AiOperatingMode;
  timezone: string;
  after_hours_behavior: AiAfterHoursBehavior;
  after_hours_coverage_enabled: boolean;
  after_hours_scope: AiAfterHoursScope;
  after_hours_max_replies_per_conversation: number;
  after_hours_daily_points_limit: number | null;
  after_hours_monthly_points_limit: number | null;
  after_hours_no_points_behavior: AiNoPointsBehavior;
  manual_ai_delegation_enabled: boolean;
  business_description: string;
  business_industry: string;
  business_addresses: string[];
  business_phones: string[];
  business_emails: string[];
  business_service_areas: string[];
  business_channels: string[];
  general_policies: string;
  general_requirements: string;
  authorized_commercial_info: string;
  permissions: AiPermissions;
  lead_fields: string[];
  escalation_rules: string[];
}

export const DEFAULT_BUSINESS_HOURS: AiBusinessHour[] = Array.from(
  { length: 7 },
  (_, day) => ({
    day_of_week: day,
    is_active: day >= 1 && day <= 5,
    starts_at: '09:00',
    ends_at: '18:00',
  })
);

export const DEFAULT_LEAD_FIELDS = [
  'nombre completo',
  'RUT para financiamiento',
  'teléfono',
  'ciudad o comuna',
  'vehículo que busca',
  'pie disponible',
  'acredita ingresos',
  'tipo de contrato',
  'antigüedad laboral',
  'presenta DICOM',
  'vehículo en parte de pago',
  'momento estimado de compra',
] as const;

export const DEFAULT_STRUCTURED_AI_CONFIG: StructuredAiConfig = {
  system_prompt: null,
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  catalog_ai_enabled: false,
  catalog_ai_auto_send: false,
  catalog_ai_max_items: 3,
  response_mode: 'text',
  agent_name: 'Asistente Nexora',
  agent_title: 'Asistente virtual',
  agent_avatar_url: null,
  language: 'es-CL',
  introduction_enabled: true,
  introduction_text: '',
  welcome_message: '',
  out_of_hours_message: '',
  tone: 'professional',
  custom_tone: '',
  primary_objective: 'answer_faqs',
  custom_objective: '',
  additional_instructions: '',
  operating_mode: 'suggestion',
  timezone: 'America/Santiago',
  after_hours_behavior: 'suggestions_only',
  after_hours_coverage_enabled: false,
  after_hours_scope: 'all',
  after_hours_max_replies_per_conversation: 5,
  after_hours_daily_points_limit: null,
  after_hours_monthly_points_limit: null,
  after_hours_no_points_behavior: 'leave_pending',
  manual_ai_delegation_enabled: true,
  business_description: '',
  business_industry: '',
  business_addresses: [],
  business_phones: [],
  business_emails: [],
  business_service_areas: [],
  business_channels: [],
  general_policies: '',
  general_requirements: '',
  authorized_commercial_info: '',
  permissions: { ...DEFAULT_AI_PERMISSIONS },
  lead_fields: [...DEFAULT_LEAD_FIELDS],
  escalation_rules: [],
};
