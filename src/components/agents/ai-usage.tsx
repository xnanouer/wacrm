'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Gauge,
  Loader2,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { AiUsageSummary } from '@/lib/ai/points/types';
import { cn } from '@/lib/utils';

const formatNumber = (value: number) => value.toLocaleString('es-CL');
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

export function AiUsage() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/usage', { cache: 'no-store' });
      const data = (await response.json()) as {
        usage?: AiUsageSummary;
        error?: string;
      };
      if (!response.ok || !data.usage) {
        throw new Error(data.error ?? 'No se pudo cargar el consumo.');
      }
      setUsage(data.usage);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cargar el consumo.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-16">
        <Loader2 className="mr-2 size-4 animate-spin" /> Calculando consumo...
      </div>
    );
  }
  if (!usage) return null;

  const alertLevel =
    usage.usagePercentage >= 100
      ? 100
      : usage.usagePercentage >= 90
        ? 90
        : usage.usagePercentage >= 75
          ? 75
          : 0;

  return (
    <div className="space-y-6">
      <div className="border-primary/20 from-primary/10 to-card flex flex-col gap-4 rounded-xl border bg-gradient-to-r p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <WalletCards className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              ¿Necesitas más capacidad de IA?
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Revisa los paquetes disponibles y simula tu nuevo saldo.
            </p>
          </div>
        </div>
        <Link
          href="/plans#point-packages"
          className={buttonVariants({
            className: 'w-full sm:w-auto',
          })}
        >
          Comprar más puntos
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>

      {alertLevel > 0 && (
        <div
          className={cn(
            'flex gap-3 rounded-xl border p-4',
            alertLevel >= 100
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          )}
        >
          <AlertTriangle
            className={cn(
              'mt-0.5 size-5 shrink-0',
              alertLevel >= 100 ? 'text-red-500' : 'text-amber-500'
            )}
          />
          <div>
            <p className="text-foreground text-sm font-semibold">
              {alertLevel >= 100
                ? 'Puntos mensuales agotados'
                : `Has utilizado ${usage.usagePercentage}% de tus puntos mensuales`}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {usage.totalAvailable > 0
                ? `Todavía tienes ${formatNumber(usage.totalAvailable)} puntos disponibles, incluyendo recargas.`
                : 'Las nuevas solicitudes de IA se detendrán hasta la renovación o una recarga.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Disponibles',
            value: usage.totalAvailable,
            icon: WalletCards,
          },
          {
            label: 'Consumidos este mes',
            value: usage.monthlyUsed,
            icon: Activity,
          },
          {
            label: 'Incluidos en el plan',
            value: usage.monthlyIncluded,
            icon: Gauge,
          },
          {
            label: 'Puntos adicionales',
            value: usage.additionalAvailable,
            icon: Sparkles,
          },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-5">
              <metric.icon className="text-primary mb-4 size-5" />
              <p className="text-foreground text-2xl font-bold">
                {formatNumber(metric.value)}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {metric.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ciclo mensual</CardTitle>
          <CardDescription>
            Los puntos incluidos se renuevan el {formatDate(usage.cycleEndsAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-3 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                usage.usagePercentage >= 100
                  ? 'bg-red-500'
                  : usage.usagePercentage >= 75
                    ? 'bg-amber-500'
                    : 'bg-primary'
              )}
              style={{ width: `${Math.min(100, usage.usagePercentage)}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-xs">
            <span>
              {formatNumber(usage.monthlyUsed)} de{' '}
              {formatNumber(usage.monthlyIncluded)}
            </span>
            <span>{usage.usagePercentage}%</span>
          </div>
          {usage.monthlyReserved > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {formatNumber(usage.monthlyReserved)} puntos están reservados por
              solicitudes en proceso.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consumo por función</CardTitle>
            <CardDescription>Distribución del ciclo actual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {usage.distribution.map((item) => (
              <div
                key={item.actionKey}
                className="border-border flex items-center justify-between border-b pb-3 last:border-0"
              >
                <span className="text-foreground text-sm">{item.label}</span>
                <span className="text-sm font-semibold">
                  {formatNumber(item.points)} pts
                </span>
              </div>
            ))}
            {usage.distribution.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Todavía no hay consumo en este ciclo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Actividad reciente</CardTitle>
              <CardDescription>Últimas solicitudes de IA.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={load}>
              Actualizar
            </Button>
          </CardHeader>
          <CardContent className="max-h-80 space-y-3 overflow-y-auto">
            {usage.history.map((item) => (
              <div
                key={item.id}
                className="border-border flex items-center justify-between gap-4 border-b pb-3 last:border-0"
              >
                <div>
                  <p className="text-foreground text-sm">{item.label}</p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                    <CalendarClock className="size-3" />
                    {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs font-semibold">
                  {item.status === 'completed'
                    ? `${formatNumber(item.points)} pts`
                    : 'Liberada'}
                </span>
              </div>
            ))}
            {usage.history.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No hay actividad reciente.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
