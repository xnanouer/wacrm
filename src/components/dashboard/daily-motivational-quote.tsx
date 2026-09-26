'use client';

import { useEffect, useState } from 'react';
import { Quote, Sparkles } from 'lucide-react';

import type { DailyMotivationalQuote } from '@/lib/motivational-quotes';

const categoryLabels: Record<DailyMotivationalQuote['category'], string> = {
  general: 'Inspiración',
  sales: 'Ventas',
  customer_service: 'Atención al cliente',
  leadership: 'Liderazgo',
};

interface DailyMotivationalQuoteCardProps {
  variant?: 'dashboard' | 'inbox';
}

export function DailyMotivationalQuoteCard({
  variant = 'dashboard',
}: DailyMotivationalQuoteCardProps) {
  const [quote, setQuote] = useState<DailyMotivationalQuote | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/motivational-quote', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          quote?: DailyMotivationalQuote | null;
        };
      })
      .then((payload) => {
        if (!cancelled) setQuote(payload?.quote ?? null);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <div
        className={
          variant === 'inbox'
            ? 'bg-muted/45 h-10 w-full animate-pulse rounded-xl'
            : 'bg-muted/45 mt-5 h-28 max-w-3xl animate-pulse rounded-[22px]'
        }
      />
    );
  }

  if (!quote) {
    if (variant === 'inbox') return null;
    return (
      <p className="text-muted-foreground mt-4 max-w-2xl text-[15px] leading-7 sm:text-base">
        Revisa el pulso de las conversaciones, las ventas y la atención al
        cliente para decidir qué necesita tu equipo ahora.
      </p>
    );
  }

  if (variant === 'inbox') {
    return (
      <figure className="border-primary/12 bg-primary/5 flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-1.5">
        <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0">
          <figcaption className="text-primary text-[9px] font-black tracking-[0.14em] uppercase">
            Inspiración del día
          </figcaption>
          <blockquote className="text-foreground truncate text-xs font-semibold sm:text-[13px]">
            “{quote.text}”
          </blockquote>
        </div>
      </figure>
    );
  }

  return (
    <figure className="border-primary/15 from-background/88 via-background/68 to-primary/8 relative mt-6 max-w-3xl overflow-hidden rounded-[22px] border bg-gradient-to-br px-5 py-4 shadow-[0_18px_48px_-40px_var(--primary)] backdrop-blur-sm sm:px-6 sm:py-5">
      <div className="bg-primary absolute top-0 bottom-0 left-0 w-1" />
      <Quote
        aria-hidden="true"
        className="text-primary/7 pointer-events-none absolute -right-2 -bottom-5 size-28 rotate-6"
        strokeWidth={1.4}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-primary flex items-center gap-2 text-[10px] font-black tracking-[0.16em] uppercase">
            <span className="bg-primary/12 flex size-7 items-center justify-center rounded-lg">
              <Sparkles className="size-3.5" />
            </span>
            Inspiración del día
          </div>
          <span className="border-primary/15 bg-primary/7 text-primary rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase">
            Nexora
          </span>
        </div>

        <blockquote className="text-foreground mt-3 max-w-2xl text-base leading-7 font-semibold tracking-[-0.015em] sm:text-[17px]">
          “{quote.text}”
        </blockquote>

        <figcaption className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
          {quote.author ? (
            <>
              <span className="text-foreground/75 font-semibold">
                {quote.author}
              </span>
              <span className="bg-border size-1 rounded-full" aria-hidden />
            </>
          ) : null}
          <span>{categoryLabels[quote.category]}</span>
          <span className="bg-border size-1 rounded-full" aria-hidden />
          <span>Una pausa para comenzar con propósito</span>
        </figcaption>
      </div>
    </figure>
  );
}
