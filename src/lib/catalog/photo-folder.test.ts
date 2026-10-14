import { describe, expect, it } from 'vitest';

import {
  CATALOG_PHOTO_MAX_BYTES,
  prepareCatalogPhotoFolder,
  type CatalogPhotoDescriptor,
} from './photo-folder';

function photo(
  name: string,
  relativePath = name,
  overrides: Partial<CatalogPhotoDescriptor> = {}
): CatalogPhotoDescriptor {
  return {
    name,
    relativePath,
    type: 'image/jpeg',
    size: 1000,
    ...overrides,
  };
}

describe('catalog photo folder preparation', () => {
  it('accepts arbitrary filenames and orders numbered photos naturally', () => {
    const result = prepareCatalogPhotoFolder(
      [
        photo('WhatsApp Image 10.jpg'),
        photo('frontal.jpg'),
        photo('WhatsApp Image 2.jpg'),
      ],
      0
    );

    expect(result.issues).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      'frontal.jpg',
      'WhatsApp Image 2.jpg',
      'WhatsApp Image 10.jpg',
    ]);
  });

  it('accepts nested folders without inspecting their names', () => {
    const result = prepareCatalogPhotoFolder(
      [photo('IMG_1001.jpg', 'Fotos entregadas/Exterior/IMG_1001.jpg')],
      0
    );

    expect(result.files).toHaveLength(1);
    expect(result.issues).toEqual([]);
  });

  it('reports invalid and oversized files without blocking valid photos', () => {
    const result = prepareCatalogPhotoFolder(
      [
        photo('frontal.jpg'),
        photo('animacion.gif', undefined, { type: 'image/gif' }),
        photo('pesada.jpg', undefined, {
          size: CATALOG_PHOTO_MAX_BYTES + 1,
        }),
      ],
      0
    );

    expect(result.files).toHaveLength(1);
    expect(result.issues).toHaveLength(2);
  });

  it('respects the remaining gallery capacity', () => {
    const result = prepareCatalogPhotoFolder(
      [photo('01.jpg'), photo('02.jpg')],
      49
    );

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('01.jpg');
    expect(result.issues[0].message).toContain('máximo de 50');
  });
});
