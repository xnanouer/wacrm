import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AI_CONFIG_RUNTIME_DEFAULTS, type AiConfig } from './types';

// Shared, hoisted mock state so the module mocks can close over it.
const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  buildConversationContext: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateReply: vi.fn(),
  hasCatalogCardsInConversation: vi.fn(),
  findCatalogCandidates: vi.fn(),
  buildCatalogContext: vi.fn(),
  buildCatalogSummary: vi.fn(),
  isCatalogMediaRequest: vi.fn(),
  isCatalogSelection: vi.fn(),
  loadCatalogCandidatesByIds: vi.fn(),
  sendCatalogCandidates: vi.fn(),
  sendMessageToConversation: vi.fn(),
  sendSocialMessageToConversation: vi.fn(),
  reserveAiPoints: vi.fn(),
  finalizeAiPoints: vi.fn(),
  releaseAiPointsQuietly: vi.fn(),
  synthesizeOpenAiSpeech: vi.fn(),
  uploadAiVoiceNote: vi.fn(),
  loadConversationLeadProfile: vi.fn(),
  buildLeadQualificationContext: vi.fn(),
  saveConversationLeadProfile: vi.fn(),
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as { id: string }[],
    claim: true as boolean,
    updatePayload: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: unknown }[],
  },
}));

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }));
vi.mock('./context', () => ({
  buildConversationContext: h.buildConversationContext,
}));
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }));
vi.mock('./generate', () => ({ generateReply: h.generateReply }));
vi.mock('./catalog', () => ({
  hasCatalogCardsInConversation: h.hasCatalogCardsInConversation,
  findCatalogCandidates: h.findCatalogCandidates,
  buildCatalogContext: h.buildCatalogContext,
  buildCatalogSummary: h.buildCatalogSummary,
  isCatalogMediaRequest: h.isCatalogMediaRequest,
  isCatalogSelection: h.isCatalogSelection,
  loadCatalogCandidatesByIds: h.loadCatalogCandidatesByIds,
  sendCatalogCandidates: h.sendCatalogCandidates,
}));
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: h.sendMessageToConversation,
}));
vi.mock('@/lib/meta/send-message', () => ({
  sendSocialMessageToConversation: h.sendSocialMessageToConversation,
}));
vi.mock('./points/service', () => ({
  reserveAiPoints: h.reserveAiPoints,
  finalizeAiPoints: h.finalizeAiPoints,
  releaseAiPointsQuietly: h.releaseAiPointsQuietly,
}));
vi.mock('./audio', () => ({
  MAX_GENERATED_AUDIO_DURATION_MS: 300_000,
  synthesizeOpenAiSpeech: h.synthesizeOpenAiSpeech,
  uploadAiVoiceNote: h.uploadAiVoiceNote,
}));
vi.mock('./lead-profile', () => ({
  loadConversationLeadProfile: h.loadConversationLeadProfile,
  buildLeadQualificationContext: h.buildLeadQualificationContext,
  saveConversationLeadProfile: h.saveConversationLeadProfile,
}));
vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'automations') {
        // .select().eq().eq().in().limit() → active auto-responders
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          limit: () =>
            Promise.resolve({ data: h.state.autoResponders, error: null }),
        };
        return chain;
      }
      if (table === 'messages') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'message-uuid' }, error: null }),
        };
        return chain;
      }
      if (table === 'ai_agent_connections') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          then: (
            resolve: (value: { data: unknown[]; error: null }) => unknown
          ) => resolve({ data: [], error: null }),
        };
        return chain;
      }
      if (table === 'ai_after_hours_users') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({ data: { user_id: 'agent-9' }, error: null }),
        };
        return chain;
      }
      if (table === 'ticket_events') {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === 'accounts') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: { name: 'Empresa de prueba' },
              error: null,
            }),
        };
        return chain;
      }
      // conversations
      const conversationChain = {
        eq: () => conversationChain,
        maybeSingle: () => Promise.resolve({ data: h.state.conv, error: null }),
        then: (resolve: (value: { error: null }) => unknown) =>
          resolve({ error: null }),
      };
      return {
        select: () => conversationChain,
        update: (payload: Record<string, unknown>) => {
          h.state.updatePayload = payload;
          return conversationChain;
        },
      };
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args });
      return Promise.resolve({ data: h.state.claim, error: null });
    },
  }),
}));

