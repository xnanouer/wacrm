import { timingSafeEqual } from 'node:crypto';

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function isCronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET || process.env.AUTOMATION_CRON_SECRET);
}

/**
 * Accepts Vercel Cron's `Authorization: Bearer <CRON_SECRET>` header and the
 * legacy `x-cron-secret` header used by self-hosted schedulers.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const bearerSecret =
    process.env.CRON_SECRET ?? process.env.AUTOMATION_CRON_SECRET ?? '';
  const legacySecret =
    process.env.AUTOMATION_CRON_SECRET ?? process.env.CRON_SECRET ?? '';

  if (!bearerSecret && !legacySecret) return false;

  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  const legacy = request.headers.get('x-cron-secret') ?? '';

  return (
    (Boolean(bearerSecret) && safeEqual(bearer, bearerSecret)) ||
    (Boolean(legacySecret) && safeEqual(legacy, legacySecret))
  );
}
