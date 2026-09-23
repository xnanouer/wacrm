import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  metadata: null as Record<string, unknown> | null,
  operationError: null as { message: string } | null,
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    rpc: h.rpc,
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({
            data: h.metadata ? { technical_metadata: h.metadata } : null,
            error: h.operationError,
          }),
      };
      return chain;
    },
  }),
}));

import { finalizeAiPoints, releaseAiPoints, reserveAiPoints } from './service';

beforeEach(() => {
  h.metadata = null;
  h.operationError = null;
  h.rpc.mockReset();
  h.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === 'reserve_ai_points') {
      h.metadata = args.p_metadata as Record<string, unknown>;
      return Promise.resolve({
        data: {
          operation_id: 'operation-1',
          operation_status: 'reserved',
          reserved_points: 1,
        },
        error: null,
      });
    }
    if (name === 'finalize_ai_points') {
      return Promise.resolve({ data: 1, error: null });
    }
    return Promise.resolve({ data: true, error: null });
  });
});

describe('managed AI point service', () => {
  it('reserves a point with tenant context and an ownership token', async () => {
    const reservation = await reserveAiPoints({
      accountId: 'account-1',
      action: 'suggested_reply',
      idempotencyKey: 'draft:request-1',
      actorUserId: 'user-1',
      metadata: { surface: 'test' },
    });

    expect(reservation).toEqual({ operationId: 'operation-1', points: 1 });
    expect(h.rpc).toHaveBeenCalledWith(
      'reserve_ai_points',
      expect.objectContaining({
        p_account_id: 'account-1',
        p_action_key: 'suggested_reply',
        p_idempotency_key: 'draft:request-1',
        p_metadata: expect.objectContaining({
          surface: 'test',
          reservation_owner_token: expect.any(String),
        }),
      })
    );
  });

  it('rejects an operation already owned by another request', async () => {
    h.rpc.mockResolvedValueOnce({
      data: {
        operation_id: 'operation-old',
        operation_status: 'reserved',
        reserved_points: 1,
      },
      error: null,
    });
    h.metadata = { reservation_owner_token: 'another-request' };

    await expect(
      reserveAiPoints({
        accountId: 'account-1',
        action: 'suggested_reply',
        idempotencyKey: 'draft:request-duplicate',
      })
    ).rejects.toMatchObject({ code: 'ai_duplicate_request', status: 409 });
  });

  it('maps insufficient balance to a customer-safe error', async () => {
    h.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'AI_INSUFFICIENT_POINTS' },
    });

    await expect(
      reserveAiPoints({
        accountId: 'account-1',
        action: 'suggested_reply',
        idempotencyKey: 'draft:no-balance',
      })
    ).rejects.toMatchObject({
      code: 'ai_insufficient_points',
      status: 402,
    });
  });

  it('finalizes and releases only through service RPCs', async () => {
    await expect(finalizeAiPoints('operation-1')).resolves.toBe(1);
    await expect(
      releaseAiPoints('operation-2', 'provider_failed')
    ).resolves.toBeUndefined();
    expect(h.rpc).toHaveBeenCalledWith(
      'release_ai_points',
      expect.objectContaining({
        p_operation_id: 'operation-2',
        p_reason: 'provider_failed',
      })
    );
  });
});
