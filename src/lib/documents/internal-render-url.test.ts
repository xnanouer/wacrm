import { afterEach, describe, expect, it } from 'vitest';

import { internalRenderUrl } from './internal-render-url';

const previousBaseUrl = process.env.DOCUMENT_RENDER_BASE_URL;
const previousPort = process.env.PORT;

afterEach(() => {
  if (previousBaseUrl === undefined)
    delete process.env.DOCUMENT_RENDER_BASE_URL;
  else process.env.DOCUMENT_RENDER_BASE_URL = previousBaseUrl;
  if (previousPort === undefined) delete process.env.PORT;
  else process.env.PORT = previousPort;
});

describe('internalRenderUrl', () => {
  it('uses the local HTTP listener instead of the public request scheme', () => {
    delete process.env.DOCUMENT_RENDER_BASE_URL;
    process.env.PORT = '3100';

    expect(internalRenderUrl('/quote-render/quote-id').toString()).toBe(
      'http://127.0.0.1:3100/quote-render/quote-id'
    );
  });

  it('supports an explicit internal render base URL', () => {
    process.env.DOCUMENT_RENDER_BASE_URL = 'http://web:3000/';

    expect(internalRenderUrl('/contract-render/contract-id').toString()).toBe(
      'http://web:3000/contract-render/contract-id'
    );
  });

  it('rejects unsupported protocols', () => {
    process.env.DOCUMENT_RENDER_BASE_URL = 'file:///tmp';

    expect(() => internalRenderUrl('/quote-render/id')).toThrow(
      'document_render_base_url_invalid'
    );
  });
});
