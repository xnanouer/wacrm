'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BrainCircuit,
  ArrowRight,
  Building2,
  CreditCard,
  HardDrive,
  MessageSquare,
  Quote,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  subscriptionStatusLabel,
  type SubscriptionStatus,
} from '@/lib/billing/access';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import type {
  PlatformAccountOverview,
  PlatformRole,
  SaasPlanSummary,
} from '@/lib/platform/types';
import type { PlatformStorageOverview } from '@/lib/platform/storage-monitor-shared';

interface Props {
  accounts: PlatformAccountOverview[];
  plans: SaasPlanSummary[];
  platformRole: PlatformRole;
  platformEmail: string;
  storageOverview: PlatformStorageOverview | null;
}

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  trialing: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  past_due: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  suspended: 'border-red-500/30 bg-red-500/10 text-red-400',
  canceled: 'border-border bg-muted text-muted-foreground',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function PlatformCompanies({
  accounts,
  plans,
  platformRole,
  platformEmail,
  storageOverview,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<PlatformAccountOverview | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [planCode, setPlanCode] = useState('trial');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = platformRole === 'platform_owner';
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accounts;
    return accounts.filter((account) =>
      [account.name, account.ownerName, account.ownerEmail, account.planName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    );
  }, [accounts, query]);

  const totals = useMemo(
    () => ({
      active: accounts.filter((account) =>
        ['active', 'trialing', 'past_due'].includes(account.subscriptionStatus)
      ).length,
      suspended: accounts.filter(
        (account) => account.subscriptionStatus === 'suspended'
      ).length,
      users: accounts.reduce((sum, account) => sum + account.users, 0),
      conversations: accounts.reduce(
        (sum, account) => sum + account.conversations,
        0
      ),
    }),
    [accounts]
  );

  function openEditor(account: PlatformAccountOverview) {
    setEditing(account);
    setStatus(account.subscriptionStatus);
    setPlanCode(account.planCode);
    setReason(account.suspensionReason ?? '');
  }

  async function saveAccount() {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/platform/accounts/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, planCode, reason }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'No se pudo actualizar la empresa');
      toast.success('Empresa actualizada');
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1680px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <BrandLockup compact />
            <span className="border-primary/25 bg-primary/10 text-primary hidden rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex">
              Control de plataforma
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-foreground text-xs font-medium">
                {platformEmail}
              </p>
              <p className="text-muted-foreground text-[11px]">
                Acceso auditado
              </p>
            </div>
            {platformRole === 'platform_owner' && (
              <>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/support" />}
                >
                  <MessageSquare /> Soporte
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/motivational-quotes" />}
                >
                  <Quote /> Frases
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/storage" />}
                >
                  <HardDrive /> Capacidad
                  {storageOverview &&
                    storageOverview.activeAlerts.length > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {storageOverview.activeAlerts.length}
                      </span>
                    )}
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/activity" />}
                >
                  <Activity /> Actividad
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/payments" />}
                >
                  <CreditCard /> Pagos
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/platform/ai" />}
                >
                  <BrainCircuit /> IA global
                </Button>
              </>
            )}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Ir a mi empresa
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] space-y-7 px-4 py-7 sm:px-6 lg:px-8">
        <section className="border-primary/20 relative overflow-hidden rounded-3xl border bg-[linear-gradient(120deg,color-mix(in_oklab,var(--card)_97%,transparent),color-mix(in_oklab,var(--primary)_13%,var(--card)))] p-6 sm:p-8">
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative max-w-3xl">
            <div className="text-primary mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
              <ShieldCheck className="size-4" /> Nexora SaaS
            </div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
              Todas tus empresas, bajo control.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
              Revisa el estado operativo, planes, equipos y conexiones sin
              mezclar los datos privados de cada cliente.
            </p>
          </div>
        </section>

        {storageOverview && storageOverview.activeAlerts.length > 0 && (
          <Link
            href="/platform/storage"
            className="flex flex-col gap-4 rounded-2xl border border-red-500/30 bg-red-500/8 p-5 transition-colors hover:bg-red-500/12 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
                <HardDrive className="size-5" />
              </div>
              <div>
                <p className="text-foreground font-semibold">
                  Nexora necesita revisar su capacidad
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Hay {storageOverview.activeAlerts.length}{' '}
                  {storageOverview.activeAlerts.length === 1
                    ? 'alerta activa'
                    : 'alertas activas'}{' '}
                  de base de datos o archivos. El detalle indica qué empresa y
                  módulo concentran el consumo.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-sm font-semibold text-red-500">
              Revisar capacidad <ArrowRight className="size-4" />
            </span>
          </Link>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Empresas operativas',
              value: totals.active,
              icon: Building2,
              tone: 'text-emerald-400 bg-emerald-500/10',
            },
            {
              label: 'Empresas suspendidas',
              value: totals.suspended,
              icon: CreditCard,
              tone: 'text-red-400 bg-red-500/10',
            },
            {
              label: 'Usuarios administrados',
              value: totals.users,
              icon: Users,
              tone: 'text-sky-400 bg-sky-500/10',
            },
            {
              label: 'Conversaciones totales',
              value: totals.conversations,
              icon: MessageSquare,
              tone: 'text-primary bg-primary/10',
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="surface-elevated rounded-2xl p-5"
            >
              <div
                className={cn(
                  'mb-4 flex size-10 items-center justify-center rounded-xl',
                  metric.tone
                )}
              >
                <metric.icon className="size-5" />
              </div>
              <p className="text-foreground text-2xl font-bold">
                {metric.value.toLocaleString('es-CL')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {metric.label}
              </p>
            </article>
          ))}
        </section>

        <section className="surface-elevated overflow-hidden rounded-2xl">
          <div className="border-border flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-foreground text-lg font-semibold">
                Empresas
              </h2>
              <p className="text-muted-foreground text-sm">
                {accounts.length} cuentas registradas
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar empresa o administrador..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-muted/35 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Equipo
                  </th>
                  <th className="px-4 py-3 text-center font-semibold">
                    Conversaciones
                  </th>
                  <th className="px-4 py-3 font-semibold">WhatsApp</th>
                  <th className="px-4 py-3 font-semibold">Alta</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {filtered.map((account) => (
                  <tr
                    key={account.id}
                    className="hover:bg-muted/25 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <p className="text-foreground font-semibold">
                        {account.name}
                      </p>
                      <p className="text-muted-foreground mt-0.5 max-w-[260px] truncate text-xs">
                        {account.ownerName ?? 'Sin propietario identificado'} ·{' '}
                        {account.ownerEmail ?? 'sin correo'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
                          STATUS_STYLE[account.subscriptionStatus]
                        )}
                      >
                        {subscriptionStatusLabel(account.subscriptionStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-foreground font-medium">
                        {account.planName}
                      </p>
                      {account.subscriptionStatus === 'past_due' && (
                        <p className="text-muted-foreground text-xs">
                          Gracia hasta {formatDate(account.graceEndsAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center font-medium">
                      {account.users}
                    </td>
                    <td className="px-4 py-4 text-center font-medium">
                      {account.conversations}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Wifi
                          className={cn(
                            'size-4',
                            account.whatsappStatus === 'connected'
                              ? 'text-emerald-400'
                              : 'text-muted-foreground'
                          )}
                        />
                        <span>
                          {account.whatsappStatus === 'connected'
                            ? 'Conectado'
                            : 'Sin conectar'}
                        </span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-4 text-xs">
                      {formatDate(account.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          nativeButton={false}
                          render={
                            <Link href={`/platform/companies/${account.id}`} />
                          }
                        >
                          Ver <ArrowRight />
                        </Button>
                        {canManage && (
                          <Button
                            variant="outline"
                            onClick={() => openEditor(account)}
                          >
                            <Settings2 /> Administrar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-12 text-center">
              <Building2 className="size-8" />
              <p>No encontramos empresas con esa busqueda.</p>
            </div>
          )}
        </section>
      </main>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Administrar {editing?.name}</DialogTitle>
            <DialogDescription>
              Cambia el plan o el acceso. Toda modificación quedará registrada.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <label className="grid gap-2 text-sm font-medium">
              Plan
              <select
                value={planCode}
                onChange={(event) => setPlanCode(event.target.value)}
                className="border-input bg-background focus:ring-ring/40 h-10 rounded-lg border px-3 outline-none focus:ring-2"
              >
                {plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Estado de acceso
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as SubscriptionStatus)
                }
                className="border-input bg-background focus:ring-ring/40 h-10 rounded-lg border px-3 outline-none focus:ring-2"
              >
                <option value="trialing">En prueba — {TRIAL_DAYS} días</option>
                <option value="active">Activa</option>
                <option value="past_due">
                  Pago pendiente — 5 días de gracia
                </option>
                <option value="suspended">Suspendida</option>
                <option value="canceled">Cancelada</option>
              </select>
            </label>

            {(status === 'suspended' || status === 'canceled') && (
              <label className="grid gap-2 text-sm font-medium">
                Motivo obligatorio
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ejemplo: factura vencida sin regularización"
                  className="border-input bg-background focus:ring-ring/40 rounded-lg border p-3 outline-none focus:ring-2"
                />
              </label>
            )}

            <div className="border-border bg-muted/35 text-muted-foreground flex gap-3 rounded-xl border p-3 text-xs leading-5">
              <Activity className="text-primary mt-0.5 size-4 shrink-0" />
              Al suspender, el equipo pierde acceso operativo inmediatamente.
              Los datos no se eliminan y tú conservas acceso desde este panel.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={saveAccount} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
