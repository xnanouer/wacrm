import 'server-only';

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPrivateMediaUrl } from '@/lib/storage/private-media-reference';

import { providerHttpError, toNetworkError } from './providers/shared';
import type { AiConfig } from './types';

const OPENAI_TRANSCRIPTIONS_URL =
  'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MIN_DURATION_MS = 1_000;
const MAX_TRANSCRIPTION_DURATION_MS = 15 * 60 * 1_000;
export const MAX_GENERATED_AUDIO_DURATION_MS = 5 * 60 * 1_000;

interface TranscriptionResponse {
  text?: string;
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('ogg') || normalized.includes('opus')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('amr')) return 'amr';
  return 'bin';
}

/**
 * Reads the final Ogg granule position. Opus always uses a 48 kHz granule
 * clock, so this gives an accurate duration without adding a native media
 * dependency to the WhatsApp worker or the Next.js server.
 */
export function oggOpusDurationMs(buffer: Uint8Array): number | null {
  let offset = 0;
  let lastGranule: number | null = null;

  while (offset + 27 <= buffer.byteLength) {
    if (
      buffer[offset] !== 0x4f ||
      buffer[offset + 1] !== 0x67 ||
      buffer[offset + 2] !== 0x67 ||
      buffer[offset + 3] !== 0x53
    ) {
      offset += 1;
      continue;
    }

    const pageSegments = buffer[offset + 26] ?? 0;
    const headerLength = 27 + pageSegments;
    if (offset + headerLength > buffer.byteLength) break;

    let payloadLength = 0;
    for (let index = 0; index < pageSegments; index += 1) {
      payloadLength += buffer[offset + 27 + index] ?? 0;
    }

    let granule = 0;
    let allOnes = true;
    for (let index = 0; index < 8; index += 1) {
      const byte = buffer[offset + 6 + index] ?? 0;
      granule += byte * 2 ** (8 * index);
      if (byte !== 0xff) allOnes = false;
    }
    if (granule > 0 && !allOnes && Number.isSafeInteger(granule)) {
      lastGranule = granule;
    }

    const pageLength = headerLength + payloadLength;
    if (pageLength <= 0) break;
    offset += pageLength;
  }

  if (!lastGranule) return null;
  const duration = Math.floor((lastGranule * 1000) / 48_000);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * WhatsApp voice notes are normally Ogg/Opus. For another supported audio
 * container, use a conservative 24 kbps estimate so point reservation happens
 * before contacting the provider. Final charging uses the best duration known.
 */
export function estimateAudioDurationMs(
  buffer: Uint8Array,
  suppliedDurationMs?: number | null
): number {
  if (
    suppliedDurationMs &&
    Number.isFinite(suppliedDurationMs) &&
    suppliedDurationMs > 0
  ) {
    return Math.min(
      MAX_TRANSCRIPTION_DURATION_MS,
      Math.max(MIN_DURATION_MS, Math.ceil(suppliedDurationMs))
    );
  }

  const oggDuration = oggOpusDurationMs(buffer);
  if (oggDuration) {
    return Math.min(
      MAX_TRANSCRIPTION_DURATION_MS,
      Math.max(MIN_DURATION_MS, oggDuration)
    );
  }

  const conservativeDuration = Math.ceil(
    (buffer.byteLength * 8 * 1000) / 24_000
  );
  return Math.min(
    MAX_TRANSCRIPTION_DURATION_MS,
    Math.max(MIN_DURATION_MS, conservativeDuration)
  );
}

function validateAudioBuffer(buffer: Uint8Array): void {
  if (buffer.byteLength === 0) throw new Error('AI_AUDIO_EMPTY');
  if (buffer.byteLength > MAX_AUDIO_BYTES)
    throw new Error('AI_AUDIO_TOO_LARGE');
}

export async function transcribeOpenAiAudio(args: {
  config: AiConfig;
  buffer: Uint8Array;
  mimeType: string;
}): Promise<string> {
  const { config, buffer, mimeType } = args;
  if (!config.transcriptionModel) {
    throw new Error('AI_TRANSCRIPTION_MODEL_MISSING');
  }
  validateAudioBuffer(buffer);

  const form = new FormData();
  form.append('model', config.transcriptionModel);
  const fileBytes = new Uint8Array(buffer.byteLength);
  fileBytes.set(buffer);
  form.append(
    'file',
    new Blob([fileBytes.buffer], {
      type: mimeType || 'application/octet-stream',
    }),
    `whatsapp-audio.${extensionForMime(mimeType)}`
  );
  const language = config.language.split('-')[0];
  if (language) form.append('language', language);

  let response: Response;
  try {
    response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw toNetworkError(error);
  }
  if (!response.ok) throw await providerHttpError('OpenAI', response);

  const data = (await response
    .json()
    .catch(() => null)) as TranscriptionResponse | null;
  const text = data?.text?.trim();
  if (!text) throw new Error('AI_TRANSCRIPTION_EMPTY');
  return text;
}

export async function synthesizeOpenAiSpeech(args: {
  config: AiConfig;
  text: string;
}): Promise<{ buffer: Uint8Array; mimeType: 'audio/ogg'; durationMs: number }> {
  const { config, text } = args;
  if (!config.speechModel || !config.speechVoice) {
    throw new Error('AI_SPEECH_CONFIG_MISSING');
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.speechModel,
        voice: config.speechVoice,
        input: text.slice(0, 4_000),
        response_format: 'opus',
        speed: 1,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw toNetworkError(error);
  }
  if (!response.ok) throw await providerHttpError('OpenAI', response);

  const buffer = new Uint8Array(await response.arrayBuffer());
  validateAudioBuffer(buffer);
  const durationMs = Math.min(
    MAX_GENERATED_AUDIO_DURATION_MS,
    estimateAudioDurationMs(buffer)
  );
  return { buffer, mimeType: 'audio/ogg', durationMs };
}

export async function uploadAiVoiceNote(
  db: SupabaseClient,
  accountId: string,
  buffer: Uint8Array
): Promise<string> {
  validateAudioBuffer(buffer);
  const path = `account-${accountId}/${Date.now()}-nexora-ai-${crypto.randomUUID()}.ogg`;
  const { error } = await db.storage.from('chat-media').upload(path, buffer, {
    contentType: 'audio/ogg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return buildPrivateMediaUrl('chat-media', path);
}
