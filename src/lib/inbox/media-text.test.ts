import { describe, expect, it } from 'vitest';

import { isLikelyEncodedMediaPayload, visibleMediaText } from './media-text';

describe('inbox media text', () => {
  it('rejects JPEG bytes accidentally exposed as an image caption', () => {
    const payload = `/9j/4AAQSkZJRgABAQAAAQABAAD${'A'.repeat(300)}`;

    expect(isLikelyEncodedMediaPayload(payload)).toBe(true);
    expect(visibleMediaText(payload, 'image')).toBeNull();
  });

  it('rejects data URLs and long unknown encoded payloads', () => {
    expect(
      visibleMediaText('data:image/png;base64,iVBORw0KGgoAAAA', 'image')
    ).toBeNull();
    expect(visibleMediaText('A'.repeat(2_048), 'video')).toBeNull();
  });

  it('keeps real captions, document names and ordinary text', () => {
    expect(visibleMediaText('Foto del vehículo', 'image')).toBe(
      'Foto del vehículo'
    );
    expect(visibleMediaText('contrato-final.docx', 'document')).toBe(
      'contrato-final.docx'
    );
    expect(visibleMediaText('/9j/not-really-an-image', 'text')).toBe(
      '/9j/not-really-an-image'
    );
  });
});
