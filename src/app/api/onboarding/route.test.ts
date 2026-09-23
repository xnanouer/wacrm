import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { getIndustryConfig } from '@/lib/industries/config';

let updatePayload: Record<string, unknown> | null = null;
const requireRole = vi.fn();

vi.mock('@/lib/auth/account', () => ({
  requireRole,
  getCurrentAccount: vi.fn(),
  toErrorResponse: () =>
    NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
}));

function accountClient() {
  const chain = {
    eq: () => chain,
    select: () => chain,
    maybeSingle: async () => ({
      data: { id: 'account-1', name: 'Nueva empresa' },
      error: null,
    }),
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

const { POST } = await import('./route');

afterEach(() => {
  updatePayload = null;
  vi.clearAllMocks();
});

function completeAnswers(industry: 'automotive' | 'real_estate_construction') {
  return Object.fromEntries(
    getIndustryConfig(industry).questions.map((question) => [
      question.id,
      question.type === 'multiple'
        ? [question.options[0].value]
        : question.options[0].value,
    ])
  );
}

describe('POST /api/onboarding', () => {
  it('saves a complete account onboarding only after validation', async () => {
    requireRole.mockResolvedValue({
      accountId: 'account-1',
      userId: 'owner-1',
      supabase: accountClient(),
    });
    const response = await POST(
      new Request('http://local/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Salgado Automotriz',
          industry: 'automotive',
          answers: completeAnswers('automotive'),
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith('owner');
    expect(updatePayload).toMatchObject({
      name: 'Salgado Automotriz',
      industry: 'automotive',
      business_subtype: null,
      onboarding_completed: true,
    });
  });

  it('rejects a future industry even when manipulated in the request', async () => {
    requireRole.mockResolvedValue({
      accountId: 'account-1',
      userId: 'owner-1',
      supabase: accountClient(),
    });
    const response = await POST(
      new Request('http://local/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Restaurante',
          industry: 'restaurant',
          answers: {},
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(updatePayload).toBeNull();
  });

  it('fails closed when the caller is not the account owner', async () => {
    requireRole.mockRejectedValue(new Error('Insufficient role'));
    const response = await POST(
      new Request('http://local/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Empresa',
          industry: 'automotive',
          answers: completeAnswers('automotive'),
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(updatePayload).toBeNull();
  });
});
