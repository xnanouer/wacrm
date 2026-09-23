import { createHmac, timingSafeEqual } from 'crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';

const MERCADO_PAGO_API = 'https://api.mercadopago.com';

export interface MercadoPagoRuntimeSettings {
  environment: 'test' | 'production';
  accessToken: string;
  webhookSecret: string;
  enabled: boolean;
}

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'MercadoPagoError';
  }
}

export async function loadMercadoPagoSettings(options?: {
  requireEnabled?: boolean;
}): Promise<MercadoPagoRuntimeSettings> {
  const { data, error } = await supabaseAdmin()
    .from('platform_payment_settings')
    .select(
      'environment, encrypted_access_token, encrypted_webhook_secret, enabled'
    )
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.encrypted_access_token || !data.encrypted_webhook_secret) {
    throw new MercadoPagoError(
      'Mercado Pago todavía no está configurado en Plataforma Nexora.',
      503
    );
  }
  if (options?.requireEnabled && !data.enabled) {
    throw new MercadoPagoError(
      'Los pagos se encuentran desactivados temporalmente.',
      503
    );
  }

  return {
    environment: data.environment === 'production' ? 'production' : 'test',
    accessToken: decrypt(data.encrypted_access_token),
    webhookSecret: decrypt(data.encrypted_webhook_secret),
    enabled: data.enabled === true,
  };
}

export async function mercadoPagoRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) {
    throw new MercadoPagoError(
      'Mercado Pago rechazó la solicitud.',
      response.status >= 400 && response.status < 500 ? 400 : 502,
      payload
    );
  }
  return payload;
}

export async function validateMercadoPagoAccessToken(token: string) {
  return mercadoPagoRequest<{ id: number; email?: string; nickname?: string }>(
    token,
    '/users/me'
  );
}

function parseSignature(value: string) {
  const parts = Object.fromEntries(
    value.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    })
  );
  return { timestamp: parts.ts ?? '', signature: parts.v1 ?? '' };
}

export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  if (
    !input.xSignature ||
    !input.xRequestId ||
    !input.dataId ||
    !input.secret
  ) {
    return false;
  }
  const { timestamp, signature } = parseSignature(input.xSignature);
  if (!timestamp || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const dataId = /[a-z]/i.test(input.dataId)
    ? input.dataId.toLowerCase()
    : input.dataId;
  const manifest = `id:${dataId};request-id:${input.xRequestId};ts:${timestamp};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest();
  const received = Buffer.from(signature, 'hex');
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
