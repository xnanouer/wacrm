import { describe, expect, it } from 'vitest';

import { reopenedTicketState } from './reopen-assignment';

describe('reopenedTicketState', () => {
  it('returns a closed ticket to its previous agent', () => {
    expect(reopenedTicketState('agent-1')).toEqual({
      status: 'open',
      assigned_agent_id: 'agent-1',
    });
  });

  it('returns the ticket to the shared queue when no valid agent remains', () => {
    expect(reopenedTicketState(null)).toEqual({
      status: 'pending',
      assigned_agent_id: null,
    });
  });
});
