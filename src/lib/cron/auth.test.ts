import { afterEach, describe, expect, it } from 'vitest';

import { isAuthorizedCronRequest, isCronConfigured } from './auth';

const originalCronSecret = process.env.CRON_SECRET;
const originalAutomationSecret = process.env.AUTOMATION_CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  if (originalAutomationSecret === undefined)
    delete process.env.AUTOMATION_CRON_SECRET;
  else process.env.AUTOMATION_CRON_SECRET = originalAutomationSecret;
});

describe('cron request authorization', () => {
  it('rejects requests when no secret is configured', () => {
    delete process.env.CRON_SECRET;
    delete process.env.AUTOMATION_CRON_SECRET;

    expect(isCronConfigured()).toBe(false);
    expect(isAuthorizedCronRequest(new Request('https://example.com'))).toBe(
      false
    );
  });

  it('accepts the Vercel bearer secret', () => {
    process.env.CRON_SECRET = 'vercel-secret';
    process.env.AUTOMATION_CRON_SECRET = 'scheduler-secret';
    const request = new Request('https://example.com', {
      headers: { authorization: 'Bearer vercel-secret' },
    });

    expect(isCronConfigured()).toBe(true);
    expect(isAuthorizedCronRequest(request)).toBe(true);
  });

  it('accepts the self-hosted scheduler header', () => {
    process.env.CRON_SECRET = 'vercel-secret';
    process.env.AUTOMATION_CRON_SECRET = 'scheduler-secret';
    const request = new Request('https://example.com', {
      headers: { 'x-cron-secret': 'scheduler-secret' },
    });

    expect(isAuthorizedCronRequest(request)).toBe(true);
  });

  it('rejects incorrect and prefix-only credentials', () => {
    process.env.CRON_SECRET = 'correct-secret';
    delete process.env.AUTOMATION_CRON_SECRET;

    expect(
      isAuthorizedCronRequest(
        new Request('https://example.com', {
          headers: { authorization: 'Bearer correct' },
        })
      )
    ).toBe(false);
  });
});
