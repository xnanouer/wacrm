import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { decrypt } from '@/lib/whatsapp/encryption';
import { supabaseAdmin } from './admin-client';
import { DEFAULT_AI_PERMISSIONS, type AiPermissions } from './agent-schema';
import type { AiConfig, AiProvider, AiResponseMode } from './types';

interface AiConfigRow {
  id: string;
  system_prompt: string | null;
  is_active: boolean;
  auto_reply_enabled: boolean;
  auto_reply_max_per_conversation: number | null;
  catalog_ai_enabled: boolean;
  catalog_ai_auto_send: boolean;
  catalog_delivery_mode: 'summary_first' | 'photos_immediately';
  catalog_ai_max_items: number;
  response_mode: AiResponseMode;
  agent_name: string;
  agent_title: string;
  language: string;
  introduction_enabled: boolean;
  introduction_text: string;
  welcome_message: string;
  out_of_hours_message: string;
  tone: string;
  custom_tone: string;
  primary_objective: string;
  custom_objective: string;
  additional_instructions: string;
  operating_mode: 'suggestion' | 'semi_automatic' | 'automatic';
  active_schedule: 'always' | 'weekends';
  timezone: string;
  after_hours_behavior: string;
  after_hours_coverage_enabled: boolean;
  after_hours_scope: 'all' | 'selected';
  after_hours_max_replies_per_conversation: number;
  after_hours_daily_points_limit: number | null;
  after_hours_monthly_points_limit: number | null;
  after_hours_no_points_behavior:
    'no_reply' | 'leave_pending' | 'static_message';
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
  permissions: Partial<AiPermissions> | null;
  lead_fields: string[];
  escalation_rules: string[];
}

interface PlatformAiRow {
  text_provider: AiProvider | null;
  text_model: string | null;
  encrypted_api_key: string | null;
  global_enabled: boolean;
  audio_enabled: boolean;
  transcription_model: string | null;
  speech_model: string | null;
  speech_voice: string | null;
}

interface AccountEntitlementRow {
  platform_enabled: boolean;
}

export interface ManagedAiAvailability {
  globalConfigured: boolean;
  globalEnabled: boolean;
  accountEnabled: boolean;
  audioEnabled: boolean;
}

const CONFIG_COLUMNS =
  'id, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, catalog_ai_enabled, catalog_ai_auto_send, catalog_delivery_mode, catalog_ai_max_items, response_mode, agent_name, agent_title, language, introduction_enabled, introduction_text, welcome_message, out_of_hours_message, tone, custom_tone, primary_objective, custom_objective, additional_instructions, operating_mode, active_schedule, timezone, after_hours_behavior, after_hours_coverage_enabled, after_hours_scope, after_hours_max_replies_per_conversation, after_hours_daily_points_limit, after_hours_monthly_points_limit, after_hours_no_points_behavior, manual_ai_delegation_enabled, business_description, business_industry, business_addresses, business_phones, business_emails, business_service_areas, business_channels, general_policies, general_requirements, authorized_commercial_info, permissions, lead_fields, escalation_rules';

function isAiProvider(value: unknown): value is AiProvider {
  return value === 'openai' || value === 'anthropic';
}