import { dispatchInboundToAiReply } from './auto-reply';

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
  sourceMessageExternalId: 'wamid-test-1',
};

function aiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    ...AI_CONFIG_RUNTIME_DEFAULTS,
    id: 'config-1',
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    operatingMode: 'automatic',
    autoReplyMaxPerConversation: 3,
    catalogAiEnabled: false,
    catalogAiAutoSend: false,
    catalogAiMaxItems: 3,
    responseMode: 'text',
    embeddingsApiKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.conv = {
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
    ai_state: 'idle',
    whatsapp_config_id: 'wa-config-1',
    channel_connection_id: null,
    channel: 'whatsapp',
  };
  h.state.autoResponders = [];
  h.state.claim = true;
  h.state.updatePayload = null;
  h.state.rpcCalls = [];
  h.loadAiConfig.mockResolvedValue(aiConfig());
  h.buildConversationContext.mockResolvedValue([
    { role: 'user', content: 'hi' },
  ]);
  h.retrieveKnowledge.mockResolvedValue([]);
  h.hasCatalogCardsInConversation.mockReturnValue(false);
  h.findCatalogCandidates.mockResolvedValue({
    requested: false,
    candidates: [],
  });
  h.buildCatalogContext.mockReturnValue('catalog context');
  h.buildCatalogSummary.mockReturnValue(
    '🚘 *Vehículos disponibles:*\n\n1. *Toyota RAV4*\n\nRespóndeme con el número o modelo y te envío sus fotos.'
  );
  h.isCatalogMediaRequest.mockImplementation((message: string) =>
    /fotos?|imágenes?|galería/i.test(message)
  );
  h.isCatalogSelection.mockReturnValue(false);
  h.loadCatalogCandidatesByIds.mockResolvedValue([]);
  h.sendCatalogCandidates.mockResolvedValue(undefined);
  h.generateReply.mockResolvedValue({
    text: 'Hello!',
    handoff: false,
    replyMode: 'text',
  });
  h.synthesizeOpenAiSpeech.mockResolvedValue({
    buffer: new Uint8Array([1, 2, 3]),
    mimeType: 'audio/ogg',
    durationMs: 8_000,
  });
  h.uploadAiVoiceNote.mockResolvedValue(
    'https://storage.example/voice-note.ogg'
  );
  h.loadConversationLeadProfile.mockResolvedValue({
    full_name: null,
    phone: '+56911112222',
  });
  h.buildLeadQualificationContext.mockReturnValue('lead qualification context');
  h.saveConversationLeadProfile.mockResolvedValue(undefined);
  h.sendMessageToConversation.mockResolvedValue({
    messageId: 'message-out-1',
    whatsappMessageId: 'm1',
  });
  h.sendSocialMessageToConversation.mockResolvedValue({
    messageId: 'message-social-out-1',
    metaMessageId: 'mid-social-1',
  });
  h.reserveAiPoints.mockResolvedValue({
    operationId: 'operation-1',
    points: 1,
  });
  h.finalizeAiPoints.mockResolvedValue(1);
  h.releaseAiPointsQuietly.mockResolvedValue(undefined);
});

