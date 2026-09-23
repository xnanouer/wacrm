import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CloudCog,
  ContactRound,
  Database,
  GitBranch,
  Headphones,
  Infinity,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  Mic2,
  Network,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
  Volume2,
  Workflow,
  Zap,
} from 'lucide-react';

import { BrandLockup, BrandMark } from '@/components/brand/brand-mark';
import {
  FacebookMark,
  InstagramMark,
  WhatsAppMark,
} from '@/components/marketing/hero-brain-network';
import {
  NexoraCapabilitiesTicker,
  NexoraOrbitNetwork,
} from '@/components/marketing/nexora-orbit-network';
import { ProductPreview } from '@/components/marketing/product-preview';
import { PublicHeader } from '@/components/marketing/public-header';
import { VerticalsSection } from '@/components/marketing/verticals-section';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  COMMERCIAL_PLANS,
  EXTRA_CONNECTION_PRICE,
  EXTRA_USER_PRICE,
  TRIAL_DAYS,
  formatClp,
  formatNumber,
  type CommercialPlanCode,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: MessagesSquare,
    eyebrow: 'Conversaciones',
    title: 'Bandeja omnicanal',
    description:
      'Centraliza tus conversaciones y permite que tu equipo atienda desde un solo lugar.',
    tone: 'bg-emerald-500/12 text-emerald-400',
  },
  {
    icon: ContactRound,
    eyebrow: 'Información',
    title: 'CRM y contactos',
    description:
      'Organiza clientes, información, historial y actividad comercial.',
    tone: 'bg-sky-500/12 text-sky-400',
  },
  {
    icon: GitBranch,
    eyebrow: 'Ventas',
    title: 'Oportunidades',
    description:
      'Transforma conversaciones en oportunidades y controla cada etapa del proceso comercial.',
    tone: 'bg-amber-500/12 text-amber-400',
  },
  {
    icon: BrainCircuit,
    eyebrow: 'Inteligencia',
    title: 'Agente IA Nexora',
    description:
      'Automatiza respuestas y tareas mediante el asistente inteligente de tu empresa.',
    tone: 'bg-violet-500/12 text-violet-400',
  },
  {
    icon: Workflow,
    eyebrow: 'Eficiencia',
    title: 'Automatizaciones',
    description: 'Reduce tareas repetitivas y crea procesos más eficientes.',
    tone: 'bg-rose-500/12 text-rose-400',
  },
  {
    icon: BarChart3,
    eyebrow: 'Visibilidad',
    title: 'Control de operación',
    description:
      'Mide conversaciones, tiempos de atención, ejecutivos y resultados desde un mismo lugar.',
    tone: 'bg-cyan-500/12 text-cyan-400',
  },
] as const;

const aiCapabilities = [
  { icon: MessageCircle, label: 'Responder mensajes' },
  { icon: SearchCheck, label: 'Comprender conversaciones' },
  { icon: Mic2, label: 'Comprender audios' },
  { icon: Volume2, label: 'Responder mediante texto o audio' },
  { icon: Database, label: 'Usar información disponible en Nexora' },
  { icon: ContactRound, label: 'Consultar información de clientes' },
  { icon: Target, label: 'Apoyar la clasificación de oportunidades' },
  { icon: Clock3, label: 'Ayudar en seguimientos comerciales' },
] as const;

const steps = [
  {
    number: '01',
    icon: Network,
    title: 'Conecta',
    description: 'Conecta tus canales a Nexora.',
  },
  {
    number: '02',
    icon: UsersRound,
    title: 'Organiza',
    description: 'Agrega a tu equipo y organiza la atención.',
  },
  {
    number: '03',
    icon: MessageCircle,
    title: 'Atiende',
    description: 'Centraliza conversaciones, clientes y oportunidades.',
  },
  {
    number: '04',
    icon: Zap,
    title: 'Automatiza',
    description: 'Configura tu Agente IA y tus automatizaciones.',
  },
] as const;

