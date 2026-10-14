export const CATALOG_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CATALOG_PHOTO_MAX_PER_VEHICLE = 50;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface CatalogPhotoDescriptor {
  name: string;
  relativePath?: string;
  type: string;
  size: number;
}

export interface CatalogPhotoFolderIssue {
  fileName: string;
  message: string;
}

export interface CatalogPhotoFolderResult<
  TFile extends CatalogPhotoDescriptor = CatalogPhotoDescriptor,
> {
  files: TFile[];
  issues: CatalogPhotoFolderIssue[];
}

function displayPath(file: CatalogPhotoDescriptor): string {
  return file.relativePath?.trim() || file.name;
}

export function prepareCatalogPhotoFolder<TFile extends CatalogPhotoDescriptor>(
  files: TFile[],
  existingImageCount: number
): CatalogPhotoFolderResult<TFile> {
  const naturalSort = new Intl.Collator('es', {
    numeric: true,
    sensitivity: 'base',
  });
  const validFiles: TFile[] = [];
  const issues: CatalogPhotoFolderIssue[] = [];

  for (const file of files) {
    const path = displayPath(file);
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      issues.push({
        fileName: path,
        message: 'Formato no compatible. Usa JPEG, PNG o WebP.',
      });
      continue;
    }
    if (file.size < 1 || file.size > CATALOG_PHOTO_MAX_BYTES) {
      issues.push({
        fileName: path,
        message: 'La fotografía debe pesar entre 1 byte y 5 MB.',
      });
      continue;
    }
    validFiles.push(file);
  }

  validFiles.sort((left, right) =>
    naturalSort.compare(displayPath(left), displayPath(right))
  );
  const availableSlots = Math.max(
    0,
    CATALOG_PHOTO_MAX_PER_VEHICLE - existingImageCount
  );
  const acceptedFiles = validFiles.slice(0, availableSlots);
  for (const file of validFiles.slice(availableSlots)) {
    issues.push({
      fileName: displayPath(file),
      message: `Se supera el máximo de ${CATALOG_PHOTO_MAX_PER_VEHICLE} fotografías por vehículo.`,
    });
  }

  return { files: acceptedFiles, issues };
}
