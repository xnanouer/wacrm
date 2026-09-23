import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import { verifyMercadoPagoWebhookSignature } from './mercado-pago';

describe('verifyMercadoPagoWebhookSignature', () => {
  it('accepts an authentic Mercado Pago manifest', () => {
    const secret = 'test-secret';
    const dataId = 'ABC-123';
    const requestId = 'request-9';
    const timestamp = '1704908010';
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
    const signature = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    expect(
      verifyMercadoPagoWebhookSignature({
        xSignature: `ts=${timestamp},v1=${signature}`,
        xRequestId: requestId,
        dataId,
        secret,
      })
    ).toBe(true);
  });

  it('rejects missing and tampered signatures', () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        xSignature: null,
        xRequestId: 'request',
        dataId: '1',
        secret: 'secret',
      })
    ).toBe(false);
    expect(
      verifyMercadoPagoWebhookSignature({
        xSignature: `ts=1,v1=${'0'.repeat(64)}`,
        xRequestId: 'request',
        dataId: '1',
        secret: 'secret',
      })
    ).toBe(false);
  });
});
