'use client';

import { ClockAlert, Sparkles } from 'lucide-react';

import { DailyMotivationalQuoteCard } from '@/components/dashboard/daily-motivational-quote';
import { useAuth } from '@/hooks/use-auth';
import { getChileGreeting } from '@/lib/time/greeting';

interface InboxBriefingProps {
  priorityCount: number;
}

export function InboxBriefing({ priorityCount }: InboxBriefingProps) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <section className="border-border/60 bg-background/92 flex shrink-0 flex-col gap-3 border-b px-4 py-3 backdrop-blur-xl lg:flex-row lg:items-center lg:px-6">
      <div className="min-w-0 lg:w-64 lg:shrink-0">
        <p className="text-muted-foreground text-[10px] font-black tracking-[0.14em] uppercase">
          Tu jornada en Nexora
        </p>
        <h1 className="text-foreground mt-0.5 truncate text-lg font-bold tracking-[-0.025em]">
          {getChileGreeting()}
          {firstName ? `, ${firstName}` : ''}.
        </h1>
      </div>

      <div className="min-w-0 flex-1">
        <DailyMotivationalQuoteCard variant="inbox" />
      </div>

      {priorityCount > 0 ? (
        <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 lg:max-w-72">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <ClockAlert className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] font-black tracking-[0.12em] text-amber-700 uppercase dark:text-amber-300">
              Atención prioritaria
            </span>
            <span className="text-foreground block text-xs leading-4 font-semibold">
              {priorityCount}{' '}
              {priorityCount === 1 ? 'chat lleva' : 'chats llevan'} más de 10
              min sin respuesta
            </span>
          </span>
        </div>
      ) : (
        <div className="text-muted-foreground hidden shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs lg:flex">
          <Sparkles className="text-primary size-4" />
          Todo al día
        </div>
      )}
    </section>
  );
}
