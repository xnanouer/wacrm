'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarCheck,
  CircleDot,
  Clock3,
  Laptop,
  MessageCircleQuestion,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  isActiveToday,
  type PlatformActivitySnapshot,
  type PlatformPresenceStatus,
} from '@/lib/platform/activity';

const EMPTY: PlatformActivitySnapshot = {
  generated_at: new Date(0).toISOString(),
  metrics: {
    online_now: 0,
    active_24h: 0,
    active_accounts_24h: 0,
    total_users: 0,
    total_accounts: 0,
    active_whatsapp: 0,
    open_support_cases: 0,
    future_bookings: 0,
  },
  users: [],
};

function dateLabel(value: string | null) {
  if (!value) return 'Sin actividad registrada';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

const STATUS: Record<PlatformPresenceStatus, { label: string; tone: string }> =
  {
    connected: { label: 'Conectado', tone: 'bg-emerald-500' },
    inactive: { label: 'Inactivo', tone: 'bg-amber-400' },
    disconnected: { label: 'Desconectado', tone: 'bg-slate-400' },
  };

export function PlatformActivity() {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<
    'all' | PlatformPresenceStatus | 'today'
  >('all');
  const [account, setAccount] = useState('all');
  const [role, setRole] = useState('all');
  const [plan, setPlan] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/platform/activity', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('No se pudo actualizar la actividad.');
      setSnapshot((await response.json()) as PlatformActivitySnapshot);
      setError('');
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Error inesperado.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const options = useMemo(
    () => ({
      accounts: Array.from(
        new Set(snapshot.users.map((user) => user.account_name))
      ).sort(),
      roles: Array.from(
        new Set(snapshot.users.map((user) => user.role))
      ).sort(),
      plans: Array.from(
        new Set(snapshot.users.map((user) => user.plan_code))
      ).sort(),
    }),
    [snapshot.users]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.users.filter((user) => {
      if (status === 'today' && !isActiveToday(user)) return false;
      if (
        status !== 'all' &&
        status !== 'today' &&
        user.presence_status !== status
      )
        return false;
      if (account !== 'all' && user.account_name !== account) return false;
      if (role !== 'all' && user.role !== role) return false;
      if (plan !== 'all' && user.plan_code !== plan) return false;
      if (
        needle &&
        ![user.full_name, user.email, user.account_name, user.current_path]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle))
      )
        return false;
      return true;
    });
  }, [snapshot.users, status, account, role, plan, query]);

  const metrics = [
    [
      'Conectados ahora',
      snapshot.metrics.online_now,
      CircleDot,
      'text-emerald-400',
    ],
    [
      'Activos en 24 horas',
      snapshot.metrics.active_24h,
      Clock3,
      'text-amber-400',
    ],
    [
      'Empresas activas hoy',
      snapshot.metrics.active_accounts_24h,
      Building2,
      'text-sky-400',
    ],
    [
      'Usuarios registrados',
      snapshot.metrics.total_users,
      Users,
      'text-primary',
    ],
    [
      'Empresas registradas',
      snapshot.metrics.total_accounts,
      Building2,
      'text-violet-400',
    ],
    [
      'WhatsApp activos',
      snapshot.metrics.active_whatsapp,
      Wifi,
      'text-emerald-400',
    ],
    [
      'Casos abiertos',
      snapshot.metrics.open_support_cases,
      MessageCircleQuestion,
      'text-orange-400',
    ],
    [
      'Reuniones futuras',
      snapshot.metrics.future_bookings,
      CalendarCheck,
      'text-cyan-400',
    ],
  ] as const;

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/90 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1680px] items-center justify-between px-4 sm:px-7">
          <div className="flex items-center gap-4">
            <BrandLockup compact />
            <span className="text-muted-foreground hidden text-sm sm:block">
              Actividad de la plataforma
            </span>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/platform" />}
          >
            <ArrowLeft /> Empresas
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] space-y-6 p-4 sm:p-7">
        <section className="border-primary/20 bg-card relative overflow-hidden rounded-3xl border p-6 sm:p-8">
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative">
            <p className="text-primary mb-2 flex items-center gap-2 text-xs font-bold tracking-[.16em] uppercase">
              <Activity className="size-4" /> En vivo
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Actividad de la plataforma
            </h1>
            <p className="text-muted-foreground mt-2">
              Datos reales de uso, actualizados cada 15 segundos. No se
              almacenan direcciones IP.
            </p>
          </div>
        </section>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-2xl border p-4 text-sm">
            {error}
          </div>
        )}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value, Icon, tone]) => (
            <article key={label} className="surface-elevated rounded-2xl p-5">
              <Icon className={cn('mb-4 size-5', tone)} />
              <p className="text-2xl font-bold">
                {loading ? '—' : value.toLocaleString('es-CL')}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">{label}</p>
            </article>
          ))}
        </section>

        <section className="surface-elevated overflow-hidden rounded-2xl">
          <div className="border-border grid gap-3 border-b p-5 lg:grid-cols-[1fr_repeat(4,minmax(130px,auto))]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar usuario, correo, empresa o ruta..."
            />
            <select
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              <option value="all">Todos</option>
              <option value="connected">Conectados ahora</option>
              <option value="today">Activos hoy</option>
              <option value="inactive">Inactivos</option>
              <option value="disconnected">Desconectados</option>
            </select>
            <select
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            >
              <option value="all">Todas las empresas</option>
              {options.accounts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="all">Todos los roles</option>
              {options.roles.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
            >
              <option value="all">Todos los planes</option>
              {options.plans.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/35 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Rol / plan</th>
                  <th className="px-4 py-3">Módulo actual</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Última actividad</th>
                  <th className="px-4 py-3">Inicio de sesión</th>
                  <th className="px-5 py-3">Dispositivo</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {filtered.map((user) => {
                  const meta = STATUS[user.presence_status];
                  return (
                    <tr key={user.user_id} className="hover:bg-muted/20">
                      <td className="px-5 py-4">
                        <p className="font-semibold">
                          {user.full_name ?? 'Sin nombre'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {user.email}
                        </p>
                      </td>
                      <td className="px-4 py-4">{user.account_name}</td>
                      <td className="px-4 py-4">
                        <p className="capitalize">{user.role}</p>
                        <p className="text-muted-foreground text-xs">
                          {user.plan_code}
                        </p>
                      </td>
                      <td className="text-muted-foreground px-4 py-4">
                        {user.current_path ?? 'Sin ruta'}
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn('size-2 rounded-full', meta.tone)}
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-4 text-xs">
                        {dateLabel(user.last_seen_at)}
                      </td>
                      <td className="text-muted-foreground px-4 py-4 text-xs">
                        {dateLabel(user.signed_in_at)}
                      </td>
                      <td className="px-5 py-4">
                        {user.device_type === 'mobile' ? (
                          <span className="flex items-center gap-2">
                            <Smartphone className="size-4" /> Móvil
                          </span>
                        ) : user.device_type === 'desktop' ? (
                          <span className="flex items-center gap-2">
                            <Laptop className="size-4" /> Escritorio
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length === 0 && (
            <p className="text-muted-foreground p-10 text-center">
              No hay usuarios para estos filtros.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
