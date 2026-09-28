import { afterEach, describe, expect, it } from 'vitest';

import { metaOAuthRedirectUri, metaSettingsUrl } from './config';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe('Meta public URLs', () => {
  it('uses the configured public site instead of an internal proxy host', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nexoracrm.cl/';
    const request = new Request(
      'http://localhost:3000/api/meta/oauth/callback'
    );

    expect(metaOAuthRedirectUri(request)).toBe(
      'https://nexoracrm.cl/api/meta/oauth/callback'
    );
    expect(metaSettingsUrl(request, 'invalid_state').toString()).toBe(
      'https://nexoracrm.cl/settings?tab=channels&meta=invalid_state'
    );
  });

  it('falls back to the request origin outside a configured deployment', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const request = new Request(
      'https://preview.nexora.test/api/meta/oauth/callback'
    );

    expect(metaSettingsUrl(request, 'connected_facebook').toString()).toBe(
      'https://preview.nexora.test/settings?tab=channels&meta=connected_facebook'
    );
  });
});
