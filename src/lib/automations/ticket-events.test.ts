import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  },
  run: vi.fn(),
}));

vi.mock('./engine', () => ({
  runAutomationsForTrigger: h.run,
}));

vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    rpc: () => Promise.resolve({ data: h.state.rows, error: null }),
    from: () => {
      const builder: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          h.state.updates.push(payload);
          return builder;
        },
        eq: () => builder,
        then: (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(onFulfilled),
      };
      return builder;
    },
  }),
}));

import { processTicketAutomationEvents } from './ticket-events';

beforeEach(() => {
  h.state.rows = [];
  h.state.updates = [];
  h.run.mockReset();
  h.run.mockResolvedValue(undefined);
});

describe('processTicketAutomationEvents', () => {
  it('dispatches the claimed event with its internal idempotency key', async () => {
    h.state.rows = [queueRow(1)];

    const result = await processTicketAutomationEvents();

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(h.run).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct-1',
        triggerType: 'ticket_closed',
        contactId: 'contact-1',
        ticketEventId: 'event-1',
      })
    );
    expect(h.state.updates[0]).toMatchObject({ status: 'done' });
  });

  it('returns a failed event to the pending queue before the final attempt', async () => {
    h.state.rows = [queueRow(2)];
    h.run.mockRejectedValueOnce(new Error('temporary failure'));

    const result = await processTicketAutomationEvents();

    expect(result).toEqual({ processed: 0, failed: 1 });
    expect(h.state.updates[0]).toMatchObject({
      status: 'pending',
      error_message: 'temporary failure',
    });
  });

  it('marks the third failed attempt as terminal', async () => {
    h.state.rows = [queueRow(3)];
    h.run.mockRejectedValueOnce(new Error('permanent failure'));

    await processTicketAutomationEvents();

    expect(h.state.updates[0]).toMatchObject({ status: 'failed' });
  });
});

function queueRow(attempts: number) {
  return {
    id: 'queue-1',
    account_id: 'acct-1',
    ticket_event_id: 'event-1',
    contact_id: 'contact-1',
    trigger_type: 'ticket_closed',
    context: { conversation_id: 'conversation-1' },
    attempts,
  };
}
