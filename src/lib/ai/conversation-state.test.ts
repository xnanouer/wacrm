import { describe, expect, it } from 'vitest';

import { getConversationAiIndicator } from './conversation-state';

describe('getConversationAiIndicator', () => {
  it('shows active after-hours coverage', () => {
    expect(
      getConversationAiIndicator({
        ai_state: 'ai_after_hours',
        assigned_agent_id: 'agent-1',
      })
    ).toMatchObject({ label: 'Cubierto por IA', active: true });
  });

  it('prioritizes the no-points warning', () => {
    expect(
      getConversationAiIndicator({
        ai_state: 'waiting_for_human',
        ai_pause_reason: 'insufficient_points',
      })
    ).toMatchObject({ label: 'Sin puntos IA', active: false });
  });

  it('shows human takeover', () => {
    expect(
      getConversationAiIndicator({ ai_state: 'human_active' })
    ).toMatchObject({ label: 'Tomado por humano', active: false });
  });

  it('stays hidden for untouched conversations', () => {
    expect(getConversationAiIndicator({ ai_state: 'idle' })).toBeNull();
  });
});
