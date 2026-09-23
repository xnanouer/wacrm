import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  settings: {
    text_provider: 'openai',
    text_model: 'gpt-managed',
    encrypted_api_key: 'enc-platform-key',
    global_enabled: true,
    audio_enabled: false,
  } as Record<string, unknown> | null,
  entitlement: { platform_enabled: true } as Record<string, unknown> | null,
}));

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (value: string) => `plain:${value}`,
}));

vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'platform_ai_settings' ? h.settings : h.entitlement,
            error: null,
          }),
      };
      return chain;
    },
  }),
}));

import { loadAiConfig } from './config';

function dbReturning(row: Record<string, unknown> | null): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return chain as unknown as SupabaseClient;
}

const ROW = {
  id: 'config-1',
  system_prompt: null,
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  catalog_ai_enabled: false,
  catalog_ai_auto_send: true,
  catalog_ai_max_items: 3,
  response_mode: 'text',
};

describe('loadAiConfig managed mode', () => {
  it('returns null for an inactive config by default', async () => {
    expect(await loadAiConfig(dbReturning(ROW), 'acct')).toBeNull();
  });

  it('combines tenant behavior with platform credentials', async () => {
    const config = await loadAiConfig(dbReturning(ROW), 'acct', {
      requireActive: false,
    });
    expect(config).toMatchObject({
      id: 'config-1',
      provider: 'openai',
      model: 'gpt-managed',
      apiKey: 'plain:enc-platform-key',
      responseMode: 'text',
      catalogAiEnabled: false,
      catalogAiAutoSend: true,
      catalogAiMaxItems: 3,
      embeddingsApiKey: null,
    });
  });

  it('returns null when Nexora disabled the company', async () => {
    h.entitlement = { platform_enabled: false };
    expect(
      await loadAiConfig(dbReturning(ROW), 'acct', { requireActive: false })
    ).toBeNull();
    h.entitlement = { platform_enabled: true };
  });

  it('returns null when there is no tenant brain', async () => {
    expect(
      await loadAiConfig(dbReturning(null), 'acct', { requireActive: false })
    ).toBeNull();
  });
});