export async function getManagedAiAvailability(
  accountId: string
): Promise<ManagedAiAvailability> {
  const admin = supabaseAdmin();
  const [settingsResult, entitlementResult] = await Promise.all([
    admin
      .from('platform_ai_settings')
      .select(
        'text_provider, text_model, encrypted_api_key, global_enabled, audio_enabled'
      )
      .eq('id', 1)
      .maybeSingle(),
    admin
      .from('account_ai_entitlements')
      .select('platform_enabled')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (entitlementResult.error) throw entitlementResult.error;

  const settings = settingsResult.data;
  const globalConfigured = Boolean(
    settings?.text_provider &&
    settings.text_model?.trim() &&
    settings.encrypted_api_key
  );

  return {
    globalConfigured,
    globalEnabled: Boolean(globalConfigured && settings?.global_enabled),
    accountEnabled: Boolean(entitlementResult.data?.platform_enabled),
    audioEnabled: Boolean(
      globalConfigured && settings?.global_enabled && settings.audio_enabled
    ),
  };
}

/**
 * Combine tenant-owned behaviour with Nexora's platform-owned credentials.
 * The tenant's legacy BYOK fields are deliberately ignored.
 */
export async function loadAiConfig(
  db: SupabaseClient,
  accountId: string,
  opts: { requireActive?: boolean } = {}
): Promise<AiConfig | null> {
  const { requireActive = true } = opts;
  const { data, error } = await db
    .from('ai_configs')
    .select(CONFIG_COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as AiConfigRow;
  if (requireActive && !row.is_active) return null;

  const admin = supabaseAdmin();
  const [settingsResult, entitlementResult] = await Promise.all([
    admin
      .from('platform_ai_settings')
      .select(
        'text_provider, text_model, encrypted_api_key, global_enabled, audio_enabled, transcription_model, speech_model, speech_voice'
      )
      .eq('id', 1)
      .maybeSingle(),
    admin
      .from('account_ai_entitlements')
      .select('platform_enabled')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (entitlementResult.error) throw entitlementResult.error;

  const settings = settingsResult.data as PlatformAiRow | null;
  const entitlement = entitlementResult.data as AccountEntitlementRow | null;
  if (
    !settings?.global_enabled ||
    !isAiProvider(settings.text_provider) ||
    !settings.text_model?.trim() ||
    !settings.encrypted_api_key ||
    !entitlement?.platform_enabled
  ) {
    return null;
  }

  return {
    id: row.id,
    provider: settings.text_provider,
    model: settings.text_model.trim(),
    apiKey: decrypt(settings.encrypted_api_key),
    systemPrompt: row.system_prompt,
    isActive: row.is_active,
    autoReplyEnabled: row.auto_reply_enabled,
    autoReplyMaxPerConversation: row.auto_reply_max_per_conversation,
    catalogAiEnabled: row.catalog_ai_enabled ?? false,
    catalogAiAutoSend: row.catalog_ai_auto_send ?? false,
    catalogDeliveryMode: row.catalog_delivery_mode ?? 'summary_first',
    catalogAiMaxItems: Math.min(5, Math.max(1, row.catalog_ai_max_items ?? 3)),
    responseMode: row.response_mode ?? 'text',
    audioEnabled: Boolean(
      settings.text_provider === 'openai' &&
      settings.audio_enabled &&
      settings.transcription_model?.trim() &&
      settings.speech_model?.trim() &&
      settings.speech_voice?.trim()
    ),
    transcriptionModel: settings.transcription_model?.trim() || null,
    speechModel: settings.speech_model?.trim() || null,
    speechVoice: settings.speech_voice?.trim() || null,
    agentName: row.agent_name ?? 'Asistente Nexora',
    agentTitle: row.agent_title ?? 'Asistente virtual',
    language: row.language ?? 'es-CL',
    introductionEnabled: row.introduction_enabled ?? true,
    introductionText: row.introduction_text ?? '',
    welcomeMessage: row.welcome_message ?? '',
    outOfHoursMessage: row.out_of_hours_message ?? '',
    tone: row.tone ?? 'professional',
    customTone: row.custom_tone ?? '',
    primaryObjective: row.primary_objective ?? 'answer_faqs',
    customObjective: row.custom_objective ?? '',
    additionalInstructions: row.additional_instructions ?? '',
    operatingMode: row.operating_mode ?? 'suggestion',
    activeSchedule: row.active_schedule ?? 'always',
    timezone: row.timezone ?? 'America/Santiago',
    afterHoursBehavior: row.after_hours_behavior ?? 'suggestions_only',
    afterHoursCoverageEnabled: row.after_hours_coverage_enabled ?? false,
    afterHoursScope: row.after_hours_scope ?? 'all',
    afterHoursMaxRepliesPerConversation:
      row.after_hours_max_replies_per_conversation ?? 5,
    afterHoursDailyPointsLimit: row.after_hours_daily_points_limit ?? null,
    afterHoursMonthlyPointsLimit: row.after_hours_monthly_points_limit ?? null,
    afterHoursNoPointsBehavior:
      row.after_hours_no_points_behavior ?? 'leave_pending',
    manualAiDelegationEnabled: row.manual_ai_delegation_enabled ?? true,
    businessDescription: row.business_description ?? '',
    businessIndustry: row.business_industry ?? '',
    businessAddresses: row.business_addresses ?? [],
    businessPhones: row.business_phones ?? [],
    businessEmails: row.business_emails ?? [],
    businessServiceAreas: row.business_service_areas ?? [],
    businessChannels: row.business_channels ?? [],
    generalPolicies: row.general_policies ?? '',
    generalRequirements: row.general_requirements ?? '',
    authorizedCommercialInfo: row.authorized_commercial_info ?? '',
    permissions: {
      ...DEFAULT_AI_PERMISSIONS,
      ...(row.permissions ?? {}),
    },
    leadFields: row.lead_fields ?? [],
    escalationRules: row.escalation_rules ?? [],
    // Semantic indexing stays lexical-only until embeddings have an explicit
    // point rule. This prevents hidden provider spend.
    embeddingsApiKey: null,
  };
}

/**
 * Managed mode keeps knowledge indexing lexical-only for now. Existing
 * vectors remain stored, but no tenant or platform key is spent by indexing.
 */
export async function loadEmbeddingsKey(
  _db: SupabaseClient,
  _accountId: string
): Promise<{ key: string | null; corrupt: boolean }> {
  void _db;
  void _accountId;
  return { key: null, corrupt: false };
}
