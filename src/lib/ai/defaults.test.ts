import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, HANDOFF_SENTINEL } from './defaults';

describe('buildSystemPrompt handoff policy', () => {
  it('keeps ordinary missing-information and catalog turns with the AI', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
    });

    expect(prompt).toContain(
      'Missing information, a broad question or no exact catalog match is not by itself a reason to hand off'
    );
    expect(prompt).toContain(
      `then put ${HANDOFF_SENTINEL} on its own final line`
    );
    expect(prompt).not.toContain('Prefer handing off over guessing');
  });
});
