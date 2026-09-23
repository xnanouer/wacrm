import 'server-only';

import { timingSafeEqual } from 'node:crypto';

export function getWhatsAppBridgeSecret(): string {
  const secret =
    process.env.WHATSAPP_WEB_BRIDGE_SECRET ||
    (process.env.NODE_ENV !== 'production'
      ? process.env.ENCRYPTION_KEY
      : undefined);

  if (!secret) {
    throw new Error(
      'WHATSAPP_WEB_BRIDGE_SECRET is required and must be independent in production.'
    );
  }
  return secret;
}

export function isWhatsAppBridgeRequestAuthorized(request: Request): boolean {
  let expected: string;
  try {
    expected = getWhatsAppBridgeSecret();
  } catch {
    return false;
  }

  const actual = request.headers.get('x-nexora-bridge-secret') || '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}
