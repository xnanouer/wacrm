import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bridgeSecret = process.env.WHATSAPP_WEB_BRIDGE_SECRET;

if (!supabaseUrl || !serviceRoleKey || !bridgeSecret) {
  console.error(
    'QR audit cannot run because a required server secret is missing.'
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data, error } = await db
  .from('whatsapp_config')
  .select('id, account_id, status')
  .eq('provider', 'whatsapp_web');

if (error) {
  console.error(`QR audit database error: ${error.message}`);
  process.exit(1);
}

const connections = data ?? [];
console.log(`connections=${connections.length}`);
for (const [index, connection] of connections.entries()) {
  try {
    const response = await fetch(
      `http://127.0.0.1:3001/sessions/${encodeURIComponent(connection.account_id)}/${encodeURIComponent(connection.id)}`,
      { headers: { 'x-nexora-bridge-secret': bridgeSecret } }
    );
    const session = await response.json();
    console.log(
      `connection-${index + 1} database=${connection.status} worker=${session.status ?? 'unknown'} qr=${Boolean(session.qrDataUrl)}${session.lastError ? ` error=${session.lastError}` : ''}`
    );
  } catch {
    console.log(
      `connection-${index + 1} database=${connection.status} worker=unreachable qr=false`
    );
  }
}
