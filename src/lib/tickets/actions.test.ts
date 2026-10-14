import { describe, expect, it } from 'vitest';

import { parseTicketAction, TicketActionError } from './actions';

describe('parseTicketAction', () => {
  it('parses accept and every supported status', () => {
    expect(parseTicketAction({ action: 'accept', confirmed: true })).toEqual({
      action: 'accept',
      confirmed: true,
    });
    expect(parseTicketAction({ action: 'status', status: 'waiting' })).toEqual({
      action: 'status',
      status: 'waiting',
      note: undefined,
    });
  });

  it('rejects an accept action without explicit confirmation', () => {
    expect(() => parseTicketAction({ action: 'accept' })).toThrow(
      'Debes confirmar expresamente'
    );
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

  it('requires a note and at least one valid tag to resolve', () => {
    expect(
      parseTicketAction({
        action: 'resolve',
        note: '  Cliente confirma que su solicitud fue resuelta.  ',
        tagIds: ['11111111-1111-4111-8111-111111111111'],
      })
    ).toEqual({
      action: 'resolve',
      note: 'Cliente confirma que su solicitud fue resuelta.',
      tagIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(() =>
      parseTicketAction({ action: 'resolve', note: '', tagIds: [] })
    ).toThrow('Debes escribir el motivo del cierre');
    expect(() =>
      parseTicketAction({
        action: 'resolve',
        note: 'Finalizado',
        tagIds: [],
      })
    ).toThrow('Debes seleccionar al menos una etiqueta');
  });

  it('rejects closing through the generic status action', () => {
    expect(() =>
      parseTicketAction({ action: 'status', status: 'closed' })
    ).toThrow('Para resolver debes seleccionar una etiqueta');
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
