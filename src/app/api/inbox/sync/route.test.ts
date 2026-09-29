import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

import { GET } from './route';

function queryResult(
  data: unknown[],
  error: { message: string } | null = null
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (
      resolve: (value: {
        data: unknown[];
        error: { message: string } | null;
      }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe('GET /api/inbox/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects requests without an authenticated session', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const response = await GET(new Request('http://localhost/api/inbox/sync'));

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns only recent conversation and active-thread deltas', async () => {
    const conversations = queryResult([
      {
        id: 'conversation-1',
        user_id: 'user-1',
        contact_id: 'contact-1',
        status: 'open',
        unread_count: 1,
        created_at: '2026-09-29T10:00:00.000Z',
        updated_at: '2026-09-29T10:01:00.000Z',
        contact: null,
      },
    ]);
    const messages = queryResult([
      {
        id: 'message-1',
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        sender_type: 'customer',
        content_type: 'text',
        status: 'delivered',
        created_at: '2026-09-29T10:01:00.000Z',
      },
    ]);
    const from = vi.fn((table: string) =>
      table === 'conversations' ? conversations : messages
    );
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      from,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/inbox/sync?since=2026-09-29T10%3A00%3A00.000Z&conversation_id=550e8400-e29b-41d4-a716-446655440000'
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('conversations');
    expect(from).toHaveBeenCalledWith('messages');
    expect(conversations.gte).toHaveBeenCalledWith(
      'updated_at',
      expect.any(String)
    );
    expect(messages.eq).toHaveBeenCalledWith(
      'conversation_id',
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(payload.conversations).toHaveLength(1);
    expect(payload.messages).toHaveLength(1);
    expect(payload.synced_at).toEqual(expect.any(String));
  });
});
