import { describe, expect, it } from 'vitest';
import { classifyChatAttachment } from './chat-attachment';

describe('classifyChatAttachment', () => {
  it.each([
    ['foto.jpg', 'image/jpeg', 'image'],
    ['video.mp4', 'video/mp4', 'video'],
    ['contrato.pdf', 'application/pdf', 'document'],
    ['nota.ogg', 'audio/ogg', 'audio'],
  ] as const)('classifies %s as %s', (name, type, expected) => {
    expect(classifyChatAttachment({ name, type })).toBe(expected);
  });

  it('falls back to the extension when a drag event omits the MIME type', () => {
    expect(classifyChatAttachment({ name: 'propuesta.docx', type: '' })).toBe(
      'document'
    );
  });

  it('rejects file types outside the storage and WhatsApp allow-list', () => {
    expect(
      classifyChatAttachment({
        name: 'programa.exe',
        type: 'application/octet-stream',
      })
    ).toBeNull();
  });
});
