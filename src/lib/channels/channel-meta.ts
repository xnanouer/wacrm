import type { ConversationChannel } from '@/types';

export interface ChannelMeta {
  value: ConversationChannel;
  label: string;
  shortLabel: string;
  icon: 'message' | 'messages' | 'camera';
  badgeClass: string;
}

export const CHANNEL_OPTIONS: readonly ChannelMeta[] = [
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    shortLabel: 'WA',
    icon: 'message',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  {
    value: 'facebook',
    label: 'Facebook',
    shortLabel: 'FB',
    icon: 'messages',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  },
  {
    value: 'instagram',
    label: 'Instagram',
    shortLabel: 'IG',
    icon: 'camera',
    badgeClass: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400',
  },
] as const;

export function resolveConversationChannel(
  channel: ConversationChannel | string | null | undefined
): ConversationChannel {
  return CHANNEL_OPTIONS.some((option) => option.value === channel)
    ? (channel as ConversationChannel)
    : 'whatsapp';
}

export function getChannelMeta(
  channel: ConversationChannel | string | null | undefined
): ChannelMeta {
  const resolved = resolveConversationChannel(channel);
  return CHANNEL_OPTIONS.find((option) => option.value === resolved)!;
}
