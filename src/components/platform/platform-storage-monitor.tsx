'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Database,
  FileStack,
  HardDrive,
  RefreshCw,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  storageAlertLevel,
  type PlatformStorageOverview,
} from '@/lib/platform/storage-monitor-shared';
import { cn } from '@/lib/utils';

const GIB = 1024 ** 3;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString('es-CL')} B`;
  if (bytes < 1024 ** 2)
    return `${(bytes / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 })} KB`;
  if (bytes < GIB)
    return `${(bytes / 1024 ** 2).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;
  return `${(bytes / GIB).toLocaleString('es-CL', { maximumFractionDigits: 2 })} GB`;
}

function formatModule(module: string): string {
  return module.charAt(0).toUpperCase() + module.slice(1);
}

function isStorageOverview(value: unknown): value is PlatformStorageOverview {
  return (
    typeof value === 'object' &&
    value !== null &&
    'snapshotId' in value &&
    'databasePercent' in value &&
    'storagePercent' in value
  );
}

function toneForPercent(percent: number) {
  const level = storageAlertLevel(percent);
  if (level === 90)
    return {
      bar: 'bg-red-500',
      text: 'text-red-500',
      panel: 'border-red-500/25 bg-red-500/8',
      label: 'Crítico',
    };
  if (level === 80)
    return {
      bar: 'bg-orange-500',
      text: 'text-orange-500',
      panel: 'border-orange-500/25 bg-orange-500/8',
      label: 'Atención',
    };
  if (level === 60)
    return {
      bar: 'bg-amber-500',
      text: 'text-amber-500',
      panel: 'border-amber-500/25 bg-amber-500/8',
      label: 'Revisar',
    };
  return {
    bar: 'bg-emerald-500',
    text: 'text-emerald-500',
    panel: 'border-emerald-500/20 bg-emerald-500/7',
    label: 'Saludable',
  };
}

