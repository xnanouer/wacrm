import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  buildPrivateMediaUrl,
  isAccountMediaPath,
  isPrivateMediaBucket,
} from '@/lib/storage/private-media-reference';
import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
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

function safeBaseName(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file'
  );
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await getCurrentAccount();
    const limit = checkRateLimit(
      `media-upload:${userId}`,
      RATE_LIMITS.mediaUpload
    );
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    const bucket = form?.get('bucket');
    if (!(file instanceof File) || typeof bucket !== 'string') {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
    }
    if (!isPrivateMediaBucket(bucket)) {
      return NextResponse.json(
        { error: 'Invalid media bucket.' },
        { status: 400 }
      );
    }

    const mimeType = file.type.split(';')[0]!.trim().toLowerCase();
    const extension = MEDIA_EXTENSIONS[mimeType];
    const maxBytes = mimeType.startsWith('image/')
      ? MAX_IMAGE_BYTES
      : MAX_MEDIA_BYTES;
    if (!extension || file.size < 1 || file.size > maxBytes) {
      return NextResponse.json(
        { error: 'Unsupported file type or size.' },
        { status: 415 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesDeclaredFileType(bytes, mimeType)) {
      return NextResponse.json(
        { error: 'The file content does not match its declared type.' },
        { status: 415 }
      );
    }

    const path = `account-${accountId}/${Date.now()}-${crypto.randomUUID()}-${safeBaseName(file.name)}.${extension}`;
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      cacheControl: '3600',
      upsert: false,
      contentType: mimeType,
    });
    if (error) {
      console.error('[private media] upload failed:', error);
      return NextResponse.json(
        { error: 'Could not store the file.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      path,
      mediaUrl: buildPrivateMediaUrl(bucket, path),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const url = new URL(request.url);
    const bucket = url.searchParams.get('bucket') ?? '';
    const path = url.searchParams.get('path') ?? '';

    if (!isPrivateMediaBucket(bucket) || !isAccountMediaPath(path, accountId)) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
    }

    const response = NextResponse.redirect(data.signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const body = (await request.json().catch(() => null)) as {
      bucket?: string;
      path?: string;
    } | null;
    const bucket = body?.bucket ?? '';
    const path = body?.path ?? '';
    if (!isPrivateMediaBucket(bucket) || !isAccountMediaPath(path, accountId)) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
    }
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
