import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { estimateAudioDurationMs, transcribeOpenAiAudio } from './audio';
import { loadAiConfig } from './config';
import {
  finalizeAiPoints,
  releaseAiPointsQuietly,
  reserveAiPoints,
} from './points/service';

export async function transcribeInboundAudio(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  actorUserId: string;
  sourceMessageId: string;
  sourceMessageExternalId: string;
  whatsappConfigId: string | null;
  channelConnectionId?: string | null;
  buffer: Uint8Array;
  mimeType: string;
  durationMs?: number | null;
}): Promise<string | null> {
  const config = await loadAiConfig(args.db, args.accountId);
  if (
    !config ||
    !config.audioEnabled ||
    !config.permissions.understand_audio ||
    config.provider !== 'openai'
  ) {
    return null;
  }

  const estimatedDurationMs = estimateAudioDurationMs(
    args.buffer,
    args.durationMs
  );
  const reservation = await reserveAiPoints({
    accountId: args.accountId,
    action: 'audio_transcription',
    idempotencyKey: `transcription:${args.sourceMessageExternalId}`,
    actorUserId: args.actorUserId,
    estimatedDurationMs,
    aiConfigId: config.id,
    conversationId: args.conversationId,
    contactId: args.contactId,
    whatsappConfigId: args.whatsappConfigId,
    channelConnectionId: args.channelConnectionId ?? null,
    sourceMessageId: args.sourceMessageId,
    metadata: {
      surface: 'inbound_audio',
      mime_type: args.mimeType,
    },
  });

  try {
    const transcript = await transcribeOpenAiAudio({
      config,
      buffer: args.buffer,
      mimeType: args.mimeType,
    });
    await finalizeAiPoints(reservation.operationId, {
      actualDurationMs: estimatedDurationMs,
      metadata: { outcome: 'transcribed' },
    });
    await args.db
      .from('messages')
      .update({ content_text: transcript })
      .eq('id', args.sourceMessageId)
      .eq('conversation_id', args.conversationId);
    return transcript;
  } catch (error) {
    await releaseAiPointsQuietly(
      reservation.operationId,
      'audio_transcription_failed'
    );
    throw error;
  }
}
