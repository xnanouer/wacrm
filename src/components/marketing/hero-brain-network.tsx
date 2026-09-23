import {
  BrainCircuit,
  Bot,
  ContactRound,
  FileText,
  FolderKanban,
  GitBranch,
  MessageCircle,
  Phone,
  ShoppingBag,
  Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export function FacebookMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center font-sans font-black lowercase',
        className
      )}
      aria-hidden="true"
    >
      f
    </span>
  );
}

export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('relative flex items-center justify-center', className)}
    >
      <MessageCircle className="size-full" strokeWidth={2.2} />
      <Phone
        className="absolute size-[42%] -rotate-12"
        fill="currentColor"
        strokeWidth={1.5}
      />
    </span>
  );
}

export function InstagramMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative flex items-center justify-center rounded-[28%] border-2 border-current',
        className
      )}
      aria-hidden="true"
    >
      <span className="size-[42%] rounded-full border-2 border-current" />
      <span className="absolute top-[17%] right-[17%] size-[13%] rounded-full bg-current" />
    </span>
  );
}

const nodes = [
  {
    icon: WhatsAppMark,
    label: 'WhatsApp',
    detail: 'Conversaciones',
    position: 'top-[8%] left-[2%]',
    tone: 'border-emerald-300/35 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/25',
    cardTone: 'border-emerald-500/35 bg-emerald-500/8',
    accent: 'text-emerald-500',
    dot: 'bg-emerald-500',
    channel: true,
    delay: '0s',
  },
  {
    icon: InstagramMark,
    label: 'Instagram',
    detail: 'Mensajes',
    position: 'top-[8%] right-[2%]',
    tone: 'border-pink-300/35 bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 text-white shadow-pink-500/25',
    cardTone: 'border-pink-500/35 bg-pink-500/8',
    accent: 'text-pink-500',
    dot: 'bg-pink-500',
    channel: true,
    delay: '0.8s',
  },
  {
    icon: FacebookMark,
    label: 'Facebook',
    detail: 'Consultas',
    position: 'top-[39%] -right-[2%]',
    tone: 'border-blue-300/35 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/25',
    cardTone: 'border-blue-500/35 bg-blue-500/8',
    accent: 'text-blue-500',
    dot: 'bg-blue-500',
    channel: true,
    delay: '1.6s',
  },
  {
    icon: ContactRound,
    label: 'CRM',
    detail: 'Bandeja + contactos',
    position: 'top-[39%] -left-[2%]',
    tone: 'border-violet-500/25 bg-background/80 text-violet-500',
    channel: false,
    delay: '2.4s',
  },
  {
    icon: FileText,
    label: 'Cotizaciones',
    detail: 'Documentos',
    position: 'top-[57%] -left-[2%]',
    tone: 'border-fuchsia-500/25 bg-background/80 text-fuchsia-500',
    channel: false,
    delay: '3.2s',
  },
  {
    icon: ShoppingBag,
    label: 'Catálogo',
    detail: 'Productos',
    position: 'top-[57%] -right-[2%]',
    tone: 'border-emerald-500/25 bg-background/80 text-emerald-500',
    channel: false,
    delay: '4s',
  },
  {
    icon: FolderKanban,
    label: 'Proyectos',
    detail: 'Seguimiento',
    position: 'bottom-[14%] left-[5%]',
    tone: 'border-blue-500/25 bg-background/80 text-blue-500',
    channel: false,
    delay: '4.8s',
  },
  {
    icon: Workflow,
    label: 'Automatizaciones',
    detail: 'Acciones',
    position: 'right-[5%] bottom-[14%]',
    tone: 'border-violet-500/25 bg-background/80 text-violet-500',
    channel: false,
    delay: '5.6s',
  },
  {
    icon: GitBranch,
    label: 'Oportunidades',
    detail: 'Ventas',
    position: 'bottom-[1%] left-[21%]',
    tone: 'border-amber-500/25 bg-background/80 text-amber-500',
    channel: false,
    delay: '6.4s',
  },
  {
    icon: Bot,
    label: 'Agente IA',
    detail: 'Atención inteligente',
    position: 'right-[21%] bottom-[1%]',
    tone: 'border-primary/30 bg-background/80 text-primary',
    channel: false,
    delay: '7.2s',
  },
] as const;

const paths = [
  'M 118 92 C 205 110, 235 220, 350 310',
  'M 582 92 C 495 110, 465 220, 350 310',
  'M 642 262 C 520 262, 470 285, 350 310',
  'M 58 262 C 180 262, 230 285, 350 310',
  'M 48 370 C 175 370, 235 335, 350 310',
  'M 652 370 C 525 370, 465 335, 350 310',
  'M 112 470 C 218 445, 252 382, 350 310',
  'M 588 470 C 482 445, 448 382, 350 310',
  'M 220 574 C 255 490, 286 405, 350 310',
  'M 480 574 C 445 490, 414 405, 350 310',
] as const;

