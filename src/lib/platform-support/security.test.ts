import { describe, expect, it } from 'vitest';

import {
  redactSecrets,
  safeInternalPath,
  stripUntrustedLinks,
} from './security';

describe('platform support security', () => {
  it('redacts common secrets from diagnostics', () => {
    expect(redactSecrets('api_key=sk-proj-abcdefghijklmnop')).not.toContain(
      'abcdefghijklmnop'
    );
    expect(redactSecrets('password: super-secret')).toContain(
      '[SECRETO REDACTADO]'
    );
  });

  it('only allows known Nexora routes', () => {
    expect(safeInternalPath('/settings?tab=whatsapp')).toBe('/settings');
    expect(safeInternalPath('https://evil.example')).toBeNull();
    expect(stripUntrustedLinks('[abre](https://evil.example)')).toBe('abre');
  });
});
