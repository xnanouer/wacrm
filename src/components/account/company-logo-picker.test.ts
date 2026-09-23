import { describe, expect, it } from 'vitest';
import {
  MAX_COMPANY_LOGO_BYTES,
  validateCompanyLogo,
} from './company-logo-picker';

describe('company logo validation', () => {
  it('accepts supported image formats', () => {
    expect(
      validateCompanyLogo(new File(['x'], 'logo.png', { type: 'image/png' }))
    ).toBeNull();
    expect(
      validateCompanyLogo(new File(['x'], 'logo.webp', { type: 'image/webp' }))
    ).toBeNull();
  });

  it('rejects unsupported and oversized files', () => {
    expect(
      validateCompanyLogo(
        new File(['x'], 'logo.svg', { type: 'image/svg+xml' })
      )
    ).toMatch(/PNG/);
    const oversized = new File(
      [new Uint8Array(MAX_COMPANY_LOGO_BYTES + 1)],
      'logo.jpg',
      { type: 'image/jpeg' }
    );
    expect(validateCompanyLogo(oversized)).toMatch(/3 MB/);
  });
});
