import { describe, expect, it, vi } from 'vitest';

import {
  findVisibleProfilePicture,
  profilePictureLookupIds,
} from '../../../services/whatsapp-profile-picture.mjs';

describe('WhatsApp profile picture lookup', () => {
  it('tries the resolved phone id before the opaque LID', () => {
    expect(
      profilePictureLookupIds({
        contactId: 'opaque@lid',
        peerJid: 'opaque@lid',
        phoneJid: '56911112222@c.us',
      })
    ).toEqual(['56911112222@c.us', 'opaque@lid']);
  });

  it('falls back to another WhatsApp identity when the first has no photo', async () => {
    const loadUrl = vi.fn(async (id: string) =>
      id.endsWith('@c.us') ? undefined : 'https://cdn.example/avatar.jpg'
    );

    await expect(
      findVisibleProfilePicture(['56911112222@c.us', 'opaque@lid'], loadUrl)
    ).resolves.toEqual({
      status: 'visible',
      url: 'https://cdn.example/avatar.jpg',
    });
    expect(loadUrl).toHaveBeenCalledTimes(2);
  });

  it('returns hidden when WhatsApp privacy exposes no profile photo', async () => {
    await expect(
      findVisibleProfilePicture(['opaque@lid'], async () => undefined)
    ).resolves.toEqual({ status: 'hidden', url: null });
  });

  it('preserves the stored photo after a transient WhatsApp failure', async () => {
    const failure = new Error('Evaluation failed because Chromium detached');
    const result = await findVisibleProfilePicture(['opaque@lid'], async () => {
      throw failure;
    });

    expect(result).toEqual({ status: 'transient_error', error: failure });
  });
});
