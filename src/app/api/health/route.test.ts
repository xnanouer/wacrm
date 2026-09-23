import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const baseline = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  ENCRYPTION_KEY: '0'.repeat(64),
};

const production = {
  NEXT_PUBLIC_SITE_URL: 'https://crm.example.test',
  WHATSAPP_WEB_BRIDGE_SECRET: '1'.repeat(64),
  AUTOMATION_CRON_SECRET: '2'.repeat(64),
  CRON_SECRET: '3'.repeat(64),
  PLATFORM_OWNER_EMAILS: 'owner@example.test',
};

function stub(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/health', () => {
  it('reports a fully configured production process as healthy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    stub({ ...baseline, ...production });

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('rejects production when an operational secret is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    stub({ ...baseline, ...production, CRON_SECRET: '' });

    const response = GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 'misconfigured',
      configuration: 'incomplete',
    });
  });

  it('keeps local development limited to the baseline configuration', () => {
    vi.stubEnv('NODE_ENV', 'development');
    stub(baseline);
    stub(Object.fromEntries(Object.keys(production).map((name) => [name, ''])));

    expect(GET().status).toBe(200);
  });
});
