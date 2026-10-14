import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
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
const MAX_IMAGES_PER_ITEM = 50;

interface ReorderBody {
  orderedImageIds?: unknown;
}

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
      `catalog-image:${ctx.userId}:${id}`,
      RATE_LIMITS.catalogImageUpload
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

    const { data: canManage, error: permissionError } = await ctx.supabase.rpc(
      'catalog_can_manage_item',
      { target_item_id: id }
    );
    if (permissionError || canManage !== true) {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar estas fotografías.' },
        { status: 403 }
      );
    }

    const admin = supabaseAdmin();
    const { count: currentImageCount, error: countError } = await admin
      .from('catalog_item_images')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
      .eq('catalog_item_id', id);
    if (countError) throw countError;
    if ((currentImageCount ?? 0) >= MAX_IMAGES_PER_ITEM) {
      return NextResponse.json(
        {
          error: `La galería admite hasta ${MAX_IMAGES_PER_ITEM} fotografías.`,
        },
        { status: 409 }
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

export async function PATCH(
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
      `catalog-image-order:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as ReorderBody | null;
    const orderedImageIds = body?.orderedImageIds;
    if (
      !Array.isArray(orderedImageIds) ||
      orderedImageIds.length < 1 ||
      orderedImageIds.length > MAX_IMAGES_PER_ITEM ||
      !orderedImageIds.every(isUuid) ||
      new Set(orderedImageIds).size !== orderedImageIds.length
    ) {
      return NextResponse.json(
        { error: 'El orden de las fotografías no es válido.' },
        { status: 400 }
      );
    }

    const { data: canManage, error: permissionError } = await ctx.supabase.rpc(
      'catalog_can_manage_item',
      { target_item_id: id }
    );
    if (permissionError || canManage !== true) {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar estas fotografías.' },
        { status: 403 }
      );
    }

    const admin = supabaseAdmin();
    const { data: currentImages, error: imagesError } = await admin
      .from('catalog_item_images')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('catalog_item_id', id);
    if (imagesError) throw imagesError;

    const currentIds = new Set(
      (currentImages ?? []).map((image) => String(image.id))
    );
    if (
      currentIds.size !== orderedImageIds.length ||
      !orderedImageIds.every((imageId) => currentIds.has(imageId))
    ) {
      return NextResponse.json(
        {
          error: 'La galería cambió. Actualiza la ficha e inténtalo otra vez.',
        },
        { status: 409 }
      );
    }

    const temporaryBase = 1_000_000_000 + crypto.randomInt(0, 100_000_000);
    for (const [index, imageId] of orderedImageIds.entries()) {
      const { error } = await admin
        .from('catalog_item_images')
        .update({ is_primary: false, sort_order: temporaryBase + index })
        .eq('account_id', ctx.accountId)
        .eq('catalog_item_id', id)
        .eq('id', imageId);
      if (error) throw error;
    }

    for (const [index, imageId] of orderedImageIds.entries()) {
      const { error } = await admin
        .from('catalog_item_images')
        .update({ is_primary: index === 0, sort_order: index })
        .eq('account_id', ctx.accountId)
        .eq('catalog_item_id', id)
        .eq('id', imageId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[catalog] image reorder failed:', error);
    return toErrorResponse(error);
  }
}
