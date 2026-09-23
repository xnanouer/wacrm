import {
  Bell,
  Bot,
  Building2,
  CarFront,
  ContactRound,
  FileText,
  GitBranch,
  LayoutDashboard,
  LockKeyhole,
  Megaphone,
  MessageSquare,
  ReceiptText,
  Sparkles,
  Store,
  UtensilsCrossed,
  Workflow,
  Zap,
} from 'lucide-react';

const automotiveModules = [
  { label: 'Resumen', icon: LayoutDashboard, active: false },
  { label: 'Bandeja', icon: MessageSquare, active: false },
  { label: 'Notificaciones', icon: Bell, active: false },
  { label: 'Contactos', icon: ContactRound, active: false },
  { label: 'Catálogo', icon: CarFront, active: true },
  { label: 'Cotizaciones', icon: ReceiptText, active: false },
  { label: 'Oportunidades', icon: GitBranch, active: false },
  { label: 'Campañas', icon: Megaphone, active: false },
  { label: 'Automatizaciones', icon: Zap, active: false },
  { label: 'Flujos', icon: Workflow, active: false },
  { label: 'Agentes IA', icon: Bot, active: false },
] as const;

const automotiveMetrics = [
  { label: 'Oportunidades', value: '128', tone: 'text-violet-300' },
  { label: 'Cotizaciones', value: '84', tone: 'text-sky-300' },
  { label: 'Ventas ganadas', value: '32', tone: 'text-emerald-300' },
  { label: 'Tasa de cierre', value: '38%', tone: 'text-amber-300' },
] as const;

const upcomingVerticals = [
  {
    title: 'Inmobiliaria',
    description:
      'Gestiona propiedades, interesados y cierres de forma inteligente.',
    icon: Building2,
    tone: 'text-sky-300',
  },
  {
    title: 'Constructora',
    description:
      'Controla proyectos, presupuestos y proveedores en un solo lugar.',
    icon: Workflow,
    tone: 'text-amber-300',
  },
  {
    title: 'Restaurantes',
    description:
      'Centraliza reservas, pedidos, consultas y atención al cliente.',
    icon: UtensilsCrossed,
    tone: 'text-rose-300',
  },
  {
    title: 'Más rubros',
    description: 'Seguimos creando nuevas verticales para impulsar tu negocio.',
    icon: Store,
    tone: 'text-violet-300',
  },
] as const;

const verticalBenefits = [
  {
    title: 'Cotizaciones',
    description: 'Crea y envía cotizaciones profesionales en segundos.',
    icon: FileText,
  },
  {
    title: 'Catálogo',
    description: 'Administra tu inventario y mantenlo siempre al día.',
    icon: CarFront,
  },
  {
    title: 'Oportunidades',
    description: 'Da seguimiento a cada negocio y cierra más ventas.',
    icon: GitBranch,
  },
  {
    title: 'Automatizaciones',
    description: 'Automatiza tareas y flujos para ahorrar tiempo.',
    icon: Zap,
  },
  {
    title: 'Agentes IA',
    description: 'IA que trabaja contigo para vender más y mejor.',
    icon: Bot,
  },
] as const;

