import { describe, expect, it } from 'vitest';

import type { Conversation } from '@/types';
import {
  getWaitingMinutes,
  isConversationAwaitingReply,
} from './response-waiting';

const NOW = new Date('2026-08-13T15:00:00.000Z').getTime();

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    user_id: 'user-1',
    contact_id: 'contact-1',
    status: 'open',
    unread_count: 0,
    created_at: '2026-08-13T14:00:00.000Z',
    updated_at: '2026-08-13T14:00:00.000Z',
    ...overrides,
  };
}

describe('conversation response waiting', () => {
  it('warns when the customer spoke last more than ten minutes ago', () => {
    const item = conversation({
      last_message_sender_type: 'customer',
      last_message_at: '2026-08-13T14:48:00.000Z',
    });

    expect(isConversationAwaitingReply(item, NOW)).toBe(true);
    expect(getWaitingMinutes(item, NOW)).toBe(12);
  });

  it('does not warn after an agent or the AI replied', () => {
    for (const sender of ['agent', 'bot'] as const) {
      expect(
        isConversationAwaitingReply(
          conversation({
            last_message_sender_type: sender,
            last_message_at: '2026-08-13T14:40:00.000Z',
          }),
          NOW
        )
      ).toBe(false);
    }
  });

  it('does not warn closed conversations', () => {
    expect(
      isConversationAwaitingReply(
        conversation({
          status: 'closed',
          last_message_sender_type: 'customer',
          last_message_at: '2026-08-13T14:30:00.000Z',
        }),
        NOW
      )
    ).toBe(false);
  });

  it('uses unread messages as a temporary legacy fallback', () => {
    expect(
      isConversationAwaitingReply(
        conversation({
          unread_count: 2,
          last_message_at: '2026-08-13T14:30:00.000Z',
        }),
        NOW
      )
    ).toBe(true);
  });
});