export function HeroBrainNetwork() {
  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <div className="bg-primary/18 pointer-events-none absolute top-1/2 left-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />
      <div className="pointer-events-none absolute top-[18%] right-[12%] size-[30%] rounded-full bg-blue-400/10 blur-[75px]" />
      <div className="relative aspect-[1.08/1]">
        <div className="border-primary/20 bg-background/70 text-muted-foreground absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-bold tracking-[0.12em] whitespace-nowrap uppercase shadow-lg backdrop-blur sm:top-5 sm:text-[10px]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          Todo conectado
        </div>

        <svg
          viewBox="0 0 700 620"
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="brain-line" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.1" />
              <stop offset="52%" stopColor="var(--primary)" stopOpacity="0.8" />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity="0.15"
              />
            </linearGradient>
            <filter id="brain-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {paths.map((path, index) => (
            <g key={path}>
              <path
                d={path}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1.5"
                strokeDasharray="6 8"
                opacity="0.8"
              />
              <path
                d={path}
                fill="none"
                stroke="url(#brain-line)"
                strokeWidth="2"
                opacity="0.75"
              />
              <circle
                r="4"
                fill="var(--primary)"
                filter="url(#brain-glow)"
                opacity="0"
                className="motion-reduce:hidden"
              >
                <animateMotion
                  dur={`${4.8 + index * 0.35}s`}
                  begin={`${index * 0.55}s`}
                  repeatCount="indefinite"
                  path={path}
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.06;0.92;1"
                  dur={`${4.8 + index * 0.35}s`}
                  begin={`${index * 0.55}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}
        </svg>

        <div className="absolute top-1/2 left-1/2 flex size-[48%] max-h-72 max-w-72 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <div className="border-primary/15 absolute inset-0 animate-[spin_24s_linear_infinite] rounded-full border border-dashed motion-reduce:animate-none" />
          <div className="border-primary/20 absolute inset-[9%] animate-[spin_18s_linear_infinite_reverse] rounded-full border motion-reduce:animate-none" />
          <div className="border-primary/20 absolute inset-[19%] rounded-full border" />
          <span className="bg-primary absolute top-[3%] left-1/2 size-2.5 -translate-x-1/2 rounded-full shadow-[0_0_18px_var(--primary)]" />
          <span className="bg-primary absolute top-1/2 right-[3%] size-2 -translate-y-1/2 rounded-full shadow-[0_0_14px_var(--primary)]" />
          <span className="bg-primary absolute bottom-[4%] left-[33%] size-2 rounded-full shadow-[0_0_14px_var(--primary)]" />

          <div className="from-primary/30 via-card to-card border-primary/40 shadow-primary/25 relative flex size-[58%] min-h-28 min-w-28 flex-col items-center justify-center rounded-[34%] border bg-gradient-to-br shadow-2xl backdrop-blur">
            <div className="bg-primary/18 text-primary shadow-primary/20 flex size-12 items-center justify-center rounded-2xl shadow-lg sm:size-16">
              <BrainCircuit className="size-7 sm:size-9" />
            </div>
            <p className="mt-2 text-[10px] font-black tracking-[0.13em] sm:text-xs">
              CEREBRO NEXORA
            </p>
            <p className="text-primary mt-0.5 text-[7px] tracking-[0.2em] uppercase sm:text-[8px]">
              Contexto + decisiones
            </p>
          </div>
        </div>

        {nodes.map((node) =>
          node.channel ? (
            <div
              key={node.label}
              className={cn(
                'absolute z-20 flex min-w-[118px] items-center gap-2 rounded-2xl border p-2 shadow-xl backdrop-blur-md sm:min-w-[152px] sm:gap-3 sm:p-3',
                node.position,
                node.cardTone
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-xl border shadow-lg sm:size-11 sm:rounded-2xl',
                  node.tone
                )}
              >
                <node.icon className="size-[18px] sm:size-6" />
              </span>
              <span className="min-w-0">
                <span className="text-foreground block truncate text-[9px] font-black sm:text-xs">
                  {node.label}
                </span>
                <span
                  className={cn(
                    'mt-0.5 hidden text-[8px] sm:block',
                    node.accent
                  )}
                >
                  {node.detail}
                </span>
              </span>
              <span
                className={cn(
                  'ml-auto hidden size-1.5 animate-pulse rounded-full motion-reduce:animate-none sm:block',
                  node.dot
                )}
                style={{ animationDelay: node.delay }}
              />
            </div>
          ) : (
            <div
              key={node.label}
              className={cn(
                'absolute z-10 flex min-w-[98px] items-center gap-2 rounded-xl border p-2 shadow-xl backdrop-blur-md transition-colors sm:min-w-[128px] sm:rounded-2xl sm:p-2.5',
                node.position,
                node.tone
              )}
            >
              <span className="bg-primary/8 flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-9">
                <node.icon className="size-3.5 sm:size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-foreground truncate text-[8px] font-black sm:text-[10px]">
                  {node.label}
                </p>
                <p className="mt-0.5 hidden truncate text-[7px] opacity-70 sm:block">
                  {node.detail}
                </p>
              </div>
              <span
                className="ml-auto hidden size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none sm:block"
                style={{ animationDelay: node.delay }}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

const backdropPaths = [
  'M 104 126 C 230 126, 278 270, 400 400',
  'M 696 126 C 570 126, 522 270, 400 400',
  'M 56 400 C 190 400, 270 400, 400 400',
  'M 744 400 C 610 400, 530 400, 400 400',
  'M 112 674 C 236 610, 282 526, 400 400',
  'M 688 674 C 564 610, 518 526, 400 400',
] as const;

const backdropNodes = [
  [104, 126],
  [696, 126],
  [56, 400],
  [744, 400],
  [112, 674],
  [688, 674],
] as const;

export function HeroNeuralBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute top-[56%] left-1/2 aspect-square w-[min(118vw,760px)] -translate-x-1/2 -translate-y-1/2 opacity-45 sm:w-[min(92vw,820px)] lg:left-[76%] lg:w-[min(72vw,900px)] lg:opacity-55">
        <div className="bg-primary/25 absolute top-1/2 left-1/2 size-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />

        <svg
          viewBox="0 0 800 800"
          className="absolute inset-0 size-full [mask-image:radial-gradient(circle,black_28%,transparent_76%)]"
        >
          <defs>
            <linearGradient
              id="neural-backdrop-line"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.04" />
              <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.9" />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity="0.04"
              />
            </linearGradient>
            <radialGradient id="neural-backdrop-node">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle
            cx="400"
            cy="400"
            r="238"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1"
            strokeDasharray="5 12"
            opacity="0.26"
          />
          <circle
            cx="400"
            cy="400"
            r="184"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.4"
            opacity="0.22"
          />
          <circle
            cx="400"
            cy="400"
            r="128"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1"
            opacity="0.32"
          />

          {backdropPaths.map((path, index) => (
            <g key={path}>
              <path
                d={path}
                fill="none"
                stroke="url(#neural-backdrop-line)"
                strokeWidth="2"
                opacity="0.55"
              />
              <circle
                r="5"
                fill="var(--primary)"
                opacity="0"
                className="motion-reduce:hidden"
              >
                <animateMotion
                  dur={`${5.6 + index * 0.28}s`}
                  begin={`${index * 0.65}s`}
                  repeatCount="indefinite"
                  path={path}
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.06;0.92;1"
                  dur={`${5.6 + index * 0.28}s`}
                  begin={`${index * 0.65}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}

          {backdropNodes.map(([cx, cy], index) => (
            <g key={`${cx}-${cy}`}>
              <circle
                cx={cx}
                cy={cy}
                r="22"
                fill="url(#neural-backdrop-node)"
                opacity="0.35"
              />
              <circle
                cx={cx}
                cy={cy}
                r="6"
                fill="var(--primary)"
                opacity="0.85"
              />
              <circle
                cx={cx}
                cy={cy}
                r="8"
                fill="none"
                stroke="var(--primary)"
                opacity="0.55"
              >
                <animate
                  attributeName="r"
                  values="8;24"
                  dur={`${3.4 + index * 0.2}s`}
                  begin={`${index * 0.4}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.55;0"
                  dur={`${3.4 + index * 0.2}s`}
                  begin={`${index * 0.4}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}
        </svg>

        <div className="absolute top-1/2 left-1/2 flex size-[31%] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <div className="border-primary/25 absolute inset-0 animate-[spin_28s_linear_infinite] rounded-full border border-dashed motion-reduce:animate-none" />
          <div className="border-primary/30 absolute inset-[13%] animate-[spin_20s_linear_infinite_reverse] rounded-full border motion-reduce:animate-none" />
          <div className="from-primary/28 via-background/18 to-primary/8 border-primary/30 shadow-primary/20 relative flex size-[64%] items-center justify-center rounded-[38%] border bg-gradient-to-br shadow-2xl backdrop-blur-[2px]">
            <BrainCircuit className="text-primary size-[54%] drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_65%,transparent)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
