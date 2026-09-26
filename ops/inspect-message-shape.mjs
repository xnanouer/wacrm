import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const conversationId = process.argv[2];

if (!supabaseUrl || !serviceRoleKey || !conversationId) {
  console.error(
    'Usage: node ops/inspect-message-shape.mjs <conversation-id> (with Supabase server env loaded).'
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data, error } = await db
  .from('messages')
  .select(
    'sender_type, content_type, content_text, media_url, status, created_at, message_id'
  )
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: true })
  .limit(200);

if (error) {
  console.error(`Message audit database error: ${error.message}`);
  process.exit(1);
}

const rows = (data ?? []).map((message) => ({
  createdAt: message.created_at,
  sender: message.sender_type,
  type: message.content_type,
  textLength:
    typeof message.content_text === 'string' ? message.content_text.length : 0,
  hasMedia: Boolean(message.media_url),
  hasExternalId: Boolean(message.message_id),
  status: message.status,
}));

console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
