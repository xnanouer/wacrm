interface LinkedDeviceOutboundInput {
  assignedAgentId: string | null | undefined;
  contentType: string;
  text: string;
  receivedAt: string;
  unreadCount: number | null | undefined;
  updatedAt: string;
}

/**
 * A message synchronized from the connected WhatsApp device is not proof that
 * a Nexora executive accepted the lead. WhatsApp Business can emit automatic
 * greeting/away messages through the same `fromMe` channel as a manual device
 * reply, so ownership must only come from an explicit Nexora takeover.
 */
export function linkedDeviceOutboundState(input: LinkedDeviceOutboundInput) {
  return {
    senderId: input.assignedAgentId ?? null,
    conversationPatch: {
      last_message_text: input.text || `[${input.contentType}]`,
      last_message_at: input.receivedAt,
      unread_count: input.unreadCount ?? 0,
      updated_at: input.updatedAt,
    },
  };
}
