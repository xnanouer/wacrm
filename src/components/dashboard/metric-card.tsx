import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number;
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string;
  };
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string;
  tone?: 'violet' | 'sky' | 'emerald' | 'amber';
}

const TONES = {
  violet: 'bg-violet-500/12 text-violet-400 ring-violet-500/15',
  sky: 'bg-sky-500/12 text-sky-400 ring-sky-500/15',
  emerald: 'bg-emerald-500/12 text-emerald-400 ring-emerald-500/15',
  amber: 'bg-amber-500/12 text-amber-400 ring-amber-500/15',
} as const;

export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  subtitle,
  tone = 'violet',
}: MetricCardProps) {
  return (
    <div className="surface-elevated group hover:border-primary/20 relative min-h-44 overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5">
      <div className="bg-primary/5 group-hover:bg-primary/10 pointer-events-none absolute -top-16 -right-12 size-32 rounded-full blur-3xl transition-colors" />
      <div className="flex items-start justify-between">
        <p className="text-muted-foreground relative text-sm font-semibold">
          {title}
        </p>
        <div
          className={cn(
            'relative flex size-11 items-center justify-center rounded-2xl ring-1',
            TONES[tone]
          )}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>
      <p className="text-foreground relative mt-6 text-[clamp(1.9rem,3vw,2.35rem)] leading-none font-bold tracking-[-0.045em] tabular-nums">
        {value}
      </p>
      {delta ? (
        <DeltaRow sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <p className="text-muted-foreground mt-3 text-[15px] leading-6">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-primary'
      : sign < 0
        ? 'text-red-400'
        : 'text-muted-foreground';
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus;
  return (
    <div className={cn('mt-3 flex items-center gap-1.5 text-sm', tone)}>
      <Arrow className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
