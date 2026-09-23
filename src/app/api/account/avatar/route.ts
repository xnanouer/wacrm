import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function storagePathFromPublicUrl(url: string | null, userId: string) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/avatars/';
  try {
    const path = decodeURIComponent(
      new URL(url).pathname.split(marker)[1] ?? ''
    );
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const limit = checkRateLimit(
      `avatar-upload:${ctx.userId}`,
      RATE_LIMITS.mediaUpload
    );
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData().catch(() => null);
    const file = form?.get('avatar');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Selecciona una fotografía.' },
        { status: 400 }
      );
    }
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension || file.size < 1 || file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: 'Usa PNG, JPG, WebP o GIF de hasta 2 MB.' },
        { status: 415 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesDeclaredFileType(bytes, file.type)) {
      return NextResponse.json(
        { error: 'El contenido no corresponde a una imagen válida.' },
        { status: 415 }
      );
    }

    const { data: current } = await ctx.supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const previousPath = storagePathFromPublicUrl(
      current?.avatar_url ?? null,
      ctx.userId
    );
    const path = `${ctx.userId}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await ctx.supabase.storage
      .from('avatars')
      .upload(path, bytes, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      console.error('[avatar] upload failed:', uploadError);
      return NextResponse.json(
        { error: 'No pudimos subir la fotografía.' },
        { status: 500 }
      );
    }

    const { data: publicData } = ctx.supabase.storage
      .from('avatars')
      .getPublicUrl(path);
    const avatarUrl = publicData.publicUrl;
    const { error: updateError } = await ctx.supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', ctx.userId);
    if (updateError) {
      await ctx.supabase.storage.from('avatars').remove([path]);
      throw updateError;
    }
    if (previousPath && previousPath !== path) {
      await ctx.supabase.storage.from('avatars').remove([previousPath]);
    }
    return NextResponse.json({ avatarUrl });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const ctx = await getCurrentAccount();
    const { data: current } = await ctx.supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const path = storagePathFromPublicUrl(
      current?.avatar_url ?? null,
      ctx.userId
    );
    const { error } = await ctx.supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('user_id', ctx.userId);
    if (error) throw error;
    if (path) await ctx.supabase.storage.from('avatars').remove([path]);
    return NextResponse.json({ avatarUrl: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
