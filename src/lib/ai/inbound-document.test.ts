import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_CONFIG_RUNTIME_DEFAULTS, type AiConfig } from './types';

const h = vi.hoisted(() => ({
  prepareOutboundMediaUrl: vi.fn(),
}));

vi.mock('@/lib/storage/private-media-server', () => ({
  prepareOutboundMediaUrl: h.prepareOutboundMediaUrl,
}));

import {
  analyzeInboundLeadDocument,
  detectLeadDocumentMime,
} from './inbound-document';

function config(): AiConfig {
  return {
    ...AI_CONFIG_RUNTIME_DEFAULTS,
    id: 'config-1',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 5,
    catalogAiEnabled: false,
    catalogAiAutoSend: false,
    catalogAiMaxItems: 3,
    responseMode: 'text',
    embeddingsApiKey: null,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  h.prepareOutboundMediaUrl.mockResolvedValue(
    'https://storage.example/document.jpg'
  );
});

describe('inbound lead document analysis', () => {
  it('detects supported bytes even when storage returns a generic MIME', () => {
    expect(
      detectLeadDocumentMime(
        new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
        'application/octet-stream'
      )
    ).toBe('image/jpeg');
    expect(
      detectLeadDocumentMime(
        new TextEncoder().encode('%PDF-1.7 test'),
        'application/octet-stream'
      )
    ).toBe('application/pdf');
  });

  it('extracts a full name only when the same document has a valid RUT', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'resp-1',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: '{"full_name":"CARLOS ALBERTO SOTO PÉREZ","rut":"17.955.246-9"}',
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    await expect(
      analyzeInboundLeadDocument({
        db: {} as never,
        accountId: 'account-1',
        config: config(),
        mediaUrl: '/api/storage/media?bucket=chat-media&path=x',
      })
    ).resolves.toEqual({
      patch: {
        full_name: 'CARLOS ALBERTO SOTO PÉREZ',
        rut: '17.955.246-9',
      },
      providerRequestId: 'resp-1',
    });

    const providerBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit)?.body)
    );
    expect(providerBody.store).toBe(false);
    expect(providerBody.input[0].content[1].type).toBe('input_image');
  });

  it('rejects an invalid RUT and does not save an unlinked name', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'resp-2',
            output_text:
              '{"full_name":"CARLOS ALBERTO SOTO PÉREZ","rut":"17.955.246-8"}',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    await expect(
      analyzeInboundLeadDocument({
        db: {} as never,
        accountId: 'account-1',
        config: config(),
        mediaUrl: 'https://storage.example/document.jpg',
      })
    ).resolves.toEqual({ patch: {}, providerRequestId: 'resp-2' });
  });
});