const planFeatures: Record<CommercialPlanCode, readonly string[]> = {
  starter: [
    'Agente IA Nexora',
    'Coach IA para el equipo',
    'CRM',
    'Bandeja',
    'Contactos',
    'Oportunidades',
  ],
  professional: [
    'Agente IA Nexora',
    'Coach IA para el equipo',
    'CRM',
    'Bandeja',
    'Contactos',
    'Oportunidades',
    'Automatizaciones avanzadas',
    'Mayor capacidad operativa',
  ],
  enterprise: [
    'Agente IA Nexora',
    'Coach IA para el equipo',
    'CRM',
    'Bandeja',
    'Contactos',
    'Oportunidades',
    'Automatizaciones avanzadas',
    'Mayor capacidad operativa',
    'Funciones avanzadas',
  ],
};

const faqs = [
  {
    question: '¿Qué es Nexora?',
    answer:
      'Nexora es una plataforma para centralizar conversaciones, clientes, oportunidades, automatizaciones e Inteligencia Artificial.',
  },
  {
    question: '¿Qué canales puedo conectar?',
    answer:
      'WhatsApp, Instagram y Facebook según las integraciones disponibles en Nexora.',
  },
  {
    question: '¿Qué es una conexión?',
    answer:
      'Una cuenta individual conectada a Nexora, como un número de WhatsApp, una cuenta de Instagram o una página compatible de Facebook.',
  },
  {
    question: '¿Qué es un usuario?',
    answer: 'Una persona con acceso individual a la plataforma.',
  },
  {
    question: '¿Qué son los Puntos Nexora?',
    answer:
      'Son créditos de uso incluidos en los planes para utilizar funciones de Inteligencia Artificial.',
  },
  {
    question: '¿Qué hace el Coach IA?',
    answer:
      'Analiza exclusivamente conversaciones atendidas por personas y entrega recomendaciones privadas para ayudar a cada ejecutivo a mejorar. El administrador decide si desea mantenerlo activo.',
  },
  {
    question: '¿Puedo agregar usuarios?',
    answer: `Sí. Los usuarios adicionales tienen un valor de ${formatClp(EXTRA_USER_PRICE)} al mes.`,
  },
  {
    question: '¿Puedo agregar conexiones?',
    answer: `Sí. Cada conexión adicional tiene un valor de ${formatClp(EXTRA_CONNECTION_PRICE)} al mes.`,
  },
  {
    question: '¿Puedo probar Nexora?',
    answer: `Sí. Nexora ofrece una prueba inicial de ${TRIAL_DAYS} días.`,
  },
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={cn(align === 'center' && 'mx-auto max-w-3xl text-center')}>
      <p className="text-primary text-xs font-black tracking-[0.2em] uppercase">
        {eyebrow}
      </p>
      <h2 className="text-foreground mt-3 text-3xl leading-[1.08] font-black tracking-[-0.045em] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted-foreground mt-5 max-w-2xl text-base leading-7 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function TrialNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex items-center gap-2 text-xs',
        className
      )}
    >
      <CheckCircle2 className="size-4 text-emerald-400" />
      {TRIAL_DAYS} días gratis para conocer Nexora
    </span>
  );
}

