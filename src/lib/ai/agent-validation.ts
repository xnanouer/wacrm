import 'server-only';

import {
  AI_OBJECTIVES,
  AI_PERMISSION_KEYS,
  AI_TONES,
  DEFAULT_AI_PERMISSIONS,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_STRUCTURED_AI_CONFIG,
  MAX_AI_REPLIES_PER_CONVERSATION,
  type AiAfterHoursBehavior,
  type AiAgentConnectionSelection,
  type AiBusinessHour,
  type AiOperatingMode,
  type AiPermissions,
  type StructuredAiConfig,
} from './agent-schema';

export class AgentConfigValidationError extends Error {}

function text(
  value: unknown,
  field: string,
  max: number,
  fallback = ''
): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    throw new AgentConfigValidationError(`${field} no es válido.`);
  }
  const result = value.trim();
  if (result.length > max) {
    throw new AgentConfigValidationError(
      `${field} no puede superar ${max.toLocaleString('es-CL')} caracteres.`
    );
  }
  return result;
}

function textArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength = 300
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AgentConfigValidationError(`${field} no es válido.`);
  }
  const result = value
    .map((item) => text(item, field, maxLength))
    .filter(Boolean);
  return [...new Set(result)];
}

function permissions(value: unknown): AiPermissions {
  const result = { ...DEFAULT_AI_PERMISSIONS };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return result;
  for (const key of AI_PERMISSION_KEYS) {
    result[key] = (value as Record<string, unknown>)[key] === true;
  }
  return result;
}

export function parseStructuredAiConfig(body: unknown): StructuredAiConfig {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentConfigValidationError('Solicitud inválida.');
  }
  const input = body as Record<string, unknown>;
  const tone = AI_TONES.includes(input.tone as (typeof AI_TONES)[number])
    ? (input.tone as StructuredAiConfig['tone'])
    : DEFAULT_STRUCTURED_AI_CONFIG.tone;
  const objective = AI_OBJECTIVES.includes(
    input.primary_objective as (typeof AI_OBJECTIVES)[number]
  )
    ? (input.primary_objective as StructuredAiConfig['primary_objective'])
    : DEFAULT_STRUCTURED_AI_CONFIG.primary_objective;
  const language = ['es-CL', 'es', 'en', 'pt-BR'].includes(
    String(input.language)
  )
    ? (input.language as StructuredAiConfig['language'])
    : 'es-CL';
  const requestedMode = String(input.operating_mode);
  const operatingMode: AiOperatingMode =
    requestedMode === 'automatic' ? 'automatic' : 'suggestion';
  const activeSchedule =
    input.active_schedule === 'weekends' ? 'weekends' : 'always';
  const timezone =
    text(input.timezone, 'Zona horaria', 80) || 'America/Santiago';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new AgentConfigValidationError('La zona horaria no es válida.');
  }
  const afterHours = String(input.after_hours_behavior);
  const afterHoursBehavior: AiAfterHoursBehavior = [
    'suggestions_only',
    'automatic',
    'log_only',
    'handoff',
    'send_out_of_hours_message',
    'disabled',
  ].includes(afterHours)
    ? (afterHours as AiAfterHoursBehavior)
    : 'suggestions_only';
  const afterHoursScope =
    input.after_hours_scope === 'selected' ? 'selected' : 'all';
  const noPointsBehavior = [
    'no_reply',
    'leave_pending',
    'static_message',
  ].includes(String(input.after_hours_no_points_behavior))
    ? (input.after_hours_no_points_behavior as StructuredAiConfig['after_hours_no_points_behavior'])
    : 'leave_pending';
  const optionalPositiveInteger = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const isActive = input.is_active === true;
  const maxReplies =
    input.auto_reply_max_per_conversation === null
      ? null
      : Math.min(
          MAX_AI_REPLIES_PER_CONVERSATION,
          Math.max(
            1,
            Math.floor(Number(input.auto_reply_max_per_conversation) || 3)
          )
        );
  const maxCatalog = Math.min(
    5,
    Math.max(1, Math.floor(Number(input.catalog_ai_max_items) || 3))
  );
  const catalogDeliveryMode =
    input.catalog_delivery_mode === 'photos_immediately'
      ? 'photos_immediately'
      : 'summary_first';
  const parsedPermissions = permissions(input.permissions);
  const catalogEnabled =
    isActive &&
    parsedPermissions.query_catalog &&
    parsedPermissions.suggest_catalog_items &&
    input.catalog_ai_enabled === true;

  return {
    system_prompt:
      text(input.system_prompt, 'Instrucciones heredadas', 20_000) || null,
    is_active: isActive,
    auto_reply_enabled:
      isActive &&
      operatingMode === 'automatic' &&
      input.auto_reply_enabled === true,
    auto_reply_max_per_conversation: maxReplies,
    catalog_ai_enabled: catalogEnabled,
    catalog_ai_auto_send:
      catalogEnabled &&
      operatingMode === 'automatic' &&
      input.catalog_ai_auto_send === true,
    catalog_delivery_mode: catalogDeliveryMode,
    catalog_ai_max_items: maxCatalog,
    response_mode: 'text',
    agent_name:
      text(input.agent_name, 'Nombre del agente', 80) || 'Asistente Nexora',
    agent_title:
      text(input.agent_title, 'Cargo del agente', 120) || 'Asistente virtual',
    agent_avatar_url:
      text(input.agent_avatar_url, 'Avatar del agente', 1000) || null,
    language,
    introduction_enabled: input.introduction_enabled !== false,
    introduction_text: text(input.introduction_text, 'Presentación', 1000),
    welcome_message: text(input.welcome_message, 'Mensaje de bienvenida', 1000),
    out_of_hours_message: text(
      input.out_of_hours_message,
      'Mensaje fuera de horario',
      1000
    ),
    tone,
    custom_tone: text(input.custom_tone, 'Tono personalizado', 2000),
    primary_objective: objective,
    custom_objective: text(
      input.custom_objective,
      'Objetivo personalizado',
      3000
    ),
    additional_instructions: text(
      input.additional_instructions,
      'Instrucciones adicionales',
      20_000
    ),
    operating_mode: operatingMode,
    active_schedule: activeSchedule,
    timezone,
    after_hours_behavior: afterHoursBehavior,
    after_hours_coverage_enabled:
      isActive && input.after_hours_coverage_enabled === true,
    after_hours_scope: afterHoursScope,
    after_hours_max_replies_per_conversation: Math.min(
      50,
      Math.max(
        1,
        Math.floor(Number(input.after_hours_max_replies_per_conversation) || 5)
      )
    ),
    after_hours_daily_points_limit: optionalPositiveInteger(
      input.after_hours_daily_points_limit
    ),
    after_hours_monthly_points_limit: optionalPositiveInteger(
      input.after_hours_monthly_points_limit
    ),
    after_hours_no_points_behavior: noPointsBehavior,
    manual_ai_delegation_enabled: input.manual_ai_delegation_enabled !== false,
    business_description: text(
      input.business_description,
      'Descripción del negocio',
      5000
    ),
    business_industry: text(input.business_industry, 'Rubro', 160),
    business_addresses: textArray(input.business_addresses, 'Direcciones', 20),
    business_phones: textArray(input.business_phones, 'Teléfonos', 20, 80),
    business_emails: textArray(input.business_emails, 'Correos', 20, 254),
    business_service_areas: textArray(
      input.business_service_areas,
      'Zonas de atención',
      50
    ),
    business_channels: textArray(
      input.business_channels,
      'Medios de atención',
      20
    ),
    general_policies: text(
      input.general_policies,
      'Políticas generales',
      10_000
    ),
    general_requirements: text(
      input.general_requirements,
      'Requisitos generales',
      5000
    ),
    authorized_commercial_info: text(
      input.authorized_commercial_info,
      'Información comercial autorizada',
      10_000
    ),
    permissions: parsedPermissions,
    lead_fields: textArray(input.lead_fields, 'Datos para leads', 30, 80),
    escalation_rules: textArray(
      input.escalation_rules,
      'Reglas de derivación',
      30,
      300
    ),
  };
}

