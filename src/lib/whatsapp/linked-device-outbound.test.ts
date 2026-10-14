import { describe, expect, it } from 'vitest';

import { linkedDeviceOutboundState } from './linked-device-outbound';

describe('linkedDeviceOutboundState', () => {
  it('keeps a new lead unassigned when WhatsApp emits an automatic greeting', () => {
    const state = linkedDeviceOutboundState({
      assignedAgentId: null,
      contentType: 'text',
      text: '¡Hola! ¿Cómo podemos ayudarte?',
      receivedAt: '2026-10-07T20:14:13.000Z',
      unreadCount: 0,
      updatedAt: '2026-10-07T20:14:20.000Z',
    });

    expect(state.senderId).toBeNull();
    expect(state.conversationPatch).toEqual({
      last_message_text: '¡Hola! ¿Cómo podemos ayudarte?',
      last_message_at: '2026-10-07T20:14:13.000Z',
      unread_count: 0,
      updated_at: '2026-10-07T20:14:20.000Z',
    });
    expect(state.conversationPatch).not.toHaveProperty('status');
    expect(state.conversationPatch).not.toHaveProperty('assigned_agent_id');
  });

  it('attributes a synchronized reply to an already assigned executive', () => {
    const state = linkedDeviceOutboundState({
      assignedAgentId: 'agent-1',
      contentType: 'image',
      text: '',
      receivedAt: '2026-10-07T21:00:00.000Z',
      unreadCount: 2,
      updatedAt: '2026-10-07T21:00:01.000Z',
    });

    expect(state.senderId).toBe('agent-1');
    expect(state.conversationPatch.last_message_text).toBe('[image]');
    expect(state.conversationPatch.unread_count).toBe(2);
  });
});
