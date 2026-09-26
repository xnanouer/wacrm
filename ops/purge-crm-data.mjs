import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountName = process.argv[2];
const execute = process.argv.includes('--execute');

if (!supabaseUrl || !serviceRoleKey || !accountName) {
  console.error(
    'Usage: node ops/purge-crm-data.mjs <exact-account-name> [--execute]'
  );
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data: account, error: accountError } = await db
  .from('accounts')
  .select('id, name')
  .eq('name', accountName)
  .single();
if (accountError || !account)
  throw accountError ?? new Error('Account missing');

async function selectRows(table, configure = (query) => query) {
  const { data, error } = await configure(db.from(table).select('*'));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

const contacts = await selectRows('contacts', (query) =>
  query.eq('account_id', account.id)
);
const conversations = await selectRows('conversations', (query) =>
  query.eq('account_id', account.id)
);
const contactIds = contacts.map((row) => row.id);
const conversationIds = conversations.map((row) => row.id);

const byAccount = [
  'catalog_share_batches',
  'catalog_item_shares',
  'contact_catalog_interests',
  'contact_channel_identities',
  'conversation_lead_profiles',
  'ticket_events',
  'ticket_notes',
  'automation_ticket_event_queue',
  'quotations',
  'quotation_installment_options',
  'quotation_versions',
  'quotation_sends',
  'quotation_events',
];

const backup = {
  created_at: new Date().toISOString(),
  account,
  contacts,
  conversations,
  messages:
    conversationIds.length > 0
      ? await selectRows('messages', (query) =>
          query.in('conversation_id', conversationIds)
        )
      : [],
  contact_tags:
    contactIds.length > 0
      ? await selectRows('contact_tags', (query) =>
          query.in('contact_id', contactIds)
        )
      : [],
  contact_custom_values:
    contactIds.length > 0
      ? await selectRows('contact_custom_values', (query) =>
          query.in('contact_id', contactIds)
        )
      : [],
  contact_notes:
    contactIds.length > 0
      ? await selectRows('contact_notes', (query) =>
          query.in('contact_id', contactIds)
        )
      : [],
  message_reactions:
    conversationIds.length > 0
      ? await selectRows('message_reactions', (query) =>
          query.in('conversation_id', conversationIds)
        )
      : [],
  related: {},
};

for (const table of byAccount) {
  backup.related[table] = await selectRows(table, (query) =>
    query.eq('account_id', account.id)
  );
}

const serialized = `${JSON.stringify(backup, null, 2)}\n`;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath =
  process.env.NEXORA_CRM_BACKUP_PATH || `/tmp/nexora-crm-backup-${stamp}.json`;
writeFileSync(backupPath, serialized, { encoding: 'utf8', mode: 0o600 });
const sha256 = createHash('sha256').update(serialized).digest('hex');
console.log(
  JSON.stringify({
    backupPath,
    sha256,
    contacts: contacts.length,
    conversations: conversations.length,
    messages: backup.messages.length,
    catalogShares: backup.related.catalog_share_batches.length,
    quotations: backup.related.quotations.length,
    execute,
  })
);

if (!execute) process.exit(0);

async function deleteByAccount(table) {
  const { error } = await db.from(table).delete().eq('account_id', account.id);
  if (error) throw new Error(`${table}: ${error.message}`);
}

// These audit artifacts RESTRICT deletion of their linked contacts and
// conversations. Their child rows cascade from the parent deletion.
await deleteByAccount('quotation_sends');
await deleteByAccount('quotations');
await deleteByAccount('catalog_share_batches');
await deleteByAccount('conversations');
await deleteByAccount('contacts');

const [remainingContacts, remainingConversations] = await Promise.all([
  db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id),
  db
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', account.id),
]);
if (remainingContacts.error) throw remainingContacts.error;
if (remainingConversations.error) throw remainingConversations.error;

console.log(
  JSON.stringify({
    deleted: true,
    remainingContacts: remainingContacts.count ?? 0,
    remainingConversations: remainingConversations.count ?? 0,
  })
);
