import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildPrivateMediaUrl } from '@/lib/storage/private-media-reference';
import { isWhatsAppBridgeRequestAuthorized } from '@/lib/whatsapp/bridge-auth';
import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';

export const maxDuration = 60;

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
type MediaKind = 'image' | 'video' | 'document' | 'audio';

const MEDIA_TYPES: Record<
  string,
  { kind: MediaKind; extension: string; storedMime?: string }
> = {
  'image/png': { kind: 'image', extension: 'png' },
  'image/jpeg': { kind: 'image', extension: 'jpg' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/3gpp': { kind: 'video', extension: '3gp' },
  'application/pdf': { kind: 'document', extension: 'pdf' },
  'application/msword': { kind: 'document', extension: 'doc' },
  'application/vnd.ms-excel': { kind: 'document', extension: 'xls' },
  'application/vnd.ms-powerpoint': { kind: 'document', extension: 'ppt' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'document',
    extension: 'docx',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'document',
    extension: 'xlsx',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'document',
    extension: 'pptx',
  },
  'text/plain': { kind: 'document', extension: 'txt' },
  'audio/ogg': { kind: 'audio', extension: 'ogg' },
  'audio/opus': {
    kind: 'audio',
    extension: 'ogg',
    storedMime: 'audio/ogg',
  },
  'audio/mpeg': { kind: 'audio', extension: 'mp3' },
  'audio/aac': { kind: 'audio', extension: 'aac' },
  'audio/mp4': { kind: 'audio', extension: 'm4a' },
  'audio/amr': { kind: 'audio', extension: 'amr' },
};

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return adminClient;
}

function normalizedMime(value: string | null): string {
  return (value || '').split(';')[0]!.trim().toLowerCase();
}

function mediaKind(value: string | null): MediaKind | null {
  return value === 'image' ||
    value === 'video' ||
    value === 'document' ||
    value === 'audio'
    ? value
    : null;
}

export async function POST(request: Request) {
  if (!isWhatsAppBridgeRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accountId = request.headers.get('x-nexora-account-id') || '';
  const connectionId = request.headers.get('x-nexora-connection-id') || '';
  if (!accountId || !connectionId) {
    return NextResponse.json(
      { error: 'Missing account or connection.' },
      { status: 400 }
    );
  }

  const mimeType = normalizedMime(request.headers.get('content-type'));
  const requestedKind = mediaKind(request.headers.get('x-nexora-media-kind'));
  const mediaDefinition = MEDIA_TYPES[mimeType];
  if (
    !requestedKind ||
    !mediaDefinition ||
    mediaDefinition.kind !== requestedKind
  ) {
    return NextResponse.json(
      { error: 'Unsupported WhatsApp media type.' },
      { status: 415 }
    );
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: 'Media is too large.' }, { status: 413 });
  }

  const db = admin();
  const { data: connection, error: connectionError } = await db
    .from('whatsapp_config')
    .select('id')
    .eq('id', connectionId)
    .eq('account_id', accountId)
    .eq('provider', 'whatsapp_web')
    .maybeSingle();
  if (connectionError || !connection) {
    return NextResponse.json(
      { error: 'WhatsApp connection not found.' },
      { status: 404 }
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: bytes.byteLength ? 'Media is too large.' : 'Media is empty.' },
      { status: bytes.byteLength ? 413 : 400 }
    );
  }
  if (!matchesDeclaredFileType(bytes, mimeType)) {
    return NextResponse.json(
      { error: 'Media content does not match its declared type.' },
      { status: 415 }
    );
  }

  const storedMimeType = mediaDefinition.storedMime || mimeType;
  const path = `account-${accountId}/${Date.now()}-inbound-${crypto.randomUUID()}.${mediaDefinition.extension}`;
  const { error: uploadError } = await db.storage
    .from('chat-media')
    .upload(path, bytes, {
      contentType: storedMimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) {
    console.error('[whatsapp-web/media] upload failed:', uploadError);
    return NextResponse.json(
      { error: 'Could not store inbound media.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mediaUrl: buildPrivateMediaUrl('chat-media', path),
    mimeType: storedMimeType,
  });
}
