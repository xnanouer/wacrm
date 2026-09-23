import {
  BarChart3,
  Bell,
  Bot,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  GitBranch,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  Settings,
  Sparkles,
  UserRound,
  UsersRound,
  Zap,
} from 'lucide-react';

import { BrandMark } from '@/components/brand/brand-mark';
import { cn } from '@/lib/utils';

const sidebarItems = [
  { icon: LayoutDashboard, label: 'Resumen', active: false },
  { icon: MessageCircle, label: 'Bandeja', active: true },
  { icon: UsersRound, label: 'Contactos', active: false },
  { icon: GitBranch, label: 'Oportunidades', active: false },
  { icon: Zap, label: 'Automatizaciones', active: false },
  { icon: Bot, label: 'Agente IA', active: false },
] as const;

const conversations = [
  {
    initials: 'CE',
    name: 'Cliente ejemplo',
    message: 'Necesito información sobre el servicio',
    time: 'Ahora',
    tone: 'bg-violet-500/15 text-violet-300',
    active: true,
  },
  {
    initials: 'CN',
    name: 'Consulta nueva',
    message: '¿Me puedes orientar?',
    time: '5 min',
    tone: 'bg-sky-500/15 text-sky-300',
    active: false,
  },
  {
    initials: 'SP',
    name: 'Solicitud pendiente',
    message: 'Gracias, quedo atento',
    time: '18 min',
    tone: 'bg-emerald-500/15 text-emerald-300',
    active: false,
  },
] as const;

function PreviewMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="border-border/70 bg-card/80 min-w-0 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-lg',
            tone
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-[8px] font-bold tracking-wider text-emerald-400 uppercase">
          Demo
        </span>
      </div>
      <p className="text-foreground mt-3 text-lg font-black">{value}</p>
      <p className="text-muted-foreground mt-0.5 truncate text-[9px]">
        {label}
      </p>
    </div>
  );
}