describe('dispatchInboundToAiReply — eligibility gates', () => {
  it('claims a slot and sends on the happy path', async () => {
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.rpcCalls).toEqual([
      {
        name: 'claim_ai_reply_slot',
        args: { conversation_id: 'conv-1', max_replies: 3 },
      },
    ]);
    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        conversationId: 'conv-1',
        contentText: 'Hello!',
        senderType: 'bot',
        pauseFlows: false,
      })
    );
    expect(h.reserveAiPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'automatic_text_reply',
        idempotencyKey: 'automatic:wamid-test-1',
      })
    );
    expect(h.finalizeAiPoints).toHaveBeenCalledWith(
      'operation-1',
      expect.any(Object)
    );
  });

  it('does not consume points outside a weekend-only schedule', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T15:00:00Z'));
    h.reserveAiPoints.mockClear();
    h.buildConversationContext.mockClear();
    h.sendMessageToConversation.mockClear();
    h.loadAiConfig.mockResolvedValue(aiConfig({ activeSchedule: 'weekends' }));

    try {
      await dispatchInboundToAiReply(ARGS);

      expect(h.buildConversationContext).not.toHaveBeenCalled();
      expect(h.reserveAiPoints).not.toHaveBeenCalled();
      expect(h.sendMessageToConversation).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes an automatic reply through the connected social channel', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
      ai_state: 'idle',
      whatsapp_config_id: null,
      channel_connection_id: 'social-connection-1',
      channel: 'instagram',
    };

    await dispatchInboundToAiReply(ARGS);

    expect(h.sendSocialMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        conversationId: 'conv-1',
        contentText: 'Hello!',
        senderType: 'bot',
      })
    );
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('keeps replying with an unlimited configuration', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 500,
      whatsapp_config_id: 'wa-config-1',
      channel_connection_id: null,
    };
    h.loadAiConfig.mockResolvedValue(
      aiConfig({ autoReplyMaxPerConversation: null })
    );

    await dispatchInboundToAiReply(ARGS);

    expect(h.state.rpcCalls).toContainEqual({
      name: 'claim_ai_reply_slot',
      args: { conversation_id: 'conv-1', max_replies: null },
    });
    expect(h.sendMessageToConversation).toHaveBeenCalled();
  });

  it('grounds the reply in retrieved knowledge', async () => {
    h.retrieveKnowledge.mockResolvedValue(['Returns accepted within 30 days.']);
    await dispatchInboundToAiReply(ARGS);
    expect(h.retrieveKnowledge).toHaveBeenCalled();
    const systemPrompt = h.generateReply.mock.calls[0][0]
      .systemPrompt as string;
    expect(systemPrompt).toContain('Returns accepted within 30 days.');
  });

  it('sends a voice note when the agent decides audio is more useful', async () => {
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        audioEnabled: true,
        transcriptionModel: 'gpt-4o-mini-transcribe',
        speechModel: 'tts-1',
        speechVoice: 'alloy',
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          generate_audio: true,
        },
      })
    );
    h.generateReply.mockResolvedValue({
      text: 'Te lo explico de forma breve.',
      handoff: false,
      replyMode: 'audio',
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.synthesizeOpenAiSpeech).toHaveBeenCalled();
    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        messageType: 'audio',
        mediaUrl: 'https://storage.example/voice-note.ogg',
      })
    );
  });

  it('grounds the reply and sends approved catalog cards automatically', async () => {
    const candidate = {
      id: 'vehicle-1',
      make: 'Toyota',
      model: 'RAV4',
      year: 2024,
    };
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        catalogAiEnabled: true,
        catalogAiAutoSend: true,
        catalogDeliveryMode: 'photos_immediately',
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          query_catalog: true,
          suggest_catalog_items: true,
        },
      })
    );
    h.findCatalogCandidates.mockResolvedValue({
      requested: true,
      candidates: [candidate],
    });
    h.buildCatalogContext.mockReturnValue('Toyota RAV4 — $20.000.000');
    h.loadCatalogCandidatesByIds.mockResolvedValue([candidate]);

    await dispatchInboundToAiReply(ARGS);

    const systemPrompt = h.generateReply.mock.calls[0][0]
      .systemPrompt as string;
    expect(systemPrompt).toContain('Toyota RAV4');
    expect(systemPrompt).toContain(
      'Nexora will send the matching item cards with their real image and commercial details immediately'
    );
    expect(h.loadCatalogCandidatesByIds).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      ['vehicle-1']
    );
    expect(h.sendCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        actorUserId: 'user-1',
        whatsappConfigId: 'wa-config-1',
        introMessageId: 'message-out-1',
        candidates: [candidate],
        senderType: 'bot',
        source: 'nexora_ai',
      })
    );
  });

  it('sends catalog photos instead of handing off a general photo request', async () => {
    const candidate = {
      id: 'vehicle-1',
      make: 'Toyota',
      model: 'RAV4',
      year: 2024,
    };
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        catalogAiEnabled: true,
        catalogAiAutoSend: true,
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          query_catalog: true,
          suggest_catalog_items: true,
        },
      })
    );
    h.buildConversationContext.mockResolvedValue([
      {
        role: 'user',
        content: 'Mándame fotos de los vehículos disponibles',
      },
    ]);
    h.findCatalogCandidates.mockResolvedValue({
      requested: true,
      candidates: [candidate],
    });
    h.loadCatalogCandidatesByIds.mockResolvedValue([candidate]);
    h.generateReply.mockResolvedValue({
      text: 'Necesitas hablar con un ejecutivo.',
      handoff: true,
      replyMode: 'text',
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        contentText: expect.stringContaining('fotos'),
        senderType: 'bot',
      })
    );
    expect(h.sendCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [candidate] })
    );
    expect(h.state.updatePayload).not.toEqual(
      expect.objectContaining({ ai_state: 'waiting_for_human' })
    );
    expect(h.finalizeAiPoints).toHaveBeenCalledWith(
      'operation-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'reply_generated' }),
      })
    );
  });

  it('sends a numbered summary first and does not attach photos', async () => {
    const candidates = [
      { id: 'vehicle-1', make: 'Toyota', model: 'RAV4', year: 2024 },
      { id: 'vehicle-2', make: 'BAIC', model: 'X55', year: 2023 },
    ];
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        catalogAiEnabled: true,
        catalogAiAutoSend: true,
        catalogDeliveryMode: 'summary_first',
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          query_catalog: true,
          suggest_catalog_items: true,
        },
      })
    );
    h.buildConversationContext.mockResolvedValue([
      { role: 'user', content: 'Envíame el catálogo disponible' },
    ]);
    h.findCatalogCandidates.mockResolvedValue({
      requested: true,
      candidates,
    });
    h.loadCatalogCandidatesByIds.mockResolvedValue(candidates);

    await dispatchInboundToAiReply(ARGS);

    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        contentText: expect.stringContaining('Vehículos disponibles'),
      })
    );
    expect(h.sendCatalogCandidates).not.toHaveBeenCalled();
  });

  it('sends the selected vehicle gallery when the customer replies with its number', async () => {
    const candidate = {
      id: 'vehicle-2',
      make: 'BAIC',
      model: 'X55',
      year: 2023,
    };
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        catalogAiEnabled: true,
        catalogAiAutoSend: true,
        catalogDeliveryMode: 'summary_first',
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          query_catalog: true,
          suggest_catalog_items: true,
        },
      })
    );
    h.buildConversationContext.mockResolvedValue([
      {
        role: 'assistant',
        content: '🚘 Vehículos disponibles:\n1. Toyota RAV4\n2. BAIC X55',
      },
      { role: 'user', content: '2' },
    ]);
    h.isCatalogSelection.mockReturnValue(true);
    h.findCatalogCandidates.mockResolvedValue({
      requested: true,
      candidates: [candidate],
    });
    h.loadCatalogCandidatesByIds.mockResolvedValue([candidate]);

    await dispatchInboundToAiReply(ARGS);

    expect(h.sendCatalogCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [candidate] })
    );
  });

  it('stores only the lead fields returned by the automatic agent', async () => {
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        leadFields: ['nombre completo', 'ciudad o comuna'],
        permissions: {
          ...AI_CONFIG_RUNTIME_DEFAULTS.permissions,
          classify_leads: true,
        },
      })
    );
    h.generateReply.mockResolvedValue({
      text: 'Gracias, Ana. ¿En qué comuna estás?',
      handoff: false,
      replyMode: 'text',
      leadProfilePatch: { full_name: 'Ana Pérez' },
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.saveConversationLeadProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct-1',
        conversationId: 'conv-1',
        contactId: 'contact-1',
        patch: { full_name: 'Ana Pérez' },
      })
    );
  });

  it('stands down when an active message-level automation exists', async () => {
    h.state.autoResponders = [{ id: 'auto-1' }];
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('does not send when the atomic slot claim loses the race', async () => {
    h.state.claim = false;
    await dispatchInboundToAiReply(ARGS);
    // It still attempts the claim, but the send is skipped.
    expect(h.state.rpcCalls).toHaveLength(1);
    expect(h.releaseAiPointsQuietly).toHaveBeenCalledWith(
      'operation-1',
      'reply_limit_reached'
    );
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('releases reserved points when the provider fails', async () => {
    h.generateReply.mockRejectedValue(new Error('provider unavailable'));
    await dispatchInboundToAiReply(ARGS);
    expect(h.releaseAiPointsQuietly).toHaveBeenCalledWith(
      'operation-1',
      'provider_request_failed'
    );
    expect(h.finalizeAiPoints).not.toHaveBeenCalled();
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('skips when AI is off / not configured', async () => {
    h.loadAiConfig.mockResolvedValue(null);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('skips when auto-reply is disabled for the account', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ autoReplyEnabled: false }));
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('skips when a human agent is assigned', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('responds when an assigned conversation was manually left with AI', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
      ai_state: 'ai_active',
      whatsapp_config_id: 'wa-config-1',
      channel_connection_id: null,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.rpcCalls).toContainEqual({
      name: 'claim_ai_coverage_reply_slot',
      args: {
        p_conversation_id: 'conv-1',
        p_mode: 'manual',
        p_max_replies: 3,
      },
    });
    expect(h.reserveAiPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { surface: 'manual_ai_delegation' },
      })
    );
    expect(h.sendMessageToConversation).toHaveBeenCalled();
    expect(h.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('Nunca te hagas pasar'),
      })
    );
  });

  it('responds outside schedule when coverage is enabled', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
      ai_state: 'idle',
      whatsapp_config_id: 'wa-config-1',
      channel_connection_id: null,
    };
    h.loadAiConfig.mockResolvedValue(
      aiConfig({
        afterHoursCoverageEnabled: true,
        afterHoursBehavior: 'automatic',
      })
    );
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.rpcCalls).toContainEqual({
      name: 'is_user_unavailable_for_ai',
      args: expect.objectContaining({
        p_account_id: 'acct-1',
        p_user_id: 'agent-9',
      }),
    });
    expect(h.state.rpcCalls).toContainEqual({
      name: 'claim_ai_coverage_reply_slot',
      args: {
        p_conversation_id: 'conv-1',
        p_mode: 'after_hours',
        p_max_replies: 3,
      },
    });
    expect(h.reserveAiPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { surface: 'after_hours_coverage' },
      })
    );
  });

  it('skips when auto-reply was disabled on this conversation', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: true,
      ai_reply_count: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('skips when the per-conversation cap is reached', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 3,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([]);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.sendMessageToConversation).not.toHaveBeenCalled();
  });
});

describe('dispatchInboundToAiReply — handoff', () => {
  it('notifies the customer before disabling auto-reply on handoff', async () => {
    h.generateReply.mockResolvedValue({
      text: '',
      handoff: true,
      replyMode: 'text',
    });
    await dispatchInboundToAiReply(ARGS);
    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageType: 'text',
        senderType: 'bot',
        contentText: expect.stringContaining('ejecutivo'),
      })
    );
    expect(h.state.updatePayload).toEqual(
      expect.objectContaining({
        ai_autoreply_disabled: true,
        ai_state: 'waiting_for_human',
        ai_pause_reason: 'handoff',
      })
    );
    expect(h.state.rpcCalls).toHaveLength(1);
    expect(h.finalizeAiPoints).toHaveBeenCalled();
  });

  it('sends the model transition sentence before handoff', async () => {
    h.generateReply.mockResolvedValue({
      text: 'Te comunicaré con un ejecutivo para continuar.',
      handoff: true,
      replyMode: 'text',
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.sendMessageToConversation).toHaveBeenCalledWith(
      expect.anything(),
      'acct-1',
      expect.objectContaining({
        contentText: 'Te comunicaré con un ejecutivo para continuar.',
      })
    );
  });
});