function OmnichannelVisual() {
  const channels = [
    {
      icon: WhatsAppMark,
      name: 'WhatsApp',
      tone: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
    },
    {
      icon: InstagramMark,
      name: 'Instagram',
      tone: 'bg-pink-500/12 text-pink-400 border-pink-500/20',
    },
    {
      icon: FacebookMark,
      name: 'Facebook',
      tone: 'bg-sky-500/12 text-sky-400 border-sky-500/20',
    },
  ] as const;

  const operations = [
    { icon: ContactRound, name: 'CRM' },
    { icon: BrainCircuit, name: 'IA' },
    { icon: Workflow, name: 'Automatizaciones' },
    { icon: GitBranch, name: 'Oportunidades' },
  ] as const;

  return (
    <div className="border-primary/20 from-card via-card to-primary/8 relative overflow-hidden rounded-[32px] border bg-gradient-to-br p-5 shadow-2xl shadow-black/10 sm:p-8 lg:p-12">
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="bg-primary/15 pointer-events-none absolute top-1/2 left-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />

      <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto_1.08fr_auto_1fr]">
        <div className="grid gap-3">
          <p className="text-muted-foreground mb-1 text-center text-[10px] font-bold tracking-[0.16em] uppercase lg:text-left">
            Tus canales
          </p>
          {channels.map((channel) => (
            <div
              key={channel.name}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3.5 transition-transform hover:-translate-y-0.5',
                channel.tone
              )}
            >
              <span className="bg-background/50 flex size-9 items-center justify-center rounded-xl">
                <channel.icon className="size-4" />
              </span>
              <span className="text-foreground text-sm font-bold">
                {channel.name}
              </span>
              <span className="ml-auto size-2 animate-pulse rounded-full bg-current opacity-70 motion-reduce:animate-none" />
            </div>
          ))}
        </div>

        <ArrowRight className="text-primary hidden size-6 lg:block" />
        <ArrowDown className="text-primary mx-auto size-6 lg:hidden" />

        <div className="relative mx-auto flex size-44 items-center justify-center sm:size-52">
          <div className="border-primary/15 absolute inset-0 animate-[spin_18s_linear_infinite] rounded-full border border-dashed motion-reduce:animate-none" />
          <div className="border-primary/20 absolute inset-5 animate-[spin_13s_linear_infinite_reverse] rounded-full border motion-reduce:animate-none" />
          <div className="from-primary/25 via-card to-card border-primary/30 shadow-primary/20 relative flex size-32 flex-col items-center justify-center rounded-[30px] border bg-gradient-to-br shadow-2xl sm:size-36">
            <BrandMark className="size-14" />
            <p className="mt-2 text-sm font-black tracking-[0.14em]">NEXORA</p>
            <p className="text-primary text-[8px] tracking-[0.3em]">CRM</p>
          </div>
        </div>

        <ArrowRight className="text-primary hidden size-6 lg:block" />
        <ArrowDown className="text-primary mx-auto size-6 lg:hidden" />

        <div className="grid grid-cols-2 gap-3">
          <p className="text-muted-foreground col-span-2 mb-1 text-center text-[10px] font-bold tracking-[0.16em] uppercase lg:text-left">
            Una sola operación
          </p>
          {operations.map((operation) => (
            <div
              key={operation.name}
              className="border-border bg-background/55 hover:border-primary/30 hover:bg-primary/8 rounded-2xl border p-4 text-center transition-all hover:-translate-y-0.5"
            >
              <operation.icon className="text-primary mx-auto size-5" />
              <p className="mt-2 text-[11px] font-bold">{operation.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-clip">
      <PublicHeader overlay />

      <main>
        <section
          id="producto"
          className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-4 pt-28 pb-8 sm:px-6 sm:pt-32 lg:px-8 lg:pt-28"
        >
          <div className="subtle-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_90%)] opacity-20" />
          <div className="bg-primary/20 pointer-events-none absolute top-[-12%] right-[-3%] size-[45rem] rounded-full blur-[170px]" />
          <div className="pointer-events-none absolute bottom-[-28%] left-[-12%] size-[42rem] rounded-full bg-blue-500/12 blur-[160px]" />
          <div className="from-background via-background/82 to-background/15 pointer-events-none absolute inset-0 bg-gradient-to-r" />
          <div className="via-primary/70 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent" />

          <div className="relative z-10 mx-auto grid w-full max-w-[1540px] items-center gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-0 xl:gap-6">
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-5 relative z-20 mx-auto max-w-2xl text-center motion-safe:duration-700 lg:mx-0 lg:text-left">
              <div className="border-primary/25 bg-primary/8 text-primary mb-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[10px] font-black tracking-[0.17em] uppercase shadow-sm backdrop-blur">
                <Sparkles className="size-3.5" />
                Crece con orden. Vende con inteligencia.
              </div>

              <h1 className="max-w-3xl text-[clamp(2.75rem,5vw,5.5rem)] leading-[0.92] font-black tracking-[-0.07em] text-balance">
                Tu empresa, más conectada.
                <span className="from-primary mt-2 block bg-gradient-to-r via-violet-500 to-blue-500 bg-clip-text text-transparent">
                  Tu equipo, imparable.
                </span>
              </h1>

              <p className="text-muted-foreground mx-auto mt-7 max-w-xl text-base leading-7 text-balance sm:text-xl sm:leading-8 lg:mx-0">
                Nexora reúne clientes, canales, ventas e inteligencia artificial
                para que tu equipo responda mejor, venda más y tenga el control
                de toda la operación.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
                {[
                  { icon: BrainCircuit, label: 'IA que atiende' },
                  { icon: UsersRound, label: 'Equipo siempre coordinado' },
                  { icon: Target, label: 'Cada venta bajo control' },
                ].map((benefit) => (
                  <span
                    key={benefit.label}
                    className="border-border/70 bg-background/65 text-foreground/80 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold shadow-sm backdrop-blur"
                  >
                    <benefit.icon className="text-primary size-3.5" />
                    {benefit.label}
                  </span>
                ))}
              </div>

              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  href="/signup"
                  className="group bg-primary text-primary-foreground shadow-primary/35 relative flex h-14 min-w-56 items-center justify-between gap-8 overflow-hidden rounded-full px-6 text-sm font-bold shadow-xl transition hover:scale-[1.03] hover:brightness-110 active:scale-[0.97]"
                >
                  Probar Nexora gratis
                  <span className="bg-primary-foreground/14 flex size-8 items-center justify-center rounded-full">
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
                <Link
                  href="#funciones"
                  className="border-foreground/12 bg-background/60 text-foreground hover:border-primary/25 hover:bg-background/80 flex h-14 min-w-48 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold shadow-sm backdrop-blur-md transition"
                >
                  Explorar Nexora
                  <ChevronRight className="size-4" />
                </Link>
              </div>

              <TrialNote className="text-muted-foreground mt-5 justify-center lg:justify-start" />
            </div>

            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 relative mx-auto flex w-full items-center justify-center motion-safe:duration-1000">
              <NexoraOrbitNetwork />
            </div>
          </div>

          <div className="border-border/60 relative z-10 mx-auto mt-6 w-full max-w-[1440px] border-t pt-5 lg:mt-0">
            <p className="text-muted-foreground mb-3 text-center text-[9px] font-black tracking-[0.18em] uppercase">
              Una plataforma para toda tu operación
            </p>
            <NexoraCapabilitiesTicker />
          </div>
        </section>

        <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="subtle-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] opacity-25" />
          <div className="bg-primary/18 pointer-events-none absolute top-1/2 left-1/2 size-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]" />
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-8 relative mx-auto max-w-6xl motion-safe:duration-1000">
            <div className="bg-primary/20 pointer-events-none absolute inset-x-24 bottom-0 h-32 blur-[80px]" />
            <ProductPreview />
          </div>
        </section>

        <section
          id="funciones"
          className="border-border/60 border-y bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--card)_45%,transparent),transparent)] px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
        >
          <div className="mx-auto max-w-[1440px]">
            <SectionHeading
              eyebrow="Todo conectado"
              title="Mucho más que una bandeja de entrada"
              description="Nexora reúne la atención, la información comercial y la automatización para que tu equipo avance con claridad."
              align="center"
            />

            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature, index) => (
                <article
                  key={feature.title}
                  className="border-border/80 bg-card/75 hover:border-primary/30 hover:shadow-primary/5 group relative overflow-hidden rounded-3xl border p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-7"
                >
                  <span className="text-muted-foreground/35 absolute top-5 right-6 text-xs font-black tabular-nums">
                    0{index + 1}
                  </span>
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-2xl',
                      feature.tone
                    )}
                  >
                    <feature.icon className="size-5" />
                  </div>
                  <p className="text-primary mt-7 text-[10px] font-black tracking-[0.18em] uppercase">
                    {feature.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-bold tracking-[-0.025em]">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    {feature.description}
                  </p>
                  <div className="bg-primary absolute bottom-0 left-0 h-0.5 w-0 transition-[width] duration-300 group-hover:w-full" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="integraciones"
          className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
        >
          <div className="mx-auto max-w-[1280px]">
            <div className="grid items-end gap-7 lg:grid-cols-[1fr_0.8fr]">
              <SectionHeading
                eyebrow="Operación omnicanal"
                title="Toda tu comunicación. Una sola operación."
              />
              <p className="text-muted-foreground max-w-xl text-base leading-7 lg:justify-self-end">
                Conecta tus canales y permite que tu equipo trabaje desde una
                sola plataforma, con contexto compartido y procesos ordenados.
              </p>
            </div>
            <div className="mt-12">
              <OmnichannelVisual />
            </div>
          </div>
        </section>

        <section
          id="ia"
          className="border-border/60 relative overflow-hidden border-y px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
        >
          <div className="bg-primary/12 pointer-events-none absolute top-1/2 -left-56 size-[36rem] -translate-y-1/2 rounded-full blur-[150px]" />
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Una IA que trabaja junto a tu equipo"
                title="Agente IA Nexora"
                description="El asistente inteligente de tu empresa puede ayudarte a responder consultas, comprender conversaciones y ejecutar tareas dentro de las capacidades que tú autorices."
              />

              <div className="border-primary/20 from-primary/12 to-card mt-8 rounded-2xl border bg-gradient-to-r p-5">
                <div className="flex gap-3">
                  <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-bold">Tú mantienes el control.</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      Define cómo debe responder, qué información puede utilizar
                      y cuándo debe intervenir una persona.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-muted-foreground mt-4 text-xs leading-5">
                Las capacidades disponibles dependen de la configuración y las
                integraciones habilitadas en cada empresa.
              </p>
            </div>

            <div className="border-primary/20 bg-card/70 relative overflow-hidden rounded-[32px] border p-5 shadow-2xl shadow-black/10 sm:p-7">
              <div className="bg-primary/15 pointer-events-none absolute -top-32 -right-32 size-80 rounded-full blur-[100px]" />
              <div className="relative flex items-center gap-4 border-b border-white/8 pb-5">
                <div className="from-primary text-primary-foreground shadow-primary/30 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br to-violet-400 shadow-xl">
                  <BrainCircuit className="size-7" />
                </div>
                <div>
                  <p className="text-lg font-black">Cerebro Nexora</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Conocimiento, personalidad y reglas de atención
                  </p>
                </div>
                <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold text-emerald-400 sm:flex">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
                  CONFIGURABLE
                </span>
              </div>

              <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
                {aiCapabilities.map((capability) => (
                  <div
                    key={capability.label}
                    className="border-border/80 bg-background/45 hover:border-primary/30 hover:bg-primary/5 flex min-h-20 items-center gap-3 rounded-2xl border p-4 transition-colors"
                  >
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                      <capability.icon className="size-4" />
                    </span>
                    <p className="text-xs leading-5 font-semibold">
                      {capability.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-primary/20 bg-card/75 relative mx-auto mt-14 max-w-[1280px] overflow-hidden rounded-[32px] border p-6 shadow-2xl shadow-black/10 sm:p-8 lg:p-10">
            <div className="bg-primary/15 pointer-events-none absolute -top-40 -left-32 size-96 rounded-full blur-[130px]" />
            <div className="pointer-events-none absolute right-0 bottom-0 size-80 rounded-full bg-blue-500/10 blur-[120px]" />

            <div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div>
                <div className="border-primary/25 bg-primary/8 text-primary inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[10px] font-black tracking-[0.16em] uppercase">
                  <BrainCircuit className="size-3.5" />
                  Coach IA para tu equipo
                </div>
                <h3 className="text-foreground mt-6 max-w-3xl text-3xl leading-[1.04] font-black tracking-[-0.045em] text-balance sm:text-4xl lg:text-5xl">
                  Cada conversación también puede enseñar a{' '}
                  <span className="from-primary bg-gradient-to-r via-violet-500 to-blue-500 bg-clip-text text-transparent">
                    vender mejor.
                  </span>
                </h3>
                <p className="text-muted-foreground mt-5 max-w-2xl text-base leading-7 sm:text-lg">
                  Al cerrar una atención humana —o cuando el equipo lo solicite—
                  el Coach IA transforma la conversación en fortalezas,
                  oportunidades de mejora y próximos pasos claros.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: BadgeCheck,
                      title: 'Fortalezas visibles',
                      text: 'Reconoce lo que cada ejecutivo hace bien.',
                    },
                    {
                      icon: Target,
                      title: 'Mejoras accionables',
                      text: 'Sugiere cambios concretos para la próxima atención.',
                    },
                    {
                      icon: UsersRound,
                      title: 'Visión de equipo',
                      text: 'Ayuda al administrador a acompañar mejor.',
                    },
                  ].map((benefit) => (
                    <div
                      key={benefit.title}
                      className="border-border/80 bg-background/45 rounded-2xl border p-4"
                    >
                      <benefit.icon className="text-primary size-5" />
                      <p className="text-foreground mt-3 text-sm font-bold">
                        {benefit.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">
                        {benefit.text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                  <p className="text-muted-foreground text-xs leading-5">
                    El administrador controla su activación. Solo analiza
                    mensajes humanos y no evalúa conversaciones atendidas por el
                    Agente IA.
                  </p>
                </div>
              </div>

              <div className="border-border/80 bg-background/70 rounded-[28px] border p-5 shadow-xl backdrop-blur sm:p-6">
                <div className="flex items-center gap-3 border-b border-white/8 pb-5">
                  <span className="from-primary flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br to-violet-400 text-white shadow-lg shadow-violet-500/20">
                    <BrainCircuit className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Recomendación preparada</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Atención humana · Coach IA
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-primary text-2xl font-black">88</p>
                    <p className="text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
                      de 100
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {[
                    { label: 'Claridad', value: 94 },
                    { label: 'Empatía', value: 91 },
                    { label: 'Descubrimiento', value: 84 },
                    { label: 'Seguimiento', value: 82 },
                  ].map((metric) => (
                    <div key={metric.label}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold">{metric.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {metric.value}%
                        </span>
                      </div>
                      <div className="bg-muted h-2 overflow-hidden rounded-full">
                        <div
                          className="from-primary h-full rounded-full bg-gradient-to-r to-blue-500"
                          style={{ width: `${metric.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-primary/20 bg-primary/8 mt-6 rounded-2xl border p-4">
                  <p className="text-primary text-[10px] font-black tracking-[0.14em] uppercase">
                    Próximo paso sugerido
                  </p>
                  <p className="text-foreground mt-2 text-sm leading-6 font-semibold">
                    Confirma la necesidad del cliente y acuerda una fecha
                    concreta para el próximo contacto.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-[1280px]">
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="IA simple de entender"
                  title="Puntos Nexora"
                  description="Cada plan incluye Puntos Nexora para utilizar las funciones de Inteligencia Artificial."
                />
                <div className="mt-7 flex items-start gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <CircleDollarSign className="size-5" />
                  </div>
                  <div>
                    <p className="font-bold">
                      Sin tokens complicados ni cálculos técnicos.
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      Ves tu saldo, tu consumo y cuánto utiliza cada acción en
                      una medida sencilla.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  {
                    icon: MessageCircle,
                    label: 'Respuesta IA básica',
                    value: '1',
                    unit: 'punto',
                  },
                  {
                    icon: Mic2,
                    label: 'Transcripción de audio',
                    value: '2',
                    unit: 'puntos / min',
                  },
                  {
                    icon: Volume2,
                    label: 'Generación de audio',
                    value: '5',
                    unit: 'puntos / min',
                  },
                ].map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      'border-border bg-card relative overflow-hidden rounded-3xl border p-6',
                      index === 0 && 'border-primary/30 bg-primary/7'
                    )}
                  >
                    <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                      <item.icon className="size-5" />
                    </div>
                    <p className="text-muted-foreground mt-8 min-h-10 text-xs leading-5 font-semibold">
                      {item.label}
                    </p>
                    <div className="mt-4 flex items-end gap-1.5">
                      <span className="text-4xl font-black tracking-tight">
                        {item.value}
                      </span>
                      <span className="text-muted-foreground pb-1 text-xs">
                        {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-border/60 bg-card/30 border-y px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-[1280px]">
            <SectionHeading
              eyebrow="Cómo funciona Nexora"
              title="Empieza en pocos pasos"
              description="Una estructura clara para llevar tus canales, equipo y procesos a una misma operación."
              align="center"
            />
            <div className="relative mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="bg-primary/20 absolute top-16 right-[12%] left-[12%] hidden h-px xl:block" />
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="border-border/80 bg-background relative rounded-3xl border p-6"
                >
                  <div className="relative flex items-center justify-between">
                    <span className="bg-primary text-primary-foreground shadow-primary/20 flex size-11 items-center justify-center rounded-2xl shadow-lg">
                      <step.icon className="size-5" />
                    </span>
                    <span className="text-muted-foreground/35 text-2xl font-black">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="mt-8 text-sm font-black tracking-[0.12em] uppercase">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <VerticalsSection />

        <section
          id="planes"
          className="border-border/60 relative overflow-hidden border-y px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
        >
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-20" />
          <div className="bg-primary/12 pointer-events-none absolute top-12 left-1/2 size-[38rem] -translate-x-1/2 rounded-full blur-[150px]" />
          <div className="relative mx-auto max-w-[1440px]">
            <SectionHeading
              eyebrow="Planes Nexora"
              title="Una base clara para cada etapa"
              description={`Conoce Nexora durante ${TRIAL_DAYS} días antes de elegir tu plan.`}
              align="center"
            />

            <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
              {COMMERCIAL_PLANS.map((plan) => (
                <article
                  key={plan.code}
                  className={cn(
                    'border-border bg-card relative flex flex-col overflow-hidden rounded-[28px] border p-6 transition-all hover:-translate-y-1 sm:p-8',
                    plan.recommended &&
                      'border-primary/50 from-primary/15 via-card to-card shadow-primary/15 ring-primary/20 bg-gradient-to-b shadow-2xl ring-1 lg:-translate-y-3 lg:hover:-translate-y-4'
                  )}
                >
                  {plan.recommended ? (
                    <Badge className="absolute top-5 right-5 h-6 px-2.5 text-[9px] font-black tracking-wider uppercase">
                      Más recomendado
                    </Badge>
                  ) : null}

                  <p className="text-lg font-black tracking-[-0.03em]">
                    {plan.name}
                  </p>
                  <p className="text-muted-foreground mt-3 min-h-18 text-sm leading-6">
                    {plan.description}
                  </p>

                  <div className="mt-7 flex items-end gap-2">
                    <span className="text-4xl font-black tracking-[-0.05em] sm:text-5xl">
                      {formatClp(plan.price)}
                    </span>
                    <span className="text-muted-foreground pb-1.5 text-sm">
                      / mes
                    </span>
                  </div>

                  <div className="border-border/80 mt-7 grid grid-cols-3 gap-2 border-y py-5">
                    <div>
                      <p className="text-lg font-black">{plan.includedUsers}</p>
                      <p className="text-muted-foreground text-[10px]">
                        usuarios
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-black">
                        {plan.includedConnections}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        conexiones
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-black">
                        {formatNumber(plan.nexoraPoints)}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        puntos / mes
                      </p>
                    </div>
                  </div>

                  <ul className="mt-7 flex-1 space-y-3">
                    {planFeatures[plan.code].map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-400">
                          <Check className="size-3" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className={buttonVariants({
                      variant: plan.recommended ? 'default' : 'outline',
                      size: 'lg',
                      className:
                        'group shadow-primary/20 mt-8 h-11 w-full rounded-xl',
                    })}
                  >
                    Comenzar gratis
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </article>
              ))}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {[
                {
                  icon: UserRound,
                  title: 'Usuario adicional',
                  price: EXTRA_USER_PRICE,
                  description: 'Una persona con acceso individual a Nexora.',
                },
                {
                  icon: Network,
                  title: 'Conexión adicional',
                  price: EXTRA_CONNECTION_PRICE,
                  description:
                    'Una cuenta individual de WhatsApp, Instagram o Facebook conectada a Nexora.',
                },
              ].map((additional) => (
                <div
                  key={additional.title}
                  className="border-border bg-card/70 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"
                >
                  <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <additional.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">{additional.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {additional.description}
                    </p>
                  </div>
                  <p className="mt-1 text-xl font-black whitespace-nowrap sm:mt-0 sm:ml-auto">
                    {formatClp(additional.price)}
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      / mes
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="preguntas" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <SectionHeading
                eyebrow="Respuestas claras"
                title="Preguntas frecuentes"
                description="Lo esencial para entender cómo Nexora organiza usuarios, conexiones e Inteligencia Artificial."
              />
              <div className="border-primary/20 bg-primary/8 mt-8 rounded-2xl border p-5">
                <Headphones className="text-primary size-5" />
                <p className="mt-4 font-bold">¿Tienes otra pregunta?</p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  Podrás conversar con el equipo de Nexora antes de elegir tu
                  plan.
                </p>
              </div>
            </div>

            <div className="border-border/80 bg-card/65 overflow-hidden rounded-3xl border px-5 sm:px-7">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-border/70 border-b last:border-0"
                >
                  <summary className="focus-visible:ring-primary flex cursor-pointer list-none items-center gap-4 rounded-lg py-5 text-sm font-bold outline-none focus-visible:ring-2 sm:text-base [&::-webkit-details-marker]:hidden">
                    <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg text-xs">
                      ?
                    </span>
                    <span className="flex-1">{faq.question}</span>
                    <span className="border-border text-muted-foreground group-open:bg-primary group-open:text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg border transition-transform group-open:rotate-90">
                      <ChevronRight className="size-3.5" />
                    </span>
                  </summary>
                  <p className="text-muted-foreground pr-5 pb-5 pl-11 text-sm leading-6">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="border-primary/25 from-primary/25 to-card shadow-primary/10 relative mx-auto max-w-[1280px] overflow-hidden rounded-[36px] border bg-gradient-to-br via-violet-500/12 px-6 py-14 text-center shadow-2xl sm:px-10 sm:py-18 lg:px-16 lg:py-22">
            <div className="subtle-grid pointer-events-none absolute inset-0 opacity-20" />
            <div className="bg-primary/20 pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full blur-[100px]" />
            <div className="relative mx-auto max-w-3xl">
              <div className="border-primary/20 bg-background/30 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl border backdrop-blur">
                <Infinity className="size-7" />
              </div>
              <h2 className="mt-7 text-3xl leading-[1.08] font-black tracking-[-0.045em] sm:text-5xl">
                Lleva tu operación comercial al siguiente nivel.
              </h2>
              <p className="text-primary mt-5 text-lg font-black tracking-[0.12em] uppercase sm:text-xl">
                Centraliza. Automatiza. Vende.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className={buttonVariants({
                    size: 'lg',
                    className:
                      'group shadow-primary/25 h-12 rounded-xl px-7 shadow-xl',
                  })}
                >
                  Comenzar gratis
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'lg',
                    className: 'bg-background/30 h-12 rounded-xl px-7',
                  })}
                >
                  Iniciar sesión
                </Link>
              </div>
              <TrialNote className="mt-5 justify-center" />
              <p className="text-muted-foreground mt-7 text-xs">
                ¿Ya tienes una cuenta? Puedes entrar con tu correo y contraseña
                actuales.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border/70 bg-card/35 border-t px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1280px] gap-10 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <BrandLockup className="h-14 w-[170px]" />
            <p className="text-muted-foreground mt-4 max-w-sm text-sm leading-6">
              Conversaciones, clientes, oportunidades, automatización e
              Inteligencia Artificial en una misma operación.
            </p>
            <div className="text-muted-foreground mt-5 flex items-center gap-2 text-xs">
              <LockKeyhole className="size-4 text-emerald-400" />
              Acceso seguro para cada integrante
            </div>
          </div>

          <div>
            <p className="text-xs font-black tracking-[0.14em] uppercase">
              Producto
            </p>
            <nav className="text-muted-foreground mt-4 flex flex-col gap-3 text-sm">
              <Link href="#funciones" className="hover:text-foreground">
                Funciones
              </Link>
              <Link href="#integraciones" className="hover:text-foreground">
                Integraciones
              </Link>
              <Link href="#planes" className="hover:text-foreground">
                Planes
              </Link>
              <Link href="#preguntas" className="hover:text-foreground">
                Preguntas frecuentes
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-xs font-black tracking-[0.14em] uppercase">
              Legal
            </p>
            <div className="text-muted-foreground mt-4 flex flex-col gap-3 text-sm">
              <span title="Documento próximamente disponible">
                Términos y condiciones
                <span className="text-primary ml-1.5 text-[9px] font-bold uppercase">
                  Próximamente
                </span>
              </span>
              <span title="Documento próximamente disponible">
                Política de privacidad
                <span className="text-primary ml-1.5 text-[9px] font-bold uppercase">
                  Próximamente
                </span>
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-black tracking-[0.14em] uppercase">
              Acceso
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/signup"
                className="text-primary inline-flex items-center gap-1 font-bold"
              >
                Comenzar gratis
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="border-border/70 text-muted-foreground mx-auto mt-10 flex max-w-[1280px] flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Nexora CRM.</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="size-3.5 text-emerald-400" />
              Plataforma omnicanal
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CloudCog className="text-primary size-3.5" />
              Operación centralizada
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
