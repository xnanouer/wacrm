import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('CRM audit requires the Supabase server environment.');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const { data: accounts, error } = await db
  .from('accounts')
  .select('id, name')
  .order('created_at', { ascending: true });
if (error) throw error;

async function count(table, accountId) {
  const { count: value, error: countError } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  if (countError) {
    if (countError.code === '42P01') return null;
    throw countError;
  }
  return value ?? 0;
}

for (const [index, account] of (accounts ?? []).entries()) {
  const [contacts, conversations, catalogShares, quotations, contracts] =
    await Promise.all([
      count('contacts', account.id),
      count('conversations', account.id),
      count('catalog_share_batches', account.id),
      count('quotations', account.id),
      count('contracts', account.id),
    ]);
  console.log(
    JSON.stringify({
      account: index + 1,
      name: account.name,
      contacts,
      conversations,
      catalogShares,
      quotations,
      contracts,
    })
  );
}
