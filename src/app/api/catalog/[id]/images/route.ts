import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';
import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Vehículo inválido.' },
        { status: 400 }
      );
    }

    const limit = checkRateLimit(
      `catalog-image:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    const sortOrder = Number(form?.get('sortOrder') ?? 0);
    const altText =
      typeof form?.get('altText') === 'string'
        ? String(form?.get('altText')).slice(0, 300)
        : '';
    const isPrimary = form?.get('isPrimary') === 'true';
    const mimeType = file instanceof File ? file.type : '';
    const extension = IMAGE_EXTENSIONS[mimeType];

    if (
      !(file instanceof File) ||
      !extension ||
      file.size < 1 ||
      file.size > MAX_IMAGE_BYTES ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      return NextResponse.json(
        { error: 'Los datos de la imagen no son válidos.' },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesDeclaredFileType(bytes, mimeType)) {
      return NextResponse.json(
        { error: 'El contenido no corresponde a una imagen válida.' },
        { status: 415 }
      );
    }

    const imageId = crypto.randomUUID();
    const storagePath =
      `account-${ctx.accountId}/vehicles/${id}/` + `${imageId}.${extension}`;
    const { error: uploadError } = await ctx.supabase.storage
      .from('catalog-media')
      .upload(storagePath, bytes, {
        cacheControl: '3600',
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) {
      console.error('[catalog] image upload failed:', uploadError);
      return NextResponse.json(
        { error: 'No fue posible subir la fotografía.' },
        { status: 500 }
      );
    }

    const { data, error } = await ctx.supabase.rpc(
      'register_catalog_item_image',
      {
        p_catalog_item_id: id,
        p_image_id: imageId,
        p_storage_path: storagePath,
        p_mime_type: mimeType,
        p_byte_size: file.size,
        p_width: null,
        p_height: null,
        p_alt_text: altText,
        p_sort_order: sortOrder,
        p_is_primary: isPrimary,
      }
    );
    if (error) {
      await ctx.supabase.storage.from('catalog-media').remove([storagePath]);
      console.error('[catalog] image registration failed:', error);
      return NextResponse.json(
        { error: 'No fue posible registrar la fotografía.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ image: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
