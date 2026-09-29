import { describe, expect, it } from 'vitest';

import {
  instagramPermalink,
  instagramShareTitle,
  metaAttachmentFallbackText,
  visibleSocialMessageText,
} from './social-share';

describe('Meta social shares', () => {
  it('uses friendly labels for Instagram webhook attachment types', () => {
    expect(metaAttachmentFallbackText('instagram', 'ig_reel')).toBe(
      'Reel de Instagram'
    );
    expect(visibleSocialMessageText('[ig_reel]')).toBe('Reel de Instagram');
  });

  it('keeps ordinary media fallbacks compatible with the media renderer', () => {
    expect(metaAttachmentFallbackText('instagram', 'image')).toBe('[image]');
    expect(metaAttachmentFallbackText('facebook', 'video')).toBe('[video]');
  });

  it('accepts only secure Instagram permalinks', () => {
    expect(
      instagramPermalink('https://www.instagram.com/reel/DYvq6V9RuW9/')
    ).toBe('https://www.instagram.com/reel/DYvq6V9RuW9/');
    expect(instagramPermalink('http://instagram.com/reel/test/')).toBeNull();
    expect(
      instagramPermalink('https://instagram.com.evil.test/reel/x')
    ).toBeNull();
    expect(instagramPermalink('javascript:alert(1)')).toBeNull();
  });

  it('identifies the shared content from the permalink path', () => {
    expect(
      instagramShareTitle('https://www.instagram.com/reel/example/', null)
    ).toBe('Reel de Instagram');
    expect(
      instagramShareTitle('https://www.instagram.com/p/example/', null)
    ).toBe('Publicación de Instagram');
  });
});
