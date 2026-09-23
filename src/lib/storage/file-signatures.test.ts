import { describe, expect, it } from 'vitest';

import { matchesDeclaredFileType } from './file-signatures';

describe('matchesDeclaredFileType', () => {
  it('accepts matching image signatures', () => {
    expect(
      matchesDeclaredFileType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png'
      )
    ).toBe(true);
    expect(
      matchesDeclaredFileType(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg'
      )
    ).toBe(true);
  });

  it('rejects a renamed executable or mismatched image', () => {
    const executable = new TextEncoder().encode('MZ fake executable');
    expect(matchesDeclaredFileType(executable, 'image/png')).toBe(false);
    expect(matchesDeclaredFileType(executable, 'application/pdf')).toBe(false);
  });

  it('accepts PDF, OpenXML and plain UTF-8 text signatures', () => {
    expect(
      matchesDeclaredFileType(
        new TextEncoder().encode('%PDF-1.7'),
        'application/pdf'
      )
    ).toBe(true);
    expect(
      matchesDeclaredFileType(
        Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true);
    expect(
      matchesDeclaredFileType(
        new TextEncoder().encode('Documento de prueba'),
        'text/plain'
      )
    ).toBe(true);
  });
});
