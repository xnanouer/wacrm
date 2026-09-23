import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

let updatePayload: Record<string, unknown> | null = null;
const requireRole = vi.fn();

vi.mock('@/lib/auth/account', () => ({
  requireRole,
  getCurrentAccount: vi.fn(),
  toErrorResponse: () =>
    NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { adminAction: {} },
}));

function accountClient() {
  const chain = {
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: { id: 'account-1' }, error: null }),
  };
  return {
    from: () => ({
      update(payload: Record<string, unknown>) {
        updatePayload = payload;
        return chain;
      },
    }),
  };
}

const { PATCH } = await import('./route');

afterEach(() => {
  updatePayload = null;
  vi.clearAllMocks();
});

describe('PATCH /api/account industry', () => {
  it('changes industry without deleting or replacing account data', async () => {
    requireRole.mockResolvedValue({
      accountId: 'account-1',
      userId: 'admin-1',
      supabase: accountClient(),
    });
    const response = await PATCH(
      new Request('http://local/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Empresa Uno',
          industry: 'automotive',
          businessSubtype: null,
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(updatePayload).toEqual({
      name: 'Empresa Uno',
      industry: 'automotive',
      business_subtype: null,
    });
  });

  it('rejects a disabled industry', async () => {
    requireRole.mockResolvedValue({
      accountId: 'account-1',
      userId: 'admin-1',
      supabase: accountClient(),
    });
    const response = await PATCH(
      new Request('http://local/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Empresa Uno', industry: 'healthcare' }),
      })
    );
    expect(response.status).toBe(400);
    expect(updatePayload).toBeNull();
  });
});
