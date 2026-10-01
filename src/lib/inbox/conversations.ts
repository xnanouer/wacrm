import type { Conversation, Contact, Tag } from '@/types';

/**
 * Conversation select that embeds the contact plus its tags, so the Inbox
 * can filter conversations by contact tag without a second round-trip.
 * `contact_tags(tags(*))` returns the join rows; {@link normalizeConversation}
 * flattens them onto `contact.tags`.
 */
export const CONVERSATION_SELECT =
  '*, contact:contacts!conversations_contact_id_fkey(*, contact_tags(tags(*))), department:departments!conversations_department_account_fkey(*), whatsapp_config:whatsapp_config!conversations_whatsapp_account_fkey(id, provider, connection_name, phone_number_id, display_name, display_phone), channel_connection:channel_connections!conversations_channel_connection_account_fkey(id, channel, display_name, status, metadata)';

/**
 * Meta Cloud API only permits free-form WhatsApp replies inside the
 * 24-hour customer-care window. A linked-device QR session is not governed
 * by that composer restriction.
 *
 * Missing provider values are treated as Cloud API for legacy payloads so
 * we never accidentally bypass Meta's restriction while older data loads.
 */
export function requiresWhatsAppCustomerCareWindow(
  conversation: Conversation
): boolean {
  const channel = conversation.channel ?? 'whatsapp';
  return (
    channel === 'whatsapp' &&
    conversation.whatsapp_config?.provider !== 'whatsapp_web'
  );
}

/** Raw shape returned by {@link CONVERSATION_SELECT} before flattening. */
type RawContact = Contact & { contact_tags?: { tags: Tag | null }[] };
type RawConversation = Omit<Conversation, 'contact'> & {
  contact?: RawContact | null;
};

/**
 * Flatten the embedded `contact_tags(tags(*))` join into `contact.tags`.
 * Safe to call on rows fetched with {@link CONVERSATION_SELECT}; a row with
 * no contact (e.g. a freshly-inserted conversation) passes through untouched.
 */
export function normalizeConversation(raw: RawConversation): Conversation {
  const rawContact = raw.contact;
  if (!rawContact) return raw as Conversation;

  const { contact_tags, ...contact } = rawContact;
  return {
    ...raw,
    contact: {
      ...contact,
      tags: (contact_tags ?? [])
        .map((ct) => ct.tags)
        .filter((t): t is Tag => t != null),
    },
  };
}

export function normalizeConversations(
  rows: RawConversation[]
): Conversation[] {
  return rows.map(normalizeConversation);
}

/**
 * Keep the inbox ordered by its most recent activity after a realtime patch.
 * The initial database query already uses this order, but an UPDATE received
 * over Realtime only patches the existing array in memory. Without sorting
 * again, an older conversation that receives a new message stays buried in
 * its previous position until the whole page is reloaded.
 */
export function sortConversationsByLastMessage(
  conversations: Conversation[]
): Conversation[] {
  return [...conversations].sort((left, right) => {
    const leftTime = Date.parse(left.last_message_at ?? left.created_at);
    const rightTime = Date.parse(right.last_message_at ?? right.created_at);
    const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;
    return safeRightTime - safeLeftTime;
  });
}

export interface ContactFilters {
  /** Tag ids; a conversation matches if its contact has ANY of them (OR). */
  tagIds: string[];
  /** Exact company match, or null for no company filter. */
  company: string | null;
}

/**
 * Whether a conversation passes the contact-based Inbox filters (issue #272).
 * Empty `tagIds` and null `company` are no-ops, so the default (no filters)
 * always matches. Tags use OR logic, consistent with Broadcast audiences.
 */
export function matchesContactFilters(
  conversation: Conversation,
  { tagIds, company }: ContactFilters
): boolean {
  if (tagIds.length > 0) {
    const contactTagIds = conversation.contact?.tags ?? [];
    if (!contactTagIds.some((t) => tagIds.includes(t.id))) return false;
  }

  if (company !== null && conversation.contact?.company?.trim() !== company) {
    return false;
  }

  return true;
}
