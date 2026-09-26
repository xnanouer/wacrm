const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCatalogImage(
  catalogItemId: string,
  file: File,
  sortOrder: number
): Promise<string> {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Solo se permiten imágenes JPEG, PNG o WebP.');
  }
  if (file.size < 1 || file.size > CATALOG_IMAGE_MAX_BYTES) {
    throw new Error('Cada fotografía debe pesar como máximo 5 MB.');
  }

  const form = new FormData();
  form.set('file', file);
  form.set('sortOrder', String(sortOrder));
  form.set('altText', file.name.replace(/\.[^.]+$/, ''));
  form.set('isPrimary', String(sortOrder === 0));

  const response = await fetch(`/api/catalog/${catalogItemId}/images`, {
    method: 'POST',
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as {
    image?: { id?: string } | Array<{ id?: string }>;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      payload?.error ?? 'No fue posible registrar una fotografía.'
    );
  }

  const image = Array.isArray(payload?.image)
    ? payload.image[0]
    : payload?.image;
  if (!image?.id) {
    throw new Error('La fotografía se guardó sin un identificador válido.');
  }
  return image.id;
}

export async function reorderCatalogImages(
  catalogItemId: string,
  orderedImageIds: string[]
): Promise<void> {
  const response = await fetch(`/api/catalog/${catalogItemId}/images`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedImageIds }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? 'No fue posible guardar el orden de las fotografías.'
    );
  }
}
