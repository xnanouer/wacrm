import { cn } from '@/lib/utils';
import {
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from '@/lib/quotes/types';

const STATUS_STYLES: Record<QuotationStatus, string> = {
  draft: 'border-slate-400/30 bg-slate-500/10 text-slate-500',
  generated: 'border-violet-500/30 bg-violet-500/10 text-violet-500',
  sent: 'border-sky-500/30 bg-sky-500/10 text-sky-500',
  negotiating: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  financing_pending: 'border-orange-500/30 bg-orange-500/10 text-orange-600',
  accepted: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-600',
  expired: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-500',
  contract_completed: 'border-teal-500/30 bg-teal-500/10 text-teal-600',
  cancelled: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
};

export function QuotationStatusBadge({
  status,
  className,
}: {
  status: QuotationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        STATUS_STYLES[status],
        className
      )}
    >
      {QUOTATION_STATUS_LABELS[status]}
    </span>
  );
}
