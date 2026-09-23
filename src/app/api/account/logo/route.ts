import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function storagePathFromPublicUrl(url: string | null, accountId: string) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/company-logos/';
  try {
    const path = decodeURIComponent(
      new URL(url).pathname.split(marker)[1] ?? ''
    );
    return path.startsWith(`${accountId}/`) ? path : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:company-logo:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData().catch(() => null);
    const file = form?.get('logo');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Selecciona una imagen para el logo' },
        { status: 400 }
      );
    }
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: 'Utiliza una imagen PNG, JPG o WebP' },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_LOGO_BYTES) {
      return NextResponse.json(
        { error: 'El logo puede pesar hasta 3 MB' },
        { status: 400 }
      );
    }

    const { data: current } = await ctx.supabase
      .from('accounts')
      .select('logo_url')
      .eq('id', ctx.accountId)
      .single();
    const previousPath = storagePathFromPublicUrl(
      current?.logo_url ?? null,
      ctx.accountId
    );
    const path = `${ctx.accountId}/logo-${Date.now()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesDeclaredFileType(bytes, file.type)) {
      return NextResponse.json(
        { error: 'El contenido del archivo no coincide con una imagen válida' },
        { status: 415 }
      );
    }
    const { error: uploadError } = await ctx.supabase.storage
      .from('company-logos')
      .upload(path, bytes, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) {
      console.error('[company logo] upload error:', uploadError);
      return NextResponse.json(
        { error: 'No pudimos subir el logo. Inténtalo nuevamente.' },
        { status: 500 }
      );
    }

    const { data: publicData } = ctx.supabase.storage
      .from('company-logos')
      .getPublicUrl(path);
    const logoUrl = publicData.publicUrl;
    const { error: updateError } = await ctx.supabase
      .from('accounts')
      .update({ logo_url: logoUrl })
      .eq('id', ctx.accountId);
    if (updateError) {
      await ctx.supabase.storage.from('company-logos').remove([path]);
      console.error('[company logo] account update error:', updateError);
      return NextResponse.json(
        { error: 'No pudimos guardar el logo. Inténtalo nuevamente.' },
        { status: 500 }
      );
    }
    if (previousPath && previousPath !== path) {
      await ctx.supabase.storage.from('company-logos').remove([previousPath]);
    }
    return NextResponse.json({ logoUrl });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    const { data: current } = await ctx.supabase
      .from('accounts')
      .select('logo_url')
      .eq('id', ctx.accountId)
      .single();
    const path = storagePathFromPublicUrl(
      current?.logo_url ?? null,
      ctx.accountId
    );
    const { error } = await ctx.supabase
      .from('accounts')
      .update({ logo_url: null })
      .eq('id', ctx.accountId);
    if (error) throw error;
    if (path) await ctx.supabase.storage.from('company-logos').remove([path]);
    return NextResponse.json({ logoUrl: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
