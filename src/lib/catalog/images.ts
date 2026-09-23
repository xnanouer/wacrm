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
): Promise<void> {
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

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? 'No fue posible registrar una fotografía.'
    );
  }
}
