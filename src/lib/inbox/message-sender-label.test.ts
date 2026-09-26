import { describe, expect, it } from 'vitest';

import type { Contact, Message, Profile } from '@/types';
import { messageSenderLabel } from './message-sender-label';

const baseMessage: Message = {
  id: 'message-1',
  conversation_id: 'conversation-1',
  sender_type: 'customer',
  content_type: 'text',
  content_text: 'Hola',
  status: 'delivered',
  created_at: '2026-09-25T12:00:00.000Z',
};

const contact = {
  id: 'contact-1',
  user_id: 'owner-1',
  account_id: 'account-1',
  phone: '+56912345678',
  name: 'Jorge',
  created_at: '2026-09-25T12:00:00.000Z',
  updated_at: '2026-09-25T12:00:00.000Z',
} satisfies Contact;

const profiles = [
  {
    id: 'profile-1',
    user_id: 'agent-1',
    full_name: 'Francisco Carrizo',
    email: 'francisco@example.com',
    role: 'agent',
    created_at: '2026-09-25T12:00:00.000Z',
  },
] satisfies Profile[];

describe('messageSenderLabel', () => {
  it('shows the contact name for customer messages', () => {
    expect(
      messageSenderLabel({ message: baseMessage, contact, profiles })
    ).toBe('Jorge');
  });

  it('falls back to the phone when the contact has no name', () => {
    expect(
      messageSenderLabel({
        message: baseMessage,
        contact: { ...contact, name: '  ' },
        profiles,
      })
    ).toBe('+56912345678');
  });

  it('shows Agente IA for bot messages', () => {
    expect(
      messageSenderLabel({
        message: { ...baseMessage, sender_type: 'bot' },
        contact,
        profiles,
      })
    ).toBe('Agente IA');
  });

  it('uses the persisted sender for human messages', () => {
    expect(
      messageSenderLabel({
        message: {
          ...baseMessage,
          sender_type: 'agent',
          sender_id: 'agent-1',
        },
        contact,
        profiles,
        assignedAgentId: 'other-agent',
      })
    ).toBe('Francisco Carrizo');
  });

  it('uses the assignee for legacy human messages without sender_id', () => {
    expect(
      messageSenderLabel({
        message: { ...baseMessage, sender_type: 'agent' },
        contact,
        profiles,
        assignedAgentId: 'agent-1',
      })
    ).toBe('Francisco Carrizo');
  });
});
