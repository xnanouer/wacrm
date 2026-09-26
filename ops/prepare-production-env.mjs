import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , inputPath, outputPath, domain, release = 'unknown'] = process.argv;

if (!inputPath || !outputPath || !domain) {
  throw new Error(
    'Usage: node ops/prepare-production-env.mjs <input> <output> <domain> [release]'
  );
}

if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
  throw new Error('The production domain is invalid.');
}

const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/);

function indexesFor(name) {
  const prefix = `${name}=`;
  return lines.flatMap((line, index) =>
    line.trimStart().startsWith(prefix) ? [index] : []
  );
}

function currentValue(name) {
  const [index] = indexesFor(name);
  if (index === undefined) return '';
  const separator = lines[index].indexOf('=');
  return lines[index].slice(separator + 1).trim();
}

function setValue(name, value) {
  const indexes = indexesFor(name);
  if (indexes.length === 0) {
    if (lines.at(-1) !== '') lines.push('');
    lines.push(`${name}=${value}`);
    return;
  }

  lines[indexes[0]] = `${name}=${value}`;
  for (const duplicate of indexes.slice(1).reverse())
    lines.splice(duplicate, 1);
}

function removeValue(name) {
  for (const index of indexesFor(name).reverse()) lines.splice(index, 1);
}

function isPlaceholder(value) {
  return (
    !value ||
    /(^|[-_])(your|example|generate)([-_]|$)/i.test(value) ||
    value.includes('example.com')
  );
}

function ensureRandomSecret(name) {
  if (isPlaceholder(currentValue(name))) {
    setValue(name, randomBytes(32).toString('hex'));
  }
}

setValue('NODE_ENV', 'production');
setValue('SITE_DOMAIN', domain);
setValue('NEXT_PUBLIC_SITE_URL', `https://${domain}`);
setValue('ALLOWED_INVITE_HOSTS', `${domain},www.${domain}`);
setValue('NEXT_PUBLIC_APP_VERSION', release);

ensureRandomSecret('WHATSAPP_WEB_BRIDGE_SECRET');
ensureRandomSecret('AUTOMATION_CRON_SECRET');
ensureRandomSecret('CRON_SECRET');
ensureRandomSecret('META_WEBHOOK_VERIFY_TOKEN');

// A dry-run template provider must never leak from local development into
// production. Real Meta credentials can be added after the first deployment.
removeValue('WHATSAPP_TEMPLATES_DRY_RUN');

await writeFile(outputPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
await chmod(outputPath, 0o600).catch(() => undefined);

console.log(
  `Prepared ${path.basename(outputPath)} for ${domain} without printing secrets.`
);
