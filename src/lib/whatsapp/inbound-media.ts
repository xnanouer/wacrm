import 'server-only';

import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';
import { buildPrivateMediaUrl } from '@/lib/storage/private-media-reference';
import { downloadMedia, getMediaUrl } from './meta-api';

const CHAT_MEDIA_BUCKET = 'chat-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
};

interface MediaStorageClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: {
          cacheControl: string;
          contentType: string;
          upsert: boolean;
        }
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface InboundMediaResult {
  mediaUrl: string | null;
  mediaType: string | null;
  /** Reused by the audio transcription path so the webhook downloads once. */
  buffer: Buffer | null;
  persisted: boolean;
}

function normalizeMime(value: string | null | undefined): string {
  const normalized = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  // Meta occasionally describes an Ogg/Opus voice note as audio/opus,
  // while the private bucket uses the standards-compatible audio/ogg type.
  return normalized === 'audio/opus' ? 'audio/ogg' : normalized;
}

export function selectInboundMediaMime(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeMime(candidate);
    if (MEDIA_EXTENSIONS[normalized]) return normalized;
  }
  return null;
}

export function inboundMediaStoragePath(
  accountId: string,
  mediaId: string,
  mimeType: string
): string {
  const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 160);
  const extension = MEDIA_EXTENSIONS[mimeType];
  if (!safeMediaId || !extension) {
    throw new Error('Unsupported inbound media reference.');
  }
  return `account-${accountId}/whatsapp-inbound/${safeMediaId}.${extension}`;
}

/**
 * Download an inbound WhatsApp attachment while Meta's authenticated URL is
 * valid, validate its bytes, and keep a durable private copy for the inbox.
 * The deterministic media-id path makes webhook retries idempotent.
 */
export async function persistInboundWhatsAppMedia(args: {
  db: MediaStorageClient;
  accountId: string;
  mediaId: string;
  accessToken: string;
  declaredMimeType?: string | null;
}): Promise<InboundMediaResult> {
  const { db, accountId, mediaId, accessToken, declaredMimeType } = args;
  const transientUrl = `/api/whatsapp/media/${encodeURIComponent(mediaId)}`;

  let resolved: { url: string; mimeType: string };
  try {
    resolved = await getMediaUrl({ mediaId, accessToken });
  } catch (error) {
    console.error(
      `[webhook] could not resolve inbound media ${mediaId}:`,
      error instanceof Error ? error.message : error
    );
    return {
      mediaUrl: null,
      mediaType: selectInboundMediaMime(declaredMimeType),
      buffer: null,
      persisted: false,
    };
  }

  let downloaded: Awaited<ReturnType<typeof downloadMedia>>;
  try {
    downloaded = await downloadMedia({
      downloadUrl: resolved.url,
      accessToken,
    });
  } catch (error) {
    console.error(
      `[webhook] could not download inbound media ${mediaId}:`,
      error instanceof Error ? error.message : error
    );
    return {
      mediaUrl: transientUrl,
      mediaType: selectInboundMediaMime(declaredMimeType, resolved.mimeType),
      buffer: null,
      persisted: false,
    };
  }

  const mediaType = selectInboundMediaMime(
    downloaded.contentType,
    resolved.mimeType,
    declaredMimeType
  );
  const bytes = new Uint8Array(downloaded.buffer);
  const maxBytes = mediaType?.startsWith('image/')
    ? MAX_IMAGE_BYTES
    : MAX_MEDIA_BYTES;

  if (
    !mediaType ||
    bytes.length < 1 ||
    bytes.length > maxBytes ||
    !matchesDeclaredFileType(bytes, mediaType)
  ) {
    console.error(
      `[webhook] rejected inbound media ${mediaId}: invalid type, signature, or size`
    );
    return {
      mediaUrl: transientUrl,
      mediaType,
      buffer: null,
      persisted: false,
    };
  }

  const path = inboundMediaStoragePath(accountId, mediaId, mediaType);
  const { error } = await db.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(path, bytes, {
      cacheControl: '31536000',
      contentType: mediaType,
      // Meta can retry a webhook. The media id is stable, so replacing the
      // same validated bytes avoids duplicate objects and remains idempotent.
      upsert: true,
    });

  if (error) {
    console.error(
      `[webhook] could not persist inbound media ${mediaId}:`,
      error.message
    );
    return {
      mediaUrl: transientUrl,
      mediaType,
      buffer: downloaded.buffer,
      persisted: false,
    };
  }

  return {
    mediaUrl: buildPrivateMediaUrl(CHAT_MEDIA_BUCKET, path),
    mediaType,
    buffer: downloaded.buffer,
    persisted: true,
  };
}
