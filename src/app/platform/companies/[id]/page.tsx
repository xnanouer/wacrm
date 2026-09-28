import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  History,
  MessageSquare,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { PlatformCompanyAiCard } from '@/components/platform/platform-company-ai-card';
import { PlatformCompanyBenefitsCard } from '@/components/platform/platform-company-benefits-card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { subscriptionStatusLabel } from '@/lib/billing/access';
import { getPlatformAccountDetail } from '@/lib/platform/accounts';
import {
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformRole,
} from '@/lib/platform/auth';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function PlatformCompanyPage(props: {
  params: Promise<{ id: string }>;
}) {
  let platform;
  try {
    platform = await requirePlatformRole('platform_support');
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) redirect('/login');
    if (error instanceof PlatformForbiddenError) redirect('/dashboard');
    throw error;
  }

  const { id } = await props.params;
  const detail = await getPlatformAccountDetail(id);
  if (!detail) notFound();

  const { overview } = detail;
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLockup compact />
          <Link
            href="/platform"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft /> Volver a empresas
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        <section className="surface-elevated relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="bg-primary/10 pointer-events-none absolute -top-20 -right-16 size-72 rounded-full blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-primary mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
                <Building2 className="size-4" /> Cuenta empresarial
              </div>
              <h1 className="text-foreground text-3xl font-bold tracking-tight">
                {overview.name}
              </h1>
              <p className="text-muted-foreground mt-2">
                {overview.ownerName ?? 'Administrador sin nombre'} ·{' '}
                {overview.ownerEmail ?? 'sin correo'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-3 py-1.5 text-xs font-semibold">
                {overview.planName}
              </span>
              <span className="border-border bg-muted rounded-full border px-3 py-1.5 text-xs font-semibold">
                {subscriptionStatusLabel(overview.subscriptionStatus)}
              </span>
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Integrantes', value: overview.users, icon: Users },
            { label: 'Contactos', value: overview.contacts, icon: Building2 },
            {
              label: 'Conversaciones',
              value: overview.conversations,
              icon: MessageSquare,
            },
            {
              label: 'Canales sociales',
              value:
                overview.socialChannels + (overview.whatsappStatus ? 1 : 0),
              icon: Wifi,
            },
          ].map((item) => (
            <article
              key={item.label}
              className="surface-elevated rounded-2xl p-5"
            >
              <item.icon className="text-primary mb-4 size-5" />
              <p className="text-foreground text-2xl font-bold">
                {item.value.toLocaleString('es-CL')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">{item.label}</p>
            </article>
          ))}
        </div>

        <section className="border-primary/20 bg-primary/5 flex gap-3 rounded-2xl border p-4">
          <Eye className="text-primary mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-foreground text-sm font-semibold">
              Vista administrativa segura
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              Esta pantalla muestra configuración y salud operativa. No abre ni
              mezcla las conversaciones privadas de la empresa.
            </p>
          </div>
        </section>

        {platform.role === 'platform_owner' && (
          <>
            <PlatformCompanyBenefitsCard
              accountId={overview.id}
              initialAiUsage={detail.aiUsage}
              initialCatalogCapacity={detail.catalogCapacity}
              initialChannelCapacity={detail.channelCapacity}
            />
            <PlatformCompanyAiCard
              accountId={overview.id}
              initialUsage={detail.aiUsage}
            />
          </>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <section className="surface-elevated overflow-hidden rounded-2xl xl:col-span-2">
            <div className="border-border border-b p-5">
              <h2 className="text-foreground flex items-center gap-2 font-semibold">
                <Users className="text-primary size-5" /> Equipo
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-muted/35 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-5 py-3">Usuario</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {detail.members.map((member) => (
                    <tr key={member.userId}>
                      <td className="px-5 py-4">
                        <p className="text-foreground font-medium">
                          {member.name ?? 'Sin nombre'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {member.email}
                        </p>
                      </td>
                      <td className="px-4 py-4 capitalize">
                        {member.accountRole}
                      </td>
                      <td className="text-muted-foreground px-4 py-4 text-xs">
                        {formatDate(member.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-elevated rounded-2xl p-5">
            <h2 className="text-foreground flex items-center gap-2 font-semibold">
              <CreditCard className="text-primary size-5" /> Suscripción
            </h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="text-foreground mt-1 font-medium">
                  {subscriptionStatusLabel(overview.subscriptionStatus)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fin de prueba</dt>
                <dd className="text-foreground mt-1">
                  {formatDate(overview.trialEndsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fin de gracia</dt>
                <dd className="text-foreground mt-1">
                  {formatDate(overview.graceEndsAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Motivo</dt>
                <dd className="text-foreground mt-1">
                  {overview.suspensionReason ?? 'Sin observaciones'}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-elevated rounded-2xl p-5">
            <h2 className="text-foreground flex items-center gap-2 font-semibold">
              <ShieldCheck className="text-primary size-5" /> Departamentos
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.departments.map((department) => (
                <span
                  key={department.id}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium',
                    department.isActive
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      : 'border-border bg-muted text-muted-foreground'
                  )}
                >
                  {department.name}
                </span>
              ))}
              {detail.departments.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No hay departamentos configurados.
                </p>
              )}
            </div>
          </section>

          <section className="surface-elevated rounded-2xl p-5">
            <h2 className="text-foreground flex items-center gap-2 font-semibold">
              <Wifi className="text-primary size-5" /> Canales
            </h2>
            <div className="mt-4 space-y-3">
              {detail.channels.map((channel) => (
                <div
                  key={channel.id}
                  className="border-border bg-muted/25 flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {channel.displayName}
                    </p>
                    <p className="text-muted-foreground text-xs capitalize">
                      {channel.channel}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-semibold',
                      channel.status === 'connected'
                        ? 'text-emerald-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    <CheckCircle2 className="size-3.5" /> {channel.status}
                  </span>
                </div>
              ))}
              {detail.channels.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No hay canales conectados.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="surface-elevated rounded-2xl p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            <History className="text-primary size-5" /> Historial administrativo
          </h2>
          <div className="mt-4 space-y-3">
            {detail.audit.map((event) => (
              <div
                key={event.id}
                className="border-border flex gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <CalendarDays className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {event.action}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {event.reason ?? 'Sin motivo adicional'} ·{' '}
                    {formatDate(event.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            {detail.audit.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Todavía no hay acciones administrativas.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