export function VerticalsSection() {
  return (
    <section
      id="rubros"
      className="relative overflow-hidden border-y border-white/8 bg-[#080711] px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_35%,rgba(124,58,237,0.18),transparent_38%),radial-gradient(circle_at_88%_18%,rgba(59,130,246,0.12),transparent_32%)]" />
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-[0.08]" />

      <div className="relative mx-auto max-w-[1440px]">
        <header className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-3.5 py-2 text-[10px] font-black tracking-[0.18em] text-violet-200 uppercase shadow-[0_0_30px_rgba(124,58,237,0.14)]">
            <Sparkles className="size-3.5" />
            Nuevas funciones
          </span>
          <h2 className="mt-6 text-3xl font-black tracking-[-0.045em] text-balance sm:text-4xl lg:text-5xl">
            Nexora se adapta a tu rubro
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Comienza con Automotora y descubre nuevas verticales que llegarán
            próximamente.
          </p>
        </header>

        <div className="mt-14 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="relative overflow-hidden rounded-[32px] border border-violet-400/30 bg-[linear-gradient(145deg,rgba(124,58,237,0.18),rgba(15,13,28,0.96)_42%,rgba(8,7,17,0.98))] p-5 shadow-[0_28px_90px_rgba(76,29,149,0.22)] sm:p-7 lg:p-8">
            <div className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-violet-500/20 blur-[100px]" />
            <div className="pointer-events-none absolute right-10 bottom-0 left-10 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex size-13 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-400/15 text-violet-200 shadow-[0_0_30px_rgba(139,92,246,0.18)]">
                  <CarFront className="size-6" />
                </span>
                <div>
                  <p className="text-xs font-black tracking-[0.14em] text-violet-300 uppercase">
                    Rubro activo
                  </p>
                  <h3 className="mt-1 text-2xl font-black tracking-[-0.035em] sm:text-3xl">
                    Automotora
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    Gestiona todo tu proceso comercial, desde el primer contacto
                    hasta la entrega del vehículo.
                  </p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-black tracking-[0.12em] text-emerald-300 uppercase">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-50 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
                </span>
                Disponible ahora
              </span>
            </div>

            <div className="relative mt-7 overflow-hidden rounded-[24px] border border-white/10 bg-[#090812]/90 shadow-2xl">
              <div className="flex h-10 items-center justify-between border-b border-white/8 bg-white/[0.025] px-4">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="size-2 rounded-full bg-rose-400/75" />
                  <span className="size-2 rounded-full bg-amber-300/75" />
                  <span className="size-2 rounded-full bg-emerald-300/75" />
                </div>
                <div className="flex items-center gap-2 text-[8px] font-bold tracking-[0.14em] text-slate-500 uppercase">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Operación en vivo
                </div>
              </div>

              <div className="grid sm:grid-cols-[172px_1fr]">
                <div className="border-b border-white/8 bg-[#0c0a18] p-3 sm:border-r sm:border-b-0">
                  <div className="mb-3 flex items-center gap-2 px-2 py-1.5">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-violet-500 text-[10px] font-black shadow-[0_0_20px_rgba(139,92,246,0.35)]">
                      N
                    </span>
                    <div>
                      <p className="text-[10px] font-black tracking-[0.12em]">
                        NEXORA
                      </p>
                      <p className="text-[7px] tracking-[0.16em] text-violet-300 uppercase">
                        Automotora
                      </p>
                    </div>
                  </div>
                  <nav
                    aria-label="Vista previa de módulos para automotoras"
                    className="grid grid-cols-2 gap-1 sm:grid-cols-1"
                  >
                    {automotiveModules.map((module) => (
                      <div
                        key={module.label}
                        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-[8px] font-semibold sm:text-[9px] ${
                          module.active
                            ? 'bg-violet-500/18 text-violet-200 ring-1 ring-violet-400/20'
                            : 'text-slate-500'
                        }`}
                      >
                        <module.icon className="size-3 shrink-0" />
                        <span className="truncate">{module.label}</span>
                      </div>
                    ))}
                  </nav>
                </div>

                <div className="min-w-0 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[9px] font-bold tracking-[0.14em] text-violet-300 uppercase">
                        Resumen comercial
                      </p>
                      <p className="mt-1 text-sm font-black">
                        Tu operación, en un vistazo
                      </p>
                    </div>
                    <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/[0.045] px-2.5 py-1 text-[8px] text-slate-400">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      Actualizado ahora
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {automotiveMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-xl border border-white/8 bg-white/[0.025] p-3"
                      >
                        <p className="text-[8px] leading-4 text-slate-500">
                          {metric.label}
                        </p>
                        <p
                          className={`mt-2 text-xl font-black tracking-[-0.04em] ${metric.tone}`}
                        >
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-[1.25fr_0.75fr]">
                    <div className="relative h-28 overflow-hidden rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <p className="text-[8px] font-bold text-slate-500">
                        Rendimiento comercial
                      </p>
                      <div className="absolute right-3 bottom-3 left-3 flex h-17 items-end gap-1.5">
                        {[38, 54, 44, 72, 58, 84, 68, 92, 76, 100].map(
                          (height, index) => (
                            <span
                              key={`${height}-${index}`}
                              className="flex-1 rounded-t-sm bg-gradient-to-t from-violet-700/60 to-violet-400"
                              style={{ height: `${height}%` }}
                            />
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex h-28 flex-col justify-between rounded-xl border border-white/8 bg-white/[0.025] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[8px] font-bold text-slate-500">
                          Equipo activo
                        </p>
                        <span className="text-[8px] font-bold text-emerald-300">
                          8 online
                        </span>
                      </div>
                      <div className="flex -space-x-1.5">
                        {['RO', 'NC', 'MV', 'AP'].map((initials, index) => (
                          <span
                            key={initials}
                            className="flex size-7 items-center justify-center rounded-full border-2 border-[#11101c] bg-violet-500/25 text-[7px] font-black text-violet-200"
                            style={{ opacity: 1 - index * 0.12 }}
                          >
                            {initials}
                          </span>
                        ))}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2">
            {upcomingVerticals.map((vertical) => (
              <article
                key={vertical.title}
                className="relative flex min-h-55 flex-col overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.025] p-5 transition-colors hover:border-violet-400/20 hover:bg-white/[0.04] sm:p-6"
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.025),transparent_45%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <span
                    className={`flex size-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.035] ${vertical.tone}`}
                  >
                    <vertical.icon className="size-5" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-black/15 px-2 py-1 text-[7px] font-black tracking-[0.11em] text-slate-500 uppercase">
                    <LockKeyhole className="size-2.5" />
                    Próximamente
                  </span>
                </div>
                <div className="relative mt-auto pt-8">
                  <h3 className="text-base font-black tracking-[-0.02em] text-slate-200">
                    {vertical.title}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {vertical.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-[28px] border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-5">
          {verticalBenefits.map((benefit) => (
            <article
              key={benefit.title}
              className="bg-[#0c0a16] p-5 transition-colors hover:bg-violet-500/[0.07] lg:p-6"
            >
              <benefit.icon className="size-5 text-violet-300" />
              <h3 className="mt-5 text-sm font-black">{benefit.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {benefit.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
