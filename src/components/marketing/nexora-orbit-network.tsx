import type { CSSProperties } from 'react';
import {
  Bot,
  BrainCircuit,
  CarFront,
  ContactRound,
  FileText,
  GitBranch,
  MessageSquareText,
  Sparkles,
  Workflow,
} from 'lucide-react';

import {
  FacebookMark,
  InstagramMark,
  WhatsAppMark,
} from '@/components/marketing/hero-brain-network';
import { cn } from '@/lib/utils';

import styles from './nexora-orbit-network.module.css';

const nodes = [
  {
    label: 'WhatsApp',
    detail: 'Conversaciones',
    icon: WhatsAppMark,
    position: 'top-[7%] left-[7%]',
    color: '#10b981',
    tone: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
  },
  {
    label: 'Instagram',
    detail: 'Mensajes',
    icon: InstagramMark,
    position: 'top-[4%] right-[8%]',
    color: '#ec4899',
    tone: 'border-pink-400/30 bg-pink-400/10 text-pink-400',
  },
  {
    label: 'Facebook',
    detail: 'Consultas',
    icon: FacebookMark,
    position: 'top-[37%] right-[-1%]',
    color: '#3b82f6',
    tone: 'border-blue-400/30 bg-blue-400/10 text-blue-400',
  },
  {
    label: 'Bandeja',
    detail: 'Equipo conectado',
    icon: MessageSquareText,
    position: 'top-[38%] left-[-2%]',
    color: '#8b5cf6',
    tone: 'border-violet-400/30 bg-violet-400/10 text-violet-400',
  },
  {
    label: 'Catálogo',
    detail: 'Inventario activo',
    icon: CarFront,
    position: 'bottom-[21%] left-[1%]',
    color: '#14b8a6',
    tone: 'border-teal-400/30 bg-teal-400/10 text-teal-400',
  },
  {
    label: 'Cotizaciones',
    detail: 'Documentos',
    icon: FileText,
    position: 'right-[1%] bottom-[21%]',
    color: '#d946ef',
    tone: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-400',
  },
  {
    label: 'Oportunidades',
    detail: 'Ventas',
    icon: GitBranch,
    position: 'bottom-[3%] left-[18%]',
    color: '#f59e0b',
    tone: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  },
  {
    label: 'Automatizaciones',
    detail: 'Flujos',
    icon: Workflow,
    position: 'right-[14%] bottom-[3%]',
    color: '#7c3aed',
    tone: 'border-primary/30 bg-primary/10 text-primary',
  },
] as const;

const tickerItems = [
  { label: 'Bandeja omnicanal', icon: MessageSquareText },
  { label: 'CRM y contactos', icon: ContactRound },
  { label: 'Catálogo', icon: CarFront },
  { label: 'Cotizaciones', icon: FileText },
  { label: 'Oportunidades', icon: GitBranch },
  { label: 'Automatizaciones', icon: Workflow },
  { label: 'Agente IA', icon: Bot },
] as const;

export function NexoraOrbitNetwork() {
  return (
    <div className={styles.network} aria-label="Ecosistema conectado de Nexora">
      <div className={cn(styles.orbit, styles.orbitFour)} />
      <div className={cn(styles.orbit, styles.orbitThree)} />
      <div className={cn(styles.orbit, styles.orbitTwo)} />
      <div className={cn(styles.orbit, styles.orbitOne)} />
      <div className={styles.scan} />

      <div className="absolute top-1/2 left-1/2 z-10 flex size-[34%] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div className="border-primary/25 absolute inset-0 rounded-full border border-dashed" />
        <div className="border-primary/20 absolute inset-[10%] rounded-full border" />
        <div
          className={cn(
            styles.centerPulse,
            'from-primary/35 via-card to-background border-primary/45 shadow-primary/25 relative flex size-[74%] min-h-28 min-w-28 flex-col items-center justify-center rounded-[34%] border bg-gradient-to-br text-center shadow-2xl backdrop-blur-xl'
          )}
        >
          <span className="bg-primary/15 text-primary flex size-12 items-center justify-center rounded-2xl sm:size-16">
            <BrainCircuit className="size-7 sm:size-9" />
          </span>
          <span className="mt-2 text-[9px] font-black tracking-[0.13em] sm:text-xs">
            CEREBRO NEXORA
          </span>
          <span className="text-primary mt-0.5 hidden text-[7px] font-bold tracking-[0.18em] uppercase sm:block">
            Contexto + decisiones
          </span>
        </div>
      </div>

      {nodes.map((node, index) => (
        <div
          key={node.label}
          className={cn(styles.node, node.position)}
          style={
            {
              '--delay': `${0.25 + index * 0.11}s`,
              '--node-color': node.color,
            } as CSSProperties
          }
        >
          <div
            className={cn(
              styles.nodeCard,
              'bg-background/82 flex min-w-[112px] items-center gap-2 rounded-2xl border p-2 shadow-xl backdrop-blur-xl sm:min-w-[148px] sm:gap-3 sm:p-3',
              node.tone
            )}
          >
            <span className="bg-background/65 flex size-8 shrink-0 items-center justify-center rounded-xl shadow-sm sm:size-10">
              <node.icon className="size-4 sm:size-5" />
            </span>
            <span className="min-w-0">
              <span className="text-foreground block truncate text-[9px] font-black sm:text-xs">
                {node.label}
              </span>
              <span className="mt-0.5 hidden truncate text-[8px] opacity-70 sm:block">
                {node.detail}
              </span>
            </span>
            <span
              className={cn(
                styles.signal,
                'ml-auto hidden size-1.5 shrink-0 rounded-full bg-current sm:block'
              )}
            />
          </div>
        </div>
      ))}

      <div className="border-primary/25 bg-background/75 absolute top-[48%] left-[48%] z-20 hidden -translate-x-1/2 -translate-y-[190%] items-center gap-2 rounded-full border px-3 py-1.5 text-[8px] font-black tracking-[0.14em] uppercase shadow-lg backdrop-blur sm:flex">
        <Sparkles className="text-primary size-3" />
        Todo conectado
      </div>
    </div>
  );
}

export function NexoraCapabilitiesTicker() {
  const repeatedItems = [...tickerItems, ...tickerItems];

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className={cn(styles.tickerTrack, 'flex items-center gap-3 py-1')}>
        {repeatedItems.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="border-border/70 bg-background/65 text-muted-foreground flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold shadow-sm backdrop-blur"
          >
            <item.icon className="text-primary size-4" />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
