import { describe, expect, it } from 'vitest';

import {
  incomingNotificationKey,
  rememberIncomingNotification,
} from './incoming-notification';

describe('incoming message notifications', () => {
  it('deduplicates message INSERT and conversation UPDATE timestamps', () => {
    const messageKey = incomingNotificationKey({
      conversationId: 'conversation-1',
      occurredAt: '2026-10-08T13:23:08.063+00:00',
      fallbackId: 'message-1',
    });
    const conversationKey = incomingNotificationKey({
      conversationId: 'conversation-1',
      occurredAt: '2026-10-08T10:23:08.063-03:00',
    });

    expect(messageKey).toBe(conversationKey);
    const seen = new Set<string>();
    expect(rememberIncomingNotification(seen, messageKey)).toBe(true);
    expect(rememberIncomingNotification(seen, conversationKey)).toBe(false);
  });

  it('uses the message id when no valid timestamp is available', () => {
    expect(
      incomingNotificationKey({
        conversationId: 'conversation-1',
        occurredAt: 'invalid',
        fallbackId: 'message-1',
      })
    ).toBe('conversation-1:id:message-1');
  });
});
