import { describe, expect, it } from 'vitest';
import type { Conversation, Message } from '@/types';
import {
  isMatchingOptimisticMessage,
  mergeConversationDeltas,
  mergeMessageDeltas,
} from './live-sync';

function conversation(
  id: string,
  lastMessageAt: string,
  unreadCount = 0
): Conversation {
  return {
    id,
    user_id: 'user-1',
    contact_id: `contact-${id}`,
    status: 'open',
    unread_count: unreadCount,
    last_message_at: lastMessageAt,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: lastMessageAt,
  };
}

function message(
  id: string,
  createdAt: string,
  status: Message['status']
): Message {
  return {
    id,
    conversation_id: 'conversation-1',
    sender_type: 'customer',
    content_type: 'text',
    content_text: id,
    status,
    created_at: createdAt,
  };
}

describe('mergeConversationDeltas', () => {
  it('patches an existing conversation and moves fresh activity to the top', () => {
    const first = conversation('first', '2026-09-29T10:00:00.000Z');
    const second = conversation('second', '2026-09-29T09:00:00.000Z');
    second.contact = {
      id: 'contact-second',
      user_id: 'user-1',
      account_id: 'account-1',
      phone: '123',
      name: 'Customer',
      created_at: '',
      updated_at: '',
    };

    const updated = conversation('second', '2026-09-29T10:05:00.000Z', 1);
    const result = mergeConversationDeltas([first, second], [updated]);

    expect(result.map((item) => item.id)).toEqual(['second', 'first']);
    expect(result[0]?.unread_count).toBe(1);
    expect(result[0]?.contact?.name).toBe('Customer');
  });

  it('adds a newly discovered conversation', () => {
    const result = mergeConversationDeltas(
      [conversation('old', '2026-09-29T10:00:00.000Z')],
      [conversation('new', '2026-09-29T10:01:00.000Z', 1)]
    );

    expect(result.map((item) => item.id)).toEqual(['new', 'old']);
  });
});

describe('mergeMessageDeltas', () => {
  it('adds new messages in chronological order without duplicates', () => {
    const first = message('first', '2026-09-29T10:00:00.000Z', 'sent');
    const second = message('second', '2026-09-29T10:01:00.000Z', 'sent');

    const result = mergeMessageDeltas([second], [first, second]);

    expect(result.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('uses the persisted row when a matching message status changes', () => {
    const pending = message('same', '2026-09-29T10:00:00.000Z', 'sent');
    const delivered = { ...pending, status: 'delivered' as const };

    expect(mergeMessageDeltas([pending], [delivered])[0]?.status).toBe(
      'delivered'
    );
  });

  it('replaces a matching optimistic outbound bubble with its persisted row', () => {
    const optimistic: Message = {
      ...message('temp-123', '2026-09-29T10:00:01.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Hola, como estas?',
    };
    const persisted: Message = {
      ...message('persisted-123', '2026-09-29T10:00:02.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Hola, como estas?',
      message_id: '3EB0ABC',
    };

    expect(isMatchingOptimisticMessage(optimistic, persisted)).toBe(true);
    expect(mergeMessageDeltas([optimistic], [persisted])).toEqual([persisted]);
  });

  it('does not reconcile different outbound messages', () => {
    const optimistic: Message = {
      ...message('temp-123', '2026-09-29T10:00:01.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Primer mensaje',
    };
    const persisted: Message = {
      ...message('persisted-123', '2026-09-29T10:00:02.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Segundo mensaje',
    };

    expect(isMatchingOptimisticMessage(optimistic, persisted)).toBe(false);
    expect(mergeMessageDeltas([optimistic], [persisted])).toHaveLength(2);
  });

  it('matches two identical rapid sends to separate optimistic bubbles', () => {
    const firstOptimistic: Message = {
      ...message('temp-first', '2026-09-29T10:00:01.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Igual',
    };
    const secondOptimistic: Message = {
      ...message('temp-second', '2026-09-29T10:00:05.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Igual',
    };
    const firstPersisted: Message = {
      ...message('persisted-first', '2026-09-29T10:00:02.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Igual',
    };
    const secondPersisted: Message = {
      ...message('persisted-second', '2026-09-29T10:00:06.000Z', 'sent'),
      sender_type: 'agent',
      content_text: 'Igual',
    };

    const result = mergeMessageDeltas(
      [firstOptimistic, secondOptimistic],
      [firstPersisted, secondPersisted]
    );

    expect(result.map((item) => item.id)).toEqual([
      'persisted-first',
      'persisted-second',
    ]);
  });
});
