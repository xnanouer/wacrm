import { NextResponse } from 'next/server';

import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_STRUCTURED_AI_CONFIG,
} from '@/lib/ai/agent-schema';
import {
  AgentConfigValidationError,
  parseBusinessHours,
  parseConnectionSelections,
  parseStructuredAiConfig,
} from '@/lib/ai/agent-validation';
import { getManagedAiAvailability } from '@/lib/ai/config';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const CONFIG_COLUMNS =
  'id, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, catalog_ai_enabled, catalog_ai_auto_send, catalog_delivery_mode, catalog_ai_max_items, response_mode, agent_name, agent_title, agent_avatar_url, language, introduction_enabled, introduction_text, welcome_message, out_of_hours_message, tone, custom_tone, primary_objective, custom_objective, additional_instructions, operating_mode, active_schedule, timezone, after_hours_behavior, after_hours_coverage_enabled, after_hours_scope, after_hours_max_replies_per_conversation, after_hours_daily_points_limit, after_hours_monthly_points_limit, after_hours_no_points_behavior, manual_ai_delegation_enabled, business_description, business_industry, business_addresses, business_phones, business_emails, business_service_areas, business_channels, general_policies, general_requirements, authorized_commercial_info, permissions, lead_fields, escalation_rules';

function bad(message: string, code?: string, status = 400) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const [
      configResult,
      availability,
      whatsappResult,
      socialResult,
      membersResult,
      userAvailabilityResult,
    ] = await Promise.all([
      supabase
        .from('ai_configs')
        .select(CONFIG_COLUMNS)
        .eq('account_id', accountId)
        .maybeSingle(),
      getManagedAiAvailability(accountId),
      supabase
        .from('whatsapp_config')
        .select(
          'id, connection_name, display_name, display_phone, provider, status'
        )
        .eq('account_id', accountId)
        .is('removed_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('channel_connections')
        .select('id, channel, display_name, status')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('user_id, full_name, email, account_role')
        .eq('account_id', accountId)
        .in('account_role', ['owner', 'admin', 'agent'])
        .order('full_name'),
      supabase
        .from('user_ai_availability')
        .select('user_id, manual_status, manual_status_until, status_note')
        .eq('account_id', accountId),
    ]);

    if (
      configResult.error ||
      whatsappResult.error ||
      socialResult.error ||
      membersResult.error ||
      userAvailabilityResult.error
    ) {
      console.error('[ai/config GET] fetch error:', {
        config: configResult.error,
        whatsapp: whatsappResult.error,
        social: socialResult.error,
        members: membersResult.error,
        userAvailability: userAvailabilityResult.error,
      });
      return NextResponse.json(
        { error: 'No se pudo cargar la configuración del agente.' },
        { status: 500 }
      );
    }

    const config = configResult.data;
    const [hoursResult, enabledConnectionsResult, selectedCoverageUsersResult] =
      config
        ? await Promise.all([
            supabase
              .from('ai_agent_business_hours')
              .select('day_of_week, is_active, starts_at, ends_at')
              .eq('account_id', accountId)
              .eq('ai_config_id', config.id)
              .order('day_of_week'),
            supabase
              .from('ai_agent_connections')
              .select('whatsapp_config_id, channel_connection_id, is_enabled')
              .eq('account_id', accountId)
              .eq('ai_config_id', config.id),
            supabase
              .from('ai_after_hours_users')
              .select('user_id')
              .eq('account_id', accountId)
              .eq('ai_config_id', config.id),
          ])
        : [
            { data: DEFAULT_BUSINESS_HOURS, error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];

    if (
      hoursResult.error ||
      enabledConnectionsResult.error ||
      selectedCoverageUsersResult.error
    ) {
      console.error('[ai/config GET] relations error:', {
        hours: hoursResult.error,
        connections: enabledConnectionsResult.error,
        coverageUsers: selectedCoverageUsersResult.error,
      });
      return NextResponse.json(
        { error: 'No se pudo cargar la configuración del agente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      configured: Boolean(config),
      managed: true,
      platform: {
        configured: availability.globalConfigured,
        enabled: availability.globalEnabled,
        account_enabled: availability.accountEnabled,
        audio_enabled: availability.audioEnabled,
      },
      config: config ?? DEFAULT_STRUCTURED_AI_CONFIG,
      business_hours:
        hoursResult.data && hoursResult.data.length
          ? hoursResult.data
          : DEFAULT_BUSINESS_HOURS,
      enabled_connections: enabledConnectionsResult.data ?? [],
      selected_coverage_user_ids: (selectedCoverageUsersResult.data ?? []).map(
        (row) => row.user_id
      ),
      coverage_users: (membersResult.data ?? []).map((member) => {
        const userAvailability = (userAvailabilityResult.data ?? []).find(
          (row) => row.user_id === member.user_id
        );
        return {
          ...member,
          manual_status: userAvailability?.manual_status ?? null,
          manual_status_until: userAvailability?.manual_status_until ?? null,
          status_note: userAvailability?.status_note ?? '',
        };
      }),
      available_connections: [
        ...(whatsappResult.data ?? []).map((connection) => ({
          id: connection.id,
          kind: 'whatsapp' as const,
          name:
            connection.connection_name || connection.display_name || 'WhatsApp',
          detail: connection.display_phone || connection.provider || null,
          status: connection.status,
        })),
        ...(socialResult.data ?? []).map((connection) => ({
          id: connection.id,
          kind: connection.channel as 'facebook' | 'instagram',
          name: connection.display_name,
          detail: null,
          status: connection.status,
        })),
      ],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `ai-config:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const config = parseStructuredAiConfig(body);
    const hours = parseBusinessHours(
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).business_hours
        : null
    );
    const selections = parseConnectionSelections(
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).enabled_connections
        : null
    );
    const rawCoverageUsers =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).selected_coverage_user_ids
        : null;
    const selectedCoverageUserIds = Array.isArray(rawCoverageUsers)
      ? [
          ...new Set(
            rawCoverageUsers.filter(
              (value): value is string => typeof value === 'string'
            )
          ),
        ].slice(0, 200)
      : [];
    const rawCoverageStatuses =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).coverage_user_statuses
        : null;
    const coverageStatuses = Array.isArray(rawCoverageStatuses)
      ? rawCoverageStatuses.flatMap((value) => {
          if (!value || typeof value !== 'object') return [];
          const row = value as Record<string, unknown>;
          if (typeof row.user_id !== 'string') return [];
          const status = row.manual_status;
          if (
            status !== null &&
            ![
              'available',
              'unavailable',
              'lunch',
              'meeting',
              'vacation',
              'offline',
            ].includes(String(status))
          ) {
            return [];
          }
          return [
            { user_id: row.user_id, manual_status: status as string | null },
          ];
        })
      : [];

    if (
      config.is_active ||
      config.permissions.understand_audio ||
      config.permissions.generate_audio
    ) {
      const availability = await getManagedAiAvailability(accountId);
      if (!availability.globalEnabled) {
        return bad(
          'La IA global de Nexora todavía no está configurada o activada.',
          'ai_platform_disabled',
          409
        );
      }
      if (!availability.accountEnabled) {
        return bad(
          'Nexora debe habilitar la IA para esta empresa antes de activarla.',
          'ai_account_disabled',
          403
        );
      }
      if (
        (config.permissions.understand_audio ||
          config.permissions.generate_audio) &&
        !availability.audioEnabled
      ) {
        return bad(
          'Nexora debe habilitar primero las funciones globales de audio.',
          'ai_audio_disabled',
          409
        );
      }
    }

    if (selectedCoverageUserIds.length) {
      const members = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .in('user_id', selectedCoverageUserIds)
        .in('account_role', ['owner', 'admin', 'agent']);
      if (members.error) throw members.error;
      if ((members.data?.length ?? 0) !== selectedCoverageUserIds.length) {
        return bad(
          'Uno de los ejecutivos seleccionados no pertenece a esta empresa.',
          'invalid_coverage_user',
          403
        );
      }
    }

    // Validate every browser-supplied connection against the authenticated
    // account before persisting any relation.
    const whatsappIds = selections
      .map((selection) => selection.whatsapp_config_id)
      .filter((id): id is string => Boolean(id));
    const socialIds = selections
      .map((selection) => selection.channel_connection_id)
      .filter((id): id is string => Boolean(id));
    const [whatsappResult, socialResult] = await Promise.all([
      whatsappIds.length
        ? supabase
            .from('whatsapp_config')
            .select('id')
            .eq('account_id', accountId)
            .is('removed_at', null)
            .in('id', whatsappIds)
        : Promise.resolve({ data: [], error: null }),
      socialIds.length
        ? supabase
            .from('channel_connections')
            .select('id')
            .eq('account_id', accountId)
            .in('id', socialIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (whatsappResult.error || socialResult.error) {
      throw whatsappResult.error ?? socialResult.error;
    }
    if (
      (whatsappResult.data?.length ?? 0) !== new Set(whatsappIds).size ||
      (socialResult.data?.length ?? 0) !== new Set(socialIds).size
    ) {
      return bad(
        'Una de las conexiones seleccionadas no pertenece a esta empresa.',
        'invalid_ai_connection',
        403
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from('ai_configs')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle();
    if (existingError) throw existingError;

    const values = {
      ...config,
      updated_by_user_id: userId,
    };
    const writeResult = existing
      ? await supabase
          .from('ai_configs')
          .update(values)
          .eq('account_id', accountId)
          .select('id')
          .single()
      : await supabase
          .from('ai_configs')
          .insert({
            account_id: accountId,
            created_by: userId,
            provider: 'openai',
            model: 'managed-by-nexora',
            api_key: null,
            ...values,
          })
          .select('id')
          .single();
    if (writeResult.error || !writeResult.data) {
      console.error('[ai/config POST] save error:', writeResult.error);
      return NextResponse.json(
        { error: 'No se pudo guardar la configuración del agente.' },
        { status: 500 }
      );
    }
    const aiConfigId = writeResult.data.id;

    const hoursWrite = await supabase.from('ai_agent_business_hours').upsert(
      hours.map((hour) => ({
        account_id: accountId,
        ai_config_id: aiConfigId,
        ...hour,
      })),
      { onConflict: 'ai_config_id,day_of_week' }
    );
    if (hoursWrite.error) throw hoursWrite.error;

    const deleteConnections = await supabase
      .from('ai_agent_connections')
      .delete()
      .eq('account_id', accountId)
      .eq('ai_config_id', aiConfigId);
    if (deleteConnections.error) throw deleteConnections.error;
    if (selections.length) {
      const insertConnections = await supabase
        .from('ai_agent_connections')
        .insert(
          selections.map((selection) => ({
            account_id: accountId,
            ai_config_id: aiConfigId,
            ...selection,
          }))
        );
      if (insertConnections.error) throw insertConnections.error;
    }

    const deleteCoverageUsers = await supabase
      .from('ai_after_hours_users')
      .delete()
      .eq('account_id', accountId)
      .eq('ai_config_id', aiConfigId);
    if (deleteCoverageUsers.error) throw deleteCoverageUsers.error;
    if (
      config.after_hours_scope === 'selected' &&
      selectedCoverageUserIds.length
    ) {
      const insertCoverageUsers = await supabase
        .from('ai_after_hours_users')
        .insert(
          selectedCoverageUserIds.map((selectedUserId) => ({
            account_id: accountId,
            ai_config_id: aiConfigId,
            user_id: selectedUserId,
          }))
        );
      if (insertCoverageUsers.error) throw insertCoverageUsers.error;
    }

    if (coverageStatuses.length) {
      const availabilityMembers = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .in(
          'user_id',
          coverageStatuses.map((row) => row.user_id)
        );
      if (availabilityMembers.error) throw availabilityMembers.error;
      const allowedIds = new Set(
        availabilityMembers.data?.map((row) => row.user_id) ?? []
      );
      if (
        allowedIds.size !==
        new Set(coverageStatuses.map((row) => row.user_id)).size
      ) {
        return bad(
          'La disponibilidad contiene un usuario inválido.',
          'invalid_availability_user',
          403
        );
      }
      const availabilityWrite = await supabase
        .from('user_ai_availability')
        .upsert(
          coverageStatuses.map((row) => ({
            account_id: accountId,
            user_id: row.user_id,
            timezone: config.timezone,
            manual_status: row.manual_status,
            manual_status_until: null,
            updated_by_user_id: userId,
          })),
          { onConflict: 'account_id,user_id' }
        );
      if (availabilityWrite.error) throw availabilityWrite.error;
    }

    return NextResponse.json({
      success: true,
      configured: true,
      ai_config_id: aiConfigId,
    });
  } catch (error) {
    if (error instanceof AgentConfigValidationError) {
      return bad(error.message);
    }
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { error } = await supabase
      .from('ai_configs')
      .delete()
      .eq('account_id', accountId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
