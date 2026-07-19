import { describe, expect, it } from 'vitest';
import {
  CHANNEL_OPTIONS,
  getChannelMeta,
  resolveConversationChannel,
} from './channel-meta';

describe('channel metadata', () => {
  it('exposes the three supported conversation channels', () => {
    expect(CHANNEL_OPTIONS.map((option) => option.value)).toEqual([
      'whatsapp',
      'facebook',
      'instagram',
    ]);
  });

  it('keeps legacy or missing channel values on WhatsApp', () => {
    expect(resolveConversationChannel(undefined)).toBe('whatsapp');
    expect(resolveConversationChannel('legacy')).toBe('whatsapp');
  });

  it('returns a visible label and short label for every channel', () => {
    for (const channel of CHANNEL_OPTIONS) {
      expect(getChannelMeta(channel.value).label).toBeTruthy();
      expect(getChannelMeta(channel.value).shortLabel).toHaveLength(2);
    }
  });
});
