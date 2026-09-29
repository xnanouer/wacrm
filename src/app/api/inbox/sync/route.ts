import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  CONVERSATION_SELECT,
  normalizeConversations,
} from '@/lib/inbox/conversations';

const DEFAULT_LOOKBACK_MS = 30_000;
const MAX_LOOKBACK_MS = 5 * 60_000;
const MAX_DELTA_ROWS = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

function boundedSince(value: string | null, now: number): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  const fallback = now - DEFAULT_LOOKBACK_MS;
  const requested = Number.isNaN(parsed) ? fallback : parsed;
  return new Date(Math.max(requested, now - MAX_LOOKBACK_MS)).toISOString();
}

/**
 * Incremental recovery path for inbox clients. Realtime remains the fast path;
 * this endpoint fills any gaps caused by a browser/proxy WebSocket failure.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return noStoreJson({ error: 'No autorizado' }, 401);
  }

  const now = Date.now();
  const url = new URL(request.url);
  const since = boundedSince(url.searchParams.get('since'), now);
  const requestedConversationId = url.searchParams.get('conversation_id');
  const conversationId =
    requestedConversationId && UUID_PATTERN.test(requestedConversationId)
      ? requestedConversationId
      : null;

  const conversationsQuery = supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .gte('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(MAX_DELTA_ROWS);

  const messagesQuery = conversationId
    ? supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(MAX_DELTA_ROWS)
    : Promise.resolve({ data: [], error: null });

  const [conversationsResult, messagesResult] = await Promise.all([
    conversationsQuery,
    messagesQuery,
  ]);

  if (conversationsResult.error || messagesResult.error) {
    console.error('[inbox/sync] Failed to load incremental updates:', {
      conversations: conversationsResult.error?.message ?? null,
      messages: messagesResult.error?.message ?? null,
    });
    return noStoreJson({ error: 'No se pudo sincronizar la bandeja' }, 500);
  }

  return noStoreJson({
    synced_at: new Date(now).toISOString(),
    conversations: normalizeConversations(conversationsResult.data ?? []),
    messages: messagesResult.data ?? [],
  });
}
