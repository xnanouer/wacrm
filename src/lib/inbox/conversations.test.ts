import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversation,
  requiresWhatsAppCustomerCareWindow,
  sortConversationsByLastMessage,
} from './conversations';
import type { Conversation } from '@/types';

function makeConversation(
  contact: Partial<Conversation['contact']> | null
): Conversation {
  return {
    id: 'c1',
    user_id: 'u1',
    contact_id: 'ct1',
    status: 'open',
    unread_count: 0,
    created_at: '',
    updated_at: '',
    contact: contact
      ? {
          id: 'ct1',
          user_id: 'u1',
          account_id: 'a1',
          phone: '123',
          created_at: '',
          updated_at: '',
          ...contact,
        }
      : undefined,
  };
}

const tag = (id: string, name = id) => ({
  id,
  user_id: 'u1',
  name,
  color: '#fff',
  created_at: '',
});

describe('CONVERSATION_SELECT', () => {
  it('disambiguates the contact, department, and WhatsApp relations', () => {
    expect(CONVERSATION_SELECT).toContain(
      'contacts!conversations_contact_id_fkey'
    );
    expect(CONVERSATION_SELECT).toContain(
      'departments!conversations_department_account_fkey'
    );
    expect(CONVERSATION_SELECT).toContain(
      'whatsapp_config!conversations_whatsapp_account_fkey'
    );
    expect(CONVERSATION_SELECT).toContain(
      'whatsapp_account_fkey(id, provider, connection_name'
    );
  });
});

describe('requiresWhatsAppCustomerCareWindow', () => {
  it('enforces the 24-hour window for Meta Cloud API connections', () => {
    const conversation = makeConversation(null);
    conversation.channel = 'whatsapp';
    conversation.whatsapp_config = {
      id: 'wa-meta',
      provider: 'cloud_api',
      connection_name: 'Meta',
    };

    expect(requiresWhatsAppCustomerCareWindow(conversation)).toBe(true);
  });

  it('does not enforce the Meta window for linked-device QR connections', () => {
    const conversation = makeConversation(null);
    conversation.channel = 'whatsapp';
    conversation.whatsapp_config = {
      id: 'wa-qr',
      provider: 'whatsapp_web',
      connection_name: 'WhatsApp QR',
    };

    expect(requiresWhatsAppCustomerCareWindow(conversation)).toBe(false);
  });

  it('keeps the safe Meta behavior for legacy WhatsApp payloads', () => {
    expect(requiresWhatsAppCustomerCareWindow(makeConversation(null))).toBe(
      true
    );
  });

  it('does not apply the WhatsApp window to social channels', () => {
    const conversation = makeConversation(null);
    conversation.channel = 'instagram';

    expect(requiresWhatsAppCustomerCareWindow(conversation)).toBe(false);
  });
});

describe('matchesContactFilters', () => {
  it('matches everything when no filters are set', () => {
    const conv = makeConversation({ company: 'Acme', tags: [tag('t1')] });
    expect(matchesContactFilters(conv, { tagIds: [], company: null })).toBe(
      true
    );
    expect(makeConversation(null)).toBeDefined();
    expect(
      matchesContactFilters(makeConversation(null), {
        tagIds: [],
        company: null,
      })
    ).toBe(true);
  });

  it('uses OR logic across tags', () => {
    const conv = makeConversation({ tags: [tag('t1'), tag('t2')] });
    expect(
      matchesContactFilters(conv, { tagIds: ['t2', 't9'], company: null })
    ).toBe(true);
    expect(matchesContactFilters(conv, { tagIds: ['t9'], company: null })).toBe(
      false
    );
  });

  it('excludes conversations whose contact has no tags when a tag filter is active', () => {
    const conv = makeConversation({ tags: [] });
    expect(matchesContactFilters(conv, { tagIds: ['t1'], company: null })).toBe(
      false
    );
    expect(
      matchesContactFilters(makeConversation(null), {
        tagIds: ['t1'],
        company: null,
      })
    ).toBe(false);
  });

  it('matches company exactly, trimming whitespace', () => {
    const conv = makeConversation({ company: '  Acme  ' });
    expect(matchesContactFilters(conv, { tagIds: [], company: 'Acme' })).toBe(
      true
    );
    expect(matchesContactFilters(conv, { tagIds: [], company: 'Other' })).toBe(
      false
    );
  });

  it('requires both tag and company to match when both are set (AND across facets)', () => {
    const conv = makeConversation({ company: 'Acme', tags: [tag('t1')] });
    expect(
      matchesContactFilters(conv, { tagIds: ['t1'], company: 'Acme' })
    ).toBe(true);
    expect(
      matchesContactFilters(conv, { tagIds: ['t1'], company: 'Other' })
    ).toBe(false);
    expect(
      matchesContactFilters(conv, { tagIds: ['tX'], company: 'Acme' })
    ).toBe(false);
  });
});

describe('normalizeConversation', () => {
  it('flattens embedded contact_tags into contact.tags', () => {
    const raw = {
      id: 'c1',
      user_id: 'u1',
      contact_id: 'ct1',
      status: 'open' as const,
      unread_count: 0,
      created_at: '',
      updated_at: '',
      contact: {
        id: 'ct1',
        user_id: 'u1',
        account_id: 'a1',
        phone: '123',
        created_at: '',
        updated_at: '',
        contact_tags: [{ tags: tag('t1', 'VIP') }, { tags: null }],
      },
    };
    const normalized = normalizeConversation(raw);
    expect(normalized.contact?.tags).toEqual([tag('t1', 'VIP')]);
    // The raw join key is dropped from the flattened contact.
    expect(
      (normalized.contact as unknown as Record<string, unknown>).contact_tags
    ).toBeUndefined();
  });

  it('passes through a conversation with no contact', () => {
    const raw = {
      id: 'c1',
      user_id: 'u1',
      contact_id: 'ct1',
      status: 'open' as const,
      unread_count: 0,
      created_at: '',
      updated_at: '',
      contact: null,
    };
    // A contactless row passes through untouched (consumers use `?.`).
    expect(normalizeConversation(raw).contact).toBeNull();
  });
});

describe('sortConversationsByLastMessage', () => {
  it('moves a conversation with new activity to the top', () => {
    const older = makeConversation({ name: 'Older lead' });
    older.id = 'older';
    older.created_at = '2026-09-01T10:00:00.000Z';
    older.last_message_at = '2026-09-29T10:05:00.000Z';

    const previouslyFirst = makeConversation({ name: 'Current first lead' });
    previouslyFirst.id = 'first';
    previouslyFirst.created_at = '2026-09-20T10:00:00.000Z';
    previouslyFirst.last_message_at = '2026-09-29T10:00:00.000Z';

    expect(
      sortConversationsByLastMessage([previouslyFirst, older]).map(
        (conversation) => conversation.id
      )
    ).toEqual(['older', 'first']);
  });

  it('falls back to created_at for conversations without a message yet', () => {
    const oldConversation = makeConversation(null);
    oldConversation.id = 'old';
    oldConversation.created_at = '2026-09-01T10:00:00.000Z';

    const newConversation = makeConversation(null);
    newConversation.id = 'new';
    newConversation.created_at = '2026-09-02T10:00:00.000Z';

    expect(
      sortConversationsByLastMessage([oldConversation, newConversation]).map(
        (conversation) => conversation.id
      )
    ).toEqual(['new', 'old']);
  });
});
