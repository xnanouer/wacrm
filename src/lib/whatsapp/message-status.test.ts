import { describe, expect, it } from 'vitest';
import {
  canAdvanceMessageStatus,
  whatsappWebAckToStatus,
} from './message-status';

describe('WhatsApp QR delivery statuses', () => {
  it.each([
    [-1, 'failed'],
    [0, 'sent'],
    [1, 'sent'],
    [2, 'delivered'],
    [3, 'read'],
    [4, 'read'],
    [99, null],
  ])('maps ACK %s to %s', (ack, expected) => {
    expect(whatsappWebAckToStatus(ack)).toBe(expected);
  });

  it('allows forward delivery progress', () => {
    expect(canAdvanceMessageStatus('sent', 'delivered')).toBe(true);
    expect(canAdvanceMessageStatus('delivered', 'read')).toBe(true);
  });

  it('rejects duplicated or regressive receipts', () => {
    expect(canAdvanceMessageStatus('read', 'delivered')).toBe(false);
    expect(canAdvanceMessageStatus('delivered', 'delivered')).toBe(false);
  });

  it('only accepts failure before delivery', () => {
    expect(canAdvanceMessageStatus('sent', 'failed')).toBe(true);
    expect(canAdvanceMessageStatus('delivered', 'failed')).toBe(false);
  });
});
