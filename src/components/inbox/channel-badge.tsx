import { Camera, MessageCircle, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getChannelMeta } from '@/lib/channels/channel-meta';
import type { ConversationChannel } from '@/types';

interface ChannelBadgeProps {
  channel?: ConversationChannel | string | null;
  compact?: boolean;
  className?: string;
}

const ICONS = {
  message: MessageCircle,
  messages: MessagesSquare,
  camera: Camera,
} as const;

export function ChannelBadge({
  channel,
  compact = false,
  className,
}: ChannelBadgeProps) {
  const meta = getChannelMeta(channel);
  const Icon = ICONS[meta.icon];

  return (
    <span
      aria-label={`Canal: ${meta.label}`}
      title={meta.label}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        meta.badgeClass,
        className
      )}
    >
      <Icon className="size-2.5" aria-hidden="true" />
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}
