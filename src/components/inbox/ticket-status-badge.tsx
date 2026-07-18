import type { ConversationStatus } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, CircleDot, Clock3, PauseCircle } from 'lucide-react';

const STATUS_META = {
  open: {
    label: 'Abierto',
    icon: CircleDot,
    className:
      'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  pending: {
    label: 'Pendiente',
    icon: Clock3,
    className:
      'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  waiting: {
    label: 'Esperando',
    icon: PauseCircle,
    className: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  closed: {
    label: 'Cerrado',
    icon: CheckCircle2,
    className: 'border-border bg-muted text-muted-foreground',
  },
} satisfies Record<
  ConversationStatus,
  { label: string; icon: typeof CircleDot; className: string }
>;

export function ticketStatusLabel(status: ConversationStatus) {
  return STATUS_META[status].label;
}

export function TicketStatusBadge({
  status,
  compact = false,
  className,
}: {
  status: ConversationStatus;
  compact?: boolean;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-medium',
        compact
          ? 'gap-1 px-1.5 py-0.5 text-[10px]'
          : 'gap-1.5 px-2 py-1 text-xs',
        meta.className,
        className
      )}
    >
      <Icon className={compact ? 'size-2.5' : 'size-3'} />
      {meta.label}
    </span>
  );
}
