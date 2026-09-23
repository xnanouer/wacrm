'use client';

import Link from 'next/link';
import { ArrowUpRight, UserPlus, Briefcase, Radio, Zap } from 'lucide-react';
import type { ComponentType } from 'react';

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tint: string;
  description: string;
}

const ACTIONS: Action[] = [
  {
    label: 'Nuevo contacto',
    description: 'Agrega una persona',
    href: '/contacts',
    icon: UserPlus,
    tint: 'bg-violet-500/12 text-violet-400',
  },
  {
    label: 'Nueva oportunidad',
    description: 'Inicia una negociación',
    href: '/pipelines',
    icon: Briefcase,
    tint: 'bg-sky-500/12 text-sky-400',
  },
  {
    label: 'Nueva campaña',
    description: 'Comunica a tu audiencia',
    href: '/broadcasts/new',
    icon: Radio,
    tint: 'bg-amber-500/12 text-amber-400',
  },
  {
    label: 'Nueva automatización',
    description: 'Ahorra trabajo repetitivo',
    href: '/automations/new',
    icon: Zap,
    tint: 'bg-emerald-500/12 text-emerald-400',
  },
];

export function QuickActions() {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-foreground text-lg font-semibold tracking-[-0.02em]">
            Acciones rápidas
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Empieza una tarea sin perder el contexto.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="surface-elevated group hover:border-primary/20 hover:bg-card-2 flex min-h-24 items-center gap-4 rounded-3xl px-5 py-4 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${a.tint}`}
              >
                <Icon className="size-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-foreground block truncate text-[15px] font-semibold">
                  {a.label}
                </span>
                <span className="text-muted-foreground mt-1 block truncate text-sm">
                  {a.description}
                </span>
              </div>
              <ArrowUpRight className="text-muted-foreground/60 group-hover:text-primary size-4 shrink-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