export function parseBusinessHours(value: unknown): AiBusinessHour[] {
  const raw = Array.isArray(value) ? value : DEFAULT_BUSINESS_HOURS;
  const byDay = new Map<number, AiBusinessHour>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const day = Number(row.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const startsAt = /^\d{2}:\d{2}$/.test(String(row.starts_at))
      ? String(row.starts_at)
      : '09:00';
    const endsAt = /^\d{2}:\d{2}$/.test(String(row.ends_at))
      ? String(row.ends_at)
      : '18:00';
    if (startsAt >= endsAt) {
      throw new AgentConfigValidationError(
        'La hora de inicio debe ser anterior a la hora de término.'
      );
    }
    byDay.set(day, {
      day_of_week: day,
      is_active: row.is_active === true,
      starts_at: startsAt,
      ends_at: endsAt,
    });
  }
  return DEFAULT_BUSINESS_HOURS.map(
    (fallback) => byDay.get(fallback.day_of_week) ?? fallback
  );
}

export function parseConnectionSelections(
  value: unknown
): AiAgentConnectionSelection[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const whatsapp =
      typeof row.whatsapp_config_id === 'string'
        ? row.whatsapp_config_id
        : null;
    const social =
      typeof row.channel_connection_id === 'string'
        ? row.channel_connection_id
        : null;
    if (Boolean(whatsapp) === Boolean(social)) return [];
    return [
      {
        whatsapp_config_id: whatsapp,
        channel_connection_id: social,
        is_enabled: row.is_enabled !== false,
      },
    ];
  });
}
