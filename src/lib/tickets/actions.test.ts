import { describe, expect, it } from 'vitest';

import { parseTicketAction, TicketActionError } from './actions';

describe('parseTicketAction', () => {
  it('parses accept and every supported status', () => {
    expect(parseTicketAction({ action: 'accept' })).toEqual({
      action: 'accept',
    });
    expect(parseTicketAction({ action: 'status', status: 'waiting' })).toEqual({
      action: 'status',
      status: 'waiting',
      note: undefined,
    });
  });

  it('trims transfer observations', () => {
    expect(
      parseTicketAction({
        action: 'transfer',
        assignedAgentId: '11111111-1111-4111-8111-111111111111',
        departmentId: '22222222-2222-4222-8222-222222222222',
        note: '  Retoma mañana  ',
      })
    ).toEqual({
      action: 'transfer',
      assignedAgentId: '11111111-1111-4111-8111-111111111111',
      departmentId: '22222222-2222-4222-8222-222222222222',
      note: 'Retoma mañana',
    });
  });

  it('rejects unknown actions and invalid statuses', () => {
    expect(() => parseTicketAction({ action: 'delete' })).toThrow(
      TicketActionError
    );
    expect(() =>
      parseTicketAction({ action: 'status', status: 'archived' })
    ).toThrow('Invalid ticket status');
  });
});
