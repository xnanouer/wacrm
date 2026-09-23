import { describe, expect, it } from 'vitest';

import {
  buildPrivateMediaUrl,
  isAccountMediaPath,
  parsePrivateMediaReference,
  privateMediaViewUrl,
} from './private-media-reference';

describe('private media references', () => {
  const path = 'account-11111111-1111-4111-8111-111111111111/chat/photo.jpg';

  it('round-trips the authenticated internal URL', () => {
    const url = buildPrivateMediaUrl('chat-media', path);
    expect(parsePrivateMediaReference(url)).toEqual({
      bucket: 'chat-media',
      path,
    });
  });

  it('round-trips a private catalog image reference', () => {
    const catalogPath =
      'account-11111111-1111-4111-8111-111111111111/vehicles/item/photo.webp';
    const url = buildPrivateMediaUrl('catalog-media', catalogPath);
    expect(parsePrivateMediaReference(url)).toEqual({
      bucket: 'catalog-media',
      path: catalogPath,
    });
  });

  it('converts a legacy public Supabase URL without exposing it directly', () => {
    const legacy = `https://example.supabase.co/storage/v1/object/public/chat-media/${path}`;
    expect(privateMediaViewUrl(legacy)).toBe(
      buildPrivateMediaUrl('chat-media', path)
    );
  });

  it('rejects cross-account and traversal paths', () => {
    expect(
      isAccountMediaPath(path, '11111111-1111-4111-8111-111111111111')
    ).toBe(true);
    expect(
      isAccountMediaPath(path, '22222222-2222-4222-8222-222222222222')
    ).toBe(false);
    expect(
      isAccountMediaPath(
        'account-11111111-1111-4111-8111-111111111111/../secret',
        '11111111-1111-4111-8111-111111111111'
      )
    ).toBe(false);
  });
});