function CapacityCard({
  title,
  description,
  used,
  capacity,
  percent,
  icon: Icon,
}: {
  title: string;
  description: string;
  used: number;
  capacity: number;
  percent: number;
  icon: typeof Database;
}) {
  const tone = toneForPercent(percent);
  return (
    <article className={cn('rounded-3xl border p-6', tone.panel)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-background/75 flex size-11 items-center justify-center rounded-2xl shadow-sm">
            <Icon className={cn('size-5', tone.text)} />
          </div>
          <div>
            <h2 className="text-foreground text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
        </div>
        <span className={cn('text-xs font-bold uppercase', tone.text)}>
          {tone.label}
        </span>
      </div>
      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-foreground text-3xl font-bold tracking-tight">
            {percent.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatBytes(used)} de {formatBytes(capacity)}
          </p>
        </div>
        <p className="text-muted-foreground text-right text-xs">
          Libre
          <strong className="text-foreground mt-1 block text-sm">
            {formatBytes(Math.max(capacity - used, 0))}
          </strong>
        </p>
      </div>
      <div className="bg-muted mt-5 h-2.5 overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full transition-all', tone.bar)}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-[11px]">
        <span>0%</span>
        <span>60%</span>
        <span>80%</span>
        <span>90%</span>
        <span>100%</span>
      </div>
    </article>
  );
}

export function PlatformStorageMonitor({
  initialOverview,
}: {
  initialOverview: PlatformStorageOverview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [databaseCapacityGb, setDatabaseCapacityGb] = useState(
    (initialOverview.databaseCapacityBytes / GIB).toString()
  );
  const [storageCapacityGb, setStorageCapacityGb] = useState(
    (initialOverview.storageCapacityBytes / GIB).toString()
  );

  const maxPercent = Math.max(
    overview.databasePercent,
    overview.storagePercent
  );
  const overallTone = toneForPercent(maxPercent);
  const unassignedDatabase = Math.max(
    overview.databaseBytes -
      overview.accounts.reduce(
        (total, account) => total + account.databaseBytes,
        0
      ),
    0
  );

  const sortedAlerts = useMemo(
    () =>
      [...overview.activeAlerts].sort(
        (left, right) => right.threshold - left.threshold
      ),
    [overview.activeAlerts]
  );

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/platform/storage', {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as
        PlatformStorageOverview | { error?: string } | null;
      if (!response.ok || !isStorageOverview(payload))
        throw new Error(
          payload && 'error' in payload
            ? payload.error
            : 'No se pudo actualizar la medición.'
        );
      setOverview(payload);
      toast.success('Capacidad actualizada');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar.'
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function saveCapacity() {
    setSaving(true);
    try {
      const response = await fetch('/api/platform/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseCapacityGb, storageCapacityGb }),
      });
      const payload = (await response.json().catch(() => null)) as
        PlatformStorageOverview | { error?: string } | null;
      if (!response.ok || !isStorageOverview(payload))
        throw new Error(
          payload && 'error' in payload
            ? payload.error
            : 'No se pudieron guardar los límites.'
        );
      setOverview(payload);
      toast.success('Capacidades actualizadas');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
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
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/platform" />}
            >
              <ArrowLeft /> Empresas
            </Button>
          </div>
          <Button onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} />
            {refreshing ? 'Midiendo...' : 'Medir ahora'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] space-y-7 px-4 py-7 sm:px-6 lg:px-8">
        <section className="border-primary/20 relative overflow-hidden rounded-3xl border bg-[linear-gradient(120deg,color-mix(in_oklab,var(--card)_97%,transparent),color-mix(in_oklab,var(--primary)_13%,var(--card)))] p-6 sm:p-8">
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-primary mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
                <HardDrive className="size-4" /> Capacidad Nexora
              </div>
              <h1 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
                Uso de base de datos y archivos
              </h1>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
                Alertas persistentes al 60%, 80% y 90%, con desglose por empresa
                y módulo.
              </p>
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold',
                overallTone.panel,
                overallTone.text
              )}
            >
              {maxPercent >= 60 ? (
                <AlertTriangle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Estado {overallTone.label.toLowerCase()}
            </div>
          </div>
        </section>

        {sortedAlerts.length > 0 && (
          <section className="space-y-3">
            {sortedAlerts.map((alert) => (
              <article
                key={alert.id}
                className={cn(
                  'flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between',
                  toneForPercent(alert.threshold).panel
                )}
              >
                <div className="flex gap-3">
                  <AlertTriangle
                    className={cn(
                      'mt-0.5 size-5 shrink-0',
                      toneForPercent(alert.threshold).text
                    )}
                  />
                  <div>
                    <p className="text-foreground font-semibold">
                      {alert.resourceType === 'database'
                        ? 'Base de datos'
                        : 'Archivos'}{' '}
                      superó el {alert.threshold}%
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Principal consumo:{' '}
                      {alert.topAccountName ?? 'Sin atribuir'}
                      {alert.topModule
                        ? ` · ${formatModule(alert.topModule)}`
                        : ''}
                    </p>
                  </div>
                </div>
                <strong className={toneForPercent(alert.threshold).text}>
                  {alert.usagePercent.toLocaleString('es-CL', {
                    maximumFractionDigits: 1,
                  })}
                  %
                </strong>
              </article>
            ))}
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-2">
          <CapacityCard
            title="Base de datos"
            description="Tablas, mensajes, contactos e índices de PostgreSQL."
            used={overview.databaseBytes}
            capacity={overview.databaseCapacityBytes}
            percent={overview.databasePercent}
            icon={Database}
          />
          <CapacityCard
            title="Archivos"
            description={`${overview.storageFiles.toLocaleString('es-CL')} imágenes, audios, documentos y PDF.`}
            used={overview.storageBytes}
            capacity={overview.storageCapacityBytes}
            percent={overview.storagePercent}
            icon={FileStack}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <article className="surface-elevated overflow-hidden rounded-2xl">
            <div className="border-border border-b p-5">
              <h2 className="text-foreground text-lg font-semibold">
                Consumo por empresa
              </h2>
              <p className="text-muted-foreground text-sm">
                Identifica inmediatamente qué cliente y módulo está creciendo.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/35 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-4 py-3">Módulo principal</th>
                    <th className="px-4 py-3 text-right">Base de datos</th>
                    <th className="px-4 py-3 text-right">Archivos</th>
                    <th className="px-5 py-3 text-right">Total medido</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {overview.accounts.map((account) => (
                    <tr key={account.accountId}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                            <Building2 className="size-4" />
                          </div>
                          <div>
                            <p className="text-foreground font-semibold">
                              {account.accountName}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {account.fileCount.toLocaleString('es-CL')}{' '}
                              archivos
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {account.topModule
                          ? formatModule(account.topModule)
                          : 'Sin datos'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatBytes(account.databaseBytes)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {formatBytes(account.storageBytes)}
                      </td>
                      <td className="text-foreground px-5 py-4 text-right font-semibold">
                        {formatBytes(account.totalBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overview.accounts.length === 0 && (
              <p className="text-muted-foreground p-10 text-center">
                Todavía no hay consumo atribuible a empresas.
              </p>
            )}
          </article>

          <article className="surface-elevated rounded-2xl p-5">
            <h2 className="text-foreground text-lg font-semibold">
              Consumo por módulo
            </h2>
            <p className="text-muted-foreground mb-5 text-sm">
              Archivos reales y estimación de datos por filas.
            </p>
            <div className="space-y-3">
              {overview.modules.map((module) => (
                <div
                  key={module.module}
                  className="border-border bg-muted/25 rounded-xl border p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-foreground font-medium">
                      {formatModule(module.module)}
                    </p>
                    <strong>{formatBytes(module.totalBytes)}</strong>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Datos {formatBytes(module.databaseBytes)} · Archivos{' '}
                    {formatBytes(module.storageBytes)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="surface-elevated rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-foreground text-lg font-semibold">
                Capacidad contratada
              </h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                Actualiza estos valores cuando cambies de plan en Supabase. Las
                alertas se recalculan inmediatamente.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_180px_auto] sm:items-end">
              <label className="grid gap-1.5 text-sm font-medium">
                Base de datos (GB)
                <Input
                  type="number"
                  min="0.01"
                  max="10240"
                  step="0.01"
                  value={databaseCapacityGb}
                  onChange={(event) =>
                    setDatabaseCapacityGb(event.target.value)
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Archivos (GB)
                <Input
                  type="number"
                  min="0.01"
                  max="10240"
                  step="0.01"
                  value={storageCapacityGb}
                  onChange={(event) => setStorageCapacityGb(event.target.value)}
                />
              </label>
              <Button onClick={saveCapacity} disabled={saving}>
                <Save /> {saving ? 'Guardando...' : 'Guardar límites'}
              </Button>
            </div>
          </div>
          <div className="border-border bg-muted/25 text-muted-foreground mt-5 rounded-xl border p-4 text-xs leading-5">
            La cifra global de PostgreSQL es real. El desglose de base de datos
            por empresa es una estimación del tamaño de sus filas y no incluye
            índices ni componentes internos. Quedan{' '}
            {formatBytes(unassignedDatabase)} de base global sin atribuir,
            incluyendo estructura e índices.
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Última medición:{' '}
            {new Intl.DateTimeFormat('es-CL', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(overview.measuredAt))}
          </p>
        </section>
      </main>
    </div>
  );
}
