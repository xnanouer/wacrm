interface IncomingNotificationIdentity {
  conversationId: string;
  occurredAt?: string | null;
  fallbackId?: string | null;
}

export function incomingNotificationKey(
  identity: IncomingNotificationIdentity
): string | null {
  const { conversationId, occurredAt, fallbackId } = identity;
  if (!conversationId) return null;

  if (occurredAt) {
    const timestamp = new Date(occurredAt);
    if (!Number.isNaN(timestamp.getTime())) {
      return `${conversationId}:${timestamp.toISOString()}`;
    }
  }

  return fallbackId ? `${conversationId}:id:${fallbackId}` : null;
}

export function rememberIncomingNotification(
  seen: Set<string>,
  key: string | null,
  maxEntries = 250
): boolean {
  if (!key || seen.has(key)) return false;
  seen.add(key);

  while (seen.size > maxEntries) {
    const oldest = seen.values().next().value;
    if (!oldest) break;
    seen.delete(oldest);
  }
  return true;
}
