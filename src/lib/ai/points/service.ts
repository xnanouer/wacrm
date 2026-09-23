import 'server-only';

import crypto from 'node:crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { AiError } from '@/lib/ai/types';
import type { AiPointAction, AiPointReservation } from '@/lib/ai/points/types';

interface ReserveAiPointsArgs {
  accountId: string;
  action: AiPointAction;
  idempotencyKey: string;
  actorUserId?: string | null;
  estimatedDurationMs?: number | null;
  aiConfigId?: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  whatsappConfigId?: string | null;
  channelConnectionId?: string | null;
  sourceMessageId?: string | null;
  metadata?: Record<string, unknown>;
}

interface ReservationRow {
  operation_id: string;
  operation_status: 'reserved' | 'completed' | 'released';
  reserved_points: number | string;
}

const POINT_ERROR_MAP: Record<
  string,
  { message: string; code: string; status: number }
> = {
  AI_PLATFORM_DISABLED: {
    message: 'La Inteligencia Artificial de Nexora todavía no está disponible.',
    code: 'ai_platform_disabled',
    status: 503,
  },
  AI_NOT_ENABLED_FOR_ACCOUNT: {
    message: 'La Inteligencia Artificial no está habilitada para esta empresa.',
    code: 'ai_account_disabled',
    status: 403,
  },
  AI_INSUFFICIENT_POINTS: {
    message: 'La empresa no tiene Puntos Nexora suficientes.',
    code: 'ai_insufficient_points',
    status: 402,
  },
  AI_AUDIO_DISABLED: {
    message: 'Las respuestas de audio con IA todavía no están habilitadas.',
    code: 'ai_audio_disabled',
    status: 409,
  },
  AI_ACCOUNT_NOT_OPERATIONAL: {
    message: 'La suscripción de la empresa no permite utilizar IA.',
    code: 'ai_account_inactive',
    status: 402,
  },
};

function pointError(error: { message?: string; details?: string }): AiError {
  const source = `${error.message ?? ''} ${error.details ?? ''}`;
  for (const [databaseCode, mapped] of Object.entries(POINT_ERROR_MAP)) {
    if (source.includes(databaseCode)) {
      return new AiError(mapped.message, {
        code: mapped.code,
        status: mapped.status,
      });
    }
  }

  console.error('[ai points] unexpected database error:', error);
  return new AiError('No se pudo autorizar el consumo de IA.', {
    code: 'ai_points_error',
    status: 500,
  });
}

function asReservationRow(value: unknown): ReservationRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Partial<ReservationRow>;
  if (
    typeof candidate.operation_id !== 'string' ||
    typeof candidate.operation_status !== 'string'
  ) {
    return null;
  }
  return candidate as ReservationRow;
}

/**
 * Reserve points before contacting a provider. A server-generated ownership
 * token is stored in the service-only metadata. If another request already
 * owns the same idempotency key, the token differs and this call is rejected
 * before any provider request can be made.
 */
export async function reserveAiPoints(
  args: ReserveAiPointsArgs
): Promise<AiPointReservation> {
  const admin = supabaseAdmin();
  const reservationOwnerToken = crypto.randomUUID();
  const technicalMetadata = {
    ...(args.metadata ?? {}),
    reservation_owner_token: reservationOwnerToken,
  };

  const { data, error } = await admin.rpc('reserve_ai_points', {
    p_account_id: args.accountId,
    p_action_key: args.action,
    p_idempotency_key: args.idempotencyKey,
    p_actor_user_id: args.actorUserId ?? null,
    p_estimated_duration_ms: args.estimatedDurationMs ?? null,
    p_ai_config_id: args.aiConfigId ?? null,
    p_conversation_id: args.conversationId ?? null,
    p_contact_id: args.contactId ?? null,
    p_whatsapp_config_id: args.whatsappConfigId ?? null,
    p_channel_connection_id: args.channelConnectionId ?? null,
    p_source_message_id: args.sourceMessageId ?? null,
    p_metadata: technicalMetadata,
  });

  if (error) throw pointError(error);
  const row = asReservationRow(data);
  if (!row) {
    throw new AiError('Nexora no pudo crear la reserva de IA.', {
      code: 'ai_points_invalid_response',
      status: 500,
    });
  }

  const { data: operation, error: operationError } = await admin
    .from('ai_point_operations')
    .select('technical_metadata')
    .eq('id', row.operation_id)
    .eq('account_id', args.accountId)
    .maybeSingle();

  if (operationError) throw pointError(operationError);
  const storedMetadata =
    operation?.technical_metadata &&
    typeof operation.technical_metadata === 'object'
      ? (operation.technical_metadata as Record<string, unknown>)
      : null;

  if (
    storedMetadata?.reservation_owner_token !== reservationOwnerToken ||
    row.operation_status !== 'reserved'
  ) {
    throw new AiError('Esta solicitud de IA ya fue procesada.', {
      code: 'ai_duplicate_request',
      status: 409,
    });
  }

  return {
    operationId: row.operation_id,
    points: Number(row.reserved_points),
  };
}

export async function finalizeAiPoints(
  operationId: string,
  options: {
    actualDurationMs?: number | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('finalize_ai_points', {
    p_operation_id: operationId,
    p_actual_duration_ms: options.actualDurationMs ?? null,
    p_provider_request_id: options.providerRequestId ?? null,
    p_technical_metadata: options.metadata ?? {},
  });
  if (error) throw pointError(error);
  return Number(data);
}

export async function releaseAiPoints(
  operationId: string,
  reason: string
): Promise<void> {
  const { error } = await supabaseAdmin().rpc('release_ai_points', {
    p_operation_id: operationId,
    p_reason: reason.slice(0, 500),
  });
  if (error) throw pointError(error);
}

export async function releaseAiPointsQuietly(
  operationId: string,
  reason: string
): Promise<void> {
  try {
    await releaseAiPoints(operationId, reason);
  } catch (error) {
    console.error(
      `[ai points] failed to release operation ${operationId}:`,
      error
    );
  }
}
