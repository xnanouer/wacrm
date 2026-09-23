import type { MessageStatus } from '@/types';

const STATUS_LEVEL: Partial<Record<MessageStatus, number>> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Translate whatsapp-web.js MessageAck values into CRM statuses. */
export function whatsappWebAckToStatus(ack: number): MessageStatus | null {
  if (ack === -1) return 'failed';
  if (ack === 0 || ack === 1) return 'sent';
  if (ack === 2) return 'delivered';
  if (ack === 3 || ack === 4) return 'read';
  return null;
}

/** Delivery receipts are forward-only; delayed events must not regress UI. */
export function canAdvanceMessageStatus(
  current: MessageStatus,
  incoming: MessageStatus
): boolean {
  if (current === incoming) return false;
  if (current === 'failed') return false;
  if (incoming === 'failed') {
    return current === 'sending' || current === 'sent';
  }

  const currentLevel = STATUS_LEVEL[current] ?? -1;
  const incomingLevel = STATUS_LEVEL[incoming] ?? -1;
  return incomingLevel > currentLevel;
}