export function ProductPreview() {
  return (
    <div className="border-primary/20 bg-card/90 shadow-primary/10 relative overflow-hidden rounded-[26px] border p-2 shadow-2xl sm:p-3">
      <div className="bg-primary/20 pointer-events-none absolute -top-24 right-12 size-64 rounded-full blur-[90px]" />
      <div className="border-border/70 bg-background relative overflow-hidden rounded-[20px] border">
        <div className="border-border/70 bg-card/80 flex h-10 items-center justify-between border-b px-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-red-400/70" />
            <span className="size-2 rounded-full bg-amber-400/70" />
            <span className="size-2 rounded-full bg-emerald-400/70" />
          </div>
          <div className="border-border bg-muted/60 text-muted-foreground flex h-6 w-44 items-center justify-center rounded-md border text-[8px] sm:w-60">
            app.nexora.cl/inbox
          </div>
          <MoreHorizontal className="text-muted-foreground size-4" />
        </div>

        <div className="grid h-[430px] grid-cols-[54px_1fr] sm:h-[500px] sm:grid-cols-[150px_1fr] lg:h-[535px]">
          <aside className="border-border/70 bg-sidebar flex min-w-0 flex-col border-r">
            <div className="flex h-16 items-center px-3 sm:px-4">
              <BrandMark className="size-8 sm:hidden" />
              <div className="hidden items-center gap-2 sm:flex">
                <BrandMark className="size-8" />
                <div>
                  <p className="text-[11px] font-black tracking-[0.14em]">
                    NEXORA
                  </p>
                  <p className="text-primary text-[7px] tracking-[0.3em]">
                    CRM
                  </p>
                </div>
              </div>
            </div>
            <nav className="space-y-1 px-2" aria-label="Vista demostrativa">
              {sidebarItems.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    'flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-[10px] font-medium sm:justify-start',
                    item.active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="size-3.5 shrink-0" />
                  <span className="hidden truncate sm:block">{item.label}</span>
                </div>
              ))}
            </nav>
            <div className="mt-auto p-2">
              <div className="border-border/70 bg-card flex items-center justify-center gap-2 rounded-xl border p-2 sm:justify-start">
                <CircleUserRound className="text-primary size-6 shrink-0" />
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-[9px] font-semibold">
                    Equipo de ejemplo
                  </p>
                  <p className="text-muted-foreground text-[7px]">
                    Administrador
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <div className="min-w-0 overflow-hidden">
            <div className="border-border/70 bg-card/60 flex h-16 items-center justify-between border-b px-3 sm:px-4">
              <div>
                <p className="text-[11px] font-bold sm:text-sm">
                  Bandeja de atención
                </p>
                <p className="text-muted-foreground mt-0.5 text-[8px] sm:text-[10px]">
                  Conversaciones que necesitan a tu equipo
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="border-primary/20 bg-primary/10 text-primary hidden rounded-full border px-2 py-1 text-[8px] font-bold sm:inline-flex">
                  EN VIVO
                </span>
                <span className="border-border bg-card flex size-7 items-center justify-center rounded-lg border">
                  <Bell className="text-muted-foreground size-3.5" />
                </span>
              </div>
            </div>

            <div className="hidden grid-cols-4 gap-2 p-3 md:grid">
              <PreviewMetric
                icon={MessageCircle}
                label="Conversaciones"
                value="12"
                tone="bg-violet-500/15 text-violet-300"
              />
              <PreviewMetric
                icon={UsersRound}
                label="Contactos nuevos"
                value="8"
                tone="bg-sky-500/15 text-sky-300"
              />
              <PreviewMetric
                icon={GitBranch}
                label="Oportunidades"
                value="5"
                tone="bg-emerald-500/15 text-emerald-300"
              />
              <PreviewMetric
                icon={Clock3}
                label="Tiempo de respuesta"
                value="4m"
                tone="bg-amber-500/15 text-amber-300"
              />
            </div>

            <div className="border-border/70 grid h-[calc(100%_-_4rem)] min-w-0 border-t md:h-[calc(100%_-_10.5rem)] md:grid-cols-[minmax(190px,0.8fr)_minmax(260px,1.35fr)]">
              <div className="border-border/70 hidden min-w-0 border-r md:block">
                <div className="p-3">
                  <div className="border-border bg-muted/60 text-muted-foreground flex h-8 items-center gap-2 rounded-lg border px-2 text-[9px]">
                    <Search className="size-3" />
                    Buscar conversación
                  </div>
                </div>
                <div>
                  {conversations.map((conversation) => (
                    <div
                      key={conversation.name}
                      className={cn(
                        'border-border/60 flex gap-2 border-t p-3',
                        conversation.active && 'bg-primary/8'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full text-[8px] font-bold',
                          conversation.tone
                        )}
                      >
                        {conversation.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[9px] font-semibold">
                            {conversation.name}
                          </p>
                          <span className="text-muted-foreground text-[7px]">
                            {conversation.time}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 truncate text-[8px]">
                          {conversation.message}
                        </p>
                        <div className="mt-2 flex gap-1">
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[6px] text-emerald-400">
                            WhatsApp
                          </span>
                          {conversation.active ? (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[6px] text-amber-400">
                              Pendiente
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative flex min-w-0 flex-col overflow-hidden">
                <div className="border-border/70 bg-card/40 flex items-center justify-between border-b px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/15 text-primary flex size-7 items-center justify-center rounded-full text-[8px] font-bold">
                      CE
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold">
                        Cliente ejemplo
                      </p>
                      <p className="text-muted-foreground text-[7px]">
                        WhatsApp · Ventas
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <span className="border-border bg-card text-muted-foreground hidden items-center gap-1 rounded-md border px-2 py-1 text-[7px] sm:flex">
                      <UserRound className="size-2.5" />
                      Asignar
                      <ChevronDown className="size-2.5" />
                    </span>
                    <span className="bg-primary text-primary-foreground flex items-center gap-1 rounded-md px-2 py-1 text-[7px] font-bold">
                      <Check className="size-2.5" />
                      Aceptar
                    </span>
                  </div>
                </div>

                <div className="subtle-grid flex-1 space-y-2 overflow-hidden p-3 sm:p-4">
                  <div className="bg-muted text-foreground max-w-[82%] rounded-2xl rounded-bl-md px-3 py-2 text-[9px] leading-relaxed sm:max-w-[72%]">
                    Hola, necesito información sobre los servicios.
                    <p className="text-muted-foreground mt-1 text-[7px]">
                      10:24
                    </p>
                  </div>
                  <div className="bg-primary text-primary-foreground ml-auto max-w-[84%] rounded-2xl rounded-br-md px-3 py-2 text-[9px] leading-relaxed sm:max-w-[74%]">
                    ¡Claro! Cuéntame qué necesitas y te ayudo a encontrar la
                    mejor opción.
                    <p className="mt-1 flex items-center justify-end gap-1 text-[7px] opacity-70">
                      10:24 <Check className="size-2.5" />
                    </p>
                  </div>
                  <div className="border-primary/20 bg-card/90 ml-auto max-w-[88%] rounded-xl border p-2.5 sm:max-w-[78%]">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="text-primary size-3" />
                      <p className="text-primary text-[8px] font-bold">
                        Sugerencia del Agente IA
                      </p>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-[8px] leading-relaxed">
                      Puedes enviar información del servicio y ofrecer ayuda de
                      un ejecutivo.
                    </p>
                  </div>
                </div>

                <div className="border-border/70 bg-card/80 p-2.5">
                  <div className="border-border bg-muted/50 flex h-9 items-center gap-2 rounded-xl border px-3">
                    <span className="text-muted-foreground flex-1 text-[8px]">
                      Escribe un mensaje o usa una respuesta rápida…
                    </span>
                    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-lg">
                      <Send className="size-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-primary/20 bg-background/90 text-muted-foreground absolute right-5 bottom-5 hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] shadow-lg backdrop-blur md:flex">
        <BarChart3 className="text-primary size-3" />
        Vista demostrativa · Datos ilustrativos
        <Settings className="size-3" />
      </div>
    </div>
  );
}
