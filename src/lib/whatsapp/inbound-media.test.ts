import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./meta-api', () => ({
  getMediaUrl: vi.fn(),
  downloadMedia: vi.fn(),
}));

import { downloadMedia, getMediaUrl } from './meta-api';
import {
  inboundMediaStoragePath,
  persistInboundWhatsAppMedia,
  selectInboundMediaMime,
} from './inbound-media';

const getMediaUrlMock = vi.mocked(getMediaUrl);
const downloadMediaMock = vi.mocked(downloadMedia);

describe('inbound WhatsApp media persistence', () => {
  const upload = vi.fn();
  const from = vi.fn(() => ({ upload }));
  const db = { storage: { from } };

  beforeEach(() => {
    vi.clearAllMocks();
    getMediaUrlMock.mockResolvedValue({
      url: 'https://meta.test/temporary-media',
      mimeType: 'image/jpeg',
    });
    downloadMediaMock.mockResolvedValue({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      contentType: 'image/jpeg',
    });
    upload.mockResolvedValue({ error: null });
  });

  it('stores validated bytes in a deterministic private account path', async () => {
    const result = await persistInboundWhatsAppMedia({
      db,
      accountId: 'account-1',
      mediaId: 'media-123',
      accessToken: 'secret-token',
      declaredMimeType: 'image/jpeg',
    });

    expect(from).toHaveBeenCalledWith('chat-media');
    expect(upload).toHaveBeenCalledWith(
      'account-account-1/whatsapp-inbound/media-123.jpg',
      expect.any(Uint8Array),
      {
        cacheControl: '31536000',
        contentType: 'image/jpeg',
        upsert: true,
      }
    );
    expect(result).toMatchObject({
      mediaType: 'image/jpeg',
      persisted: true,
    });
    expect(result.mediaUrl).toContain('bucket=chat-media');
    expect(result.mediaUrl).toContain(
      'account-account-1%2Fwhatsapp-inbound%2Fmedia-123.jpg'
    );
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('keeps the authenticated Meta proxy as a fallback if storage fails', async () => {
    upload.mockResolvedValueOnce({ error: { message: 'Storage unavailable' } });

    const result = await persistInboundWhatsAppMedia({
      db,
      accountId: 'account-1',
      mediaId: 'media-123',
      accessToken: 'secret-token',
      declaredMimeType: 'image/jpeg',
    });

    expect(result.mediaUrl).toBe('/api/whatsapp/media/media-123');
    expect(result.persisted).toBe(false);
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('does not store or reuse bytes with a mismatched signature', async () => {
    downloadMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from('not-an-image'),
      contentType: 'image/jpeg',
    });

    const result = await persistInboundWhatsAppMedia({
      db,
      accountId: 'account-1',
      mediaId: 'media-123',
      accessToken: 'secret-token',
      declaredMimeType: 'image/jpeg',
    });

    expect(upload).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mediaUrl: '/api/whatsapp/media/media-123',
      buffer: null,
      persisted: false,
    });
  });

  it('normalizes Meta voice-note MIME types and sanitizes storage paths', () => {
    expect(selectInboundMediaMime('audio/opus')).toBe('audio/ogg');
    expect(
      inboundMediaStoragePath('abc', '../unsafe/media:id', 'image/webp')
    ).toBe('account-abc/whatsapp-inbound/unsafemediaid.webp');
  });
});
