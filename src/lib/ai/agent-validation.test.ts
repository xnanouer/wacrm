import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseStructuredAiConfig } from './agent-validation';

describe('parseStructuredAiConfig operating mode', () => {
  it('enables automatic replies only when the agent and automatic mode are active', () => {
    const config = parseStructuredAiConfig({
      is_active: true,
      operating_mode: 'automatic',
      auto_reply_enabled: true,
      auto_reply_max_per_conversation: 4,
    });

    expect(config.is_active).toBe(true);
    expect(config.operating_mode).toBe('automatic');
    expect(config.auto_reply_enabled).toBe(true);
    expect(config.auto_reply_max_per_conversation).toBe(4);
  });

  it('turns automatic replies off in suggestion mode', () => {
    const config = parseStructuredAiConfig({
      is_active: true,
      operating_mode: 'suggestion',
      auto_reply_enabled: true,
    });

    expect(config.operating_mode).toBe('suggestion');
    expect(config.auto_reply_enabled).toBe(false);
  });

  it('allows up to 50 automatic replies and clamps larger values', () => {
    expect(
      parseStructuredAiConfig({
        is_active: true,
        operating_mode: 'automatic',
        auto_reply_enabled: true,
        auto_reply_max_per_conversation: 50,
      }).auto_reply_max_per_conversation
    ).toBe(50);
    expect(
      parseStructuredAiConfig({
        is_active: true,
        operating_mode: 'automatic',
        auto_reply_enabled: true,
        auto_reply_max_per_conversation: 500,
      }).auto_reply_max_per_conversation
    ).toBe(50);
  });

  it('preserves null as an unlimited automatic-reply setting', () => {
    expect(
      parseStructuredAiConfig({
        is_active: true,
        operating_mode: 'automatic',
        auto_reply_enabled: true,
        auto_reply_max_per_conversation: null,
      }).auto_reply_max_per_conversation
    ).toBeNull();
  });

  it('turns automatic replies off when the agent is inactive', () => {
    const config = parseStructuredAiConfig({
      is_active: false,
      operating_mode: 'automatic',
      auto_reply_enabled: true,
    });

    expect(config.operating_mode).toBe('automatic');
    expect(config.auto_reply_enabled).toBe(false);
  });

  it('enables automatic catalog delivery only in automatic mode with catalog permissions', () => {
    const config = parseStructuredAiConfig({
      is_active: true,
      operating_mode: 'automatic',
      catalog_ai_enabled: true,
      catalog_ai_auto_send: true,
      permissions: {
        query_catalog: true,
        suggest_catalog_items: true,
      },
    });

    expect(config.catalog_ai_enabled).toBe(true);
    expect(config.catalog_ai_auto_send).toBe(true);
  });

  it('disables automatic catalog delivery in suggestion mode', () => {
    const config = parseStructuredAiConfig({
      is_active: true,
      operating_mode: 'suggestion',
      catalog_ai_enabled: true,
      catalog_ai_auto_send: true,
      permissions: {
        query_catalog: true,
        suggest_catalog_items: true,
      },
    });

    expect(config.catalog_ai_enabled).toBe(true);
    expect(config.catalog_ai_auto_send).toBe(false);
  });
});
