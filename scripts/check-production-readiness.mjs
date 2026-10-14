import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

// Next.js loads `.env` automatically, but a standalone Node script does not.
// Load it for local/server checks without overriding variables supplied by the
// deployment platform.
if (existsSync('.env')) loadEnvFile('.env');

const errors = [];
const warnings = [];

const value = (name) => process.env[name]?.trim() ?? '';
function requireValue(name) {
  const current = value(name);
  if (!current) errors.push(`${name} is missing`);
  return current;
}

const supabaseUrl = requireValue('NEXT_PUBLIC_SUPABASE_URL');
requireValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
requireValue('SUPABASE_SERVICE_ROLE_KEY');
const encryptionKey = requireValue('ENCRYPTION_KEY');
const bridgeSecret = requireValue('WHATSAPP_WEB_BRIDGE_SECRET');
const automationSecret = requireValue('AUTOMATION_CRON_SECRET');
const cronSecret = requireValue('CRON_SECRET');
const siteUrl = requireValue('NEXT_PUBLIC_SITE_URL');
requireValue('PLATFORM_OWNER_EMAILS');

if (encryptionKey && !/^[a-f\d]{64}$/i.test(encryptionKey))
  errors.push('ENCRYPTION_KEY must contain exactly 64 hexadecimal characters');
for (const [name, secret] of [
  ['WHATSAPP_WEB_BRIDGE_SECRET', bridgeSecret],
  ['AUTOMATION_CRON_SECRET', automationSecret],
  ['CRON_SECRET', cronSecret],
]) {
  if (secret && secret.length < 32)
    errors.push(`${name} must contain at least 32 characters`);
}
if (bridgeSecret && encryptionKey && bridgeSecret === encryptionKey)
  errors.push('WHATSAPP_WEB_BRIDGE_SECRET must differ from ENCRYPTION_KEY');

for (const [name, raw] of [
  ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
  ['NEXT_PUBLIC_SITE_URL', siteUrl],
]) {
  if (!raw) continue;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') errors.push(`${name} must use HTTPS`);
    if (parsed.hostname.endsWith('example.com'))
      errors.push(`${name} still uses an example hostname`);
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))
      errors.push(`${name} must use the public production hostname`);
  } catch {
    errors.push(`${name} must be a valid absolute URL`);
  }
}

if (!existsSync('supabase/migrations/094_ai_catalog_delivery_mode.sql'))
  errors.push(
    'latest expected migration 094_ai_catalog_delivery_mode.sql is missing'
  );

const expectedCrons = new Set([
  '/api/automations/cron',
  '/api/flows/cron',
  '/api/ai/follow-up/cron',
  '/api/quotes/retention',
  '/api/platform/storage/monitor',
]);
try {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const configured = new Set((config.crons ?? []).map((cron) => cron.path));
  for (const path of expectedCrons) {
    if (!configured.has(path))
      errors.push(`vercel.json is missing cron ${path}`);
  }
} catch (error) {
  errors.push(`vercel.json is invalid: ${error.message}`);
}

for (const name of [
  'META_APP_ID',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
]) {
  if (!value(name))
    warnings.push(`${name} is not set; its integration will be unavailable`);
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(
    `\nProduction readiness failed with ${errors.length} error(s).`
  );
  process.exit(1);
}
console.log('Production environment and repository configuration look ready.');
