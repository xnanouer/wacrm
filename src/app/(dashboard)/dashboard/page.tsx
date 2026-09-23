'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import {
  ArrowRight,
  Building2,
  Camera,
  ClockAlert,
  DollarSign,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { validateCompanyLogo } from '@/components/account/company-logo-picker';

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadPriorityWaitingCount,
  loadResponseTime,
} from '@/lib/dashboard/queries';
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types';

import { MetricCard } from '@/components/dashboard/metric-card';
import { SkeletonCard } from '@/components/dashboard/skeleton';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { ConversationsChart } from '@/components/dashboard/conversations-chart';
import { PipelineDonut } from '@/components/dashboard/pipeline-donut';
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { TicketAnalyticsPanel } from '@/components/dashboard/ticket-analytics-panel';
import { DailyMotivationalQuoteCard } from '@/components/dashboard/daily-motivational-quote';
import { getChileGreeting } from '@/lib/time/greeting';

type RangeDays = 7 | 30 | 90;

const MAX_DASHBOARD_AVATAR_BYTES = 2 * 1024 * 1024;
const DASHBOARD_AVATAR_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export default function DashboardPage() {
  const {
    defaultCurrency,
    profile,
    account,
    user,
    refreshProfile,
    canEditSettings,
  } = useAuth();
  const companyLogoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [companyLogoSaving, setCompanyLogoSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [priorityWaitingCount, setPriorityWaitingCount] = useState(0);

  const [range, setRange] = useState<RangeDays>(30);
  // Keep a cache per range so switching tabs doesn't re-fetch what we
  // already have. Ranges the user hasn't opened yet stay null and
  // trigger a fetch on first view.
  const [series, setSeries] = useState<
    Record<RangeDays, ConversationsSeriesPoint[] | null>
  >({
    7: null,
    30: null,
    90: null,
  });
  const [seriesLoading, setSeriesLoading] = useState(true);

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(
    null
  );
  const [responseTimeLoading, setResponseTimeLoading] = useState(true);

  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  async function handleCompanyLogoPick(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !account || !canEditSettings || companyLogoSaving) return;

    const validationError = validateCompanyLogo(file);
    if (validationError) {
      toast.error('No pudimos usar esa imagen', {
        description: validationError,
      });
      return;
    }

    setCompanyLogoSaving(true);
    try {
      const form = new FormData();
      form.set('logo', file);
      const response = await fetch('/api/account/logo', {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo subir el logo');
      }

      await refreshProfile();
      toast.success('Logo de la empresa actualizado');
    } catch (error) {
      toast.error('No se pudo actualizar el logo', {
        description:
          error instanceof Error ? error.message : 'Intenta nuevamente.',
      });
    } finally {
      setCompanyLogoSaving(false);
    }
  }

  async function handleAvatarPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user || avatarSaving) return;

    if (!DASHBOARD_AVATAR_TYPES.has(file.type)) {
      toast.error('Formato no compatible', {
        description: 'Utiliza una imagen PNG, JPG, WebP o GIF.',
      });
      return;
    }
    if (file.size > MAX_DASHBOARD_AVATAR_BYTES) {
      toast.error('La imagen es demasiado grande', {
        description: 'La fotografía puede pesar hasta 2 MB.',
      });
      return;
    }

    setAvatarSaving(true);
    try {
      const form = new FormData();
      form.set('avatar', file);
      const response = await fetch('/api/account/avatar', {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'No se pudo subir la fotografía.');
      }

      await refreshProfile();
      toast.success('Fotografía actualizada');
    } catch (error) {
      toast.error('No se pudo actualizar la fotografía', {
        description:
          error instanceof Error ? error.message : 'Intenta nuevamente.',
      });
    } finally {
      setAvatarSaving(false);
    }
  }

  const loadAll = useCallback(() => {
    const db = createClient();

    // Kick everything off in parallel. Each block has its own
    // setState + finally so a slow query doesn't hold up faster
    // sections — each widget shows its own skeleton independently.
    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false));

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false));

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false));

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false));

    // Fetch up to 50 so the biggest page-size option in the feed
    // (50 rows) is already in memory — switching sizes then becomes
    // a pure client-side slice with no extra round trip.
    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    let cancelled = false;

    const refreshPriorityWaitingCount = () => {
      void loadPriorityWaitingCount(createClient())
        .then((count) => {
          if (!cancelled) setPriorityWaitingCount(count);
        })
        .catch((error: unknown) => {
          // The priority card is supplemental: a temporary schema-cache or
          // network failure must never replace the whole dashboard with the
          // Next development error overlay. Keep the last successful count
          // and leave a compact diagnostic for local troubleshooting.
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'object' &&
                  error !== null &&
                  'message' in error &&
                  typeof error.message === 'string'
                ? error.message
                : 'No se pudo actualizar el contador';
          console.warn(
            '[dashboard] priority waiting count unavailable:',
            message
          );
        });
    };

    refreshPriorityWaitingCount();
    const interval = window.setInterval(refreshPriorityWaitingCount, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const companyLogo = (
    <Avatar className="border-primary/20 bg-card size-20 rounded-3xl border shadow-md sm:size-24">
      {account?.logo_url ? (
        <AvatarImage
          src={account.logo_url}
          alt={`Logo de ${account.name}`}
          className="object-contain"
        />
      ) : null}
      <AvatarFallback className="bg-primary/10 text-primary rounded-2xl">
        <Building2 className="size-8 sm:size-10" />
      </AvatarFallback>
    </Avatar>
  );

  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r);
      if (series[r] !== null) return;
      setSeriesLoading(true);
      const db = createClient();
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false));
    },
    [series]
  );

  return (
    <div className="nexora-page-stack">
      <section className="border-primary/12 relative overflow-hidden rounded-[28px] border bg-[linear-gradient(115deg,color-mix(in_oklab,var(--card)_98%,transparent),color-mix(in_oklab,var(--primary)_7%,var(--card)))] px-6 py-7 shadow-[0_30px_90px_-66px_var(--primary)] sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <div className="subtle-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,black,transparent_72%)] opacity-35" />
        <div className="bg-primary/15 pointer-events-none absolute -top-20 -right-14 size-64 rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="relative shrink-0">
                <input
                  ref={companyLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={!canEditSettings || companyLogoSaving}
                  onChange={handleCompanyLogoPick}
                />
                {canEditSettings ? (
                  <button
                    type="button"
                    onClick={() => companyLogoInputRef.current?.click()}
                    disabled={companyLogoSaving}
                    className="group focus-visible:ring-primary relative block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    aria-label="Cambiar logo de la empresa"
                    title="Cambiar logo de la empresa"
                  >
                    {companyLogo}
                    <span className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {companyLogoSaving ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        <Camera className="size-5" />
                      )}
                      <span className="mt-1 text-[10px] font-semibold">
                        {companyLogoSaving ? 'Subiendo' : 'Cambiar'}
                      </span>
                    </span>
                  </button>
                ) : (
                  companyLogo
                )}
              </div>
              <div className="min-w-0">
                <p className="text-foreground truncate text-base font-bold sm:text-lg">
                  {account?.name || 'Tu empresa'}
                </p>
                <div className="text-primary mt-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase">
                  <Sparkles className="size-3" />
                  Centro de operaciones
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarPick}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarSaving}
                  className="group focus-visible:ring-primary relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  aria-label="Cambiar fotografía de usuario"
                  title="Cambiar fotografía"
                >
                  <Avatar className="border-background size-18 border-2 shadow-md sm:size-20">
                    {profile?.avatar_url ? (
                      <AvatarImage
                        src={profile.avatar_url}
                        alt={profile.full_name || 'Ejecutivo'}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                      {(profile?.full_name || profile?.email || 'U')
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {avatarSaving ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Camera className="size-5" />
                    )}
                    <span className="mt-0.5 text-[9px] font-semibold">
                      {avatarSaving ? 'Subiendo' : 'Cambiar'}
                    </span>
                  </span>
                </button>
              </div>
              <h2 className="text-foreground text-2xl font-bold tracking-[-0.035em] sm:text-3xl">
                {getChileGreeting()}
                {profile?.full_name
                  ? `, ${profile.full_name.split(' ')[0]}`
                  : ''}
                .
                <span className="text-muted-foreground">
                  {' '}
                  Todo tu equipo, en un solo lugar.
                </span>
              </h2>
            </div>
            <DailyMotivationalQuoteCard />
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 self-start lg:min-w-80 lg:self-center">
            {priorityWaitingCount > 0 ? (
              <Link
                href="/inbox"
                className="group flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/9 px-4 py-3 text-left shadow-sm transition-colors hover:border-amber-500/40 hover:bg-amber-500/13"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/14 text-amber-600 dark:text-amber-400">
                  <ClockAlert className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-black tracking-[0.12em] text-amber-700 uppercase dark:text-amber-300">
                    Atención prioritaria
                  </span>
                  <span className="text-foreground mt-0.5 block text-sm font-semibold">
                    {priorityWaitingCount}{' '}
                    {priorityWaitingCount === 1
                      ? 'conversación lleva'
                      : 'conversaciones llevan'}{' '}
                    más de 10 min esperando
                  </span>
                </span>
                <ArrowRight className="ml-auto size-4 shrink-0 text-amber-600 transition-transform group-hover:translate-x-0.5 dark:text-amber-400" />
              </Link>
            ) : null}

            <Link
              href="/inbox"
              className="group bg-primary text-primary-foreground shadow-primary/20 hover:bg-primary-hover inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold shadow-lg transition-all hover:-translate-y-0.5"
            >
              Abrir bandeja
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <TicketAnalyticsPanel />

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Conversaciones activas"
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(
                  metrics.activeConversations.previous,
                  'nuevas hoy frente a ayer'
                ),
              }}
              tone="violet"
            />
            <MetricCard
              title="Contactos nuevos hoy"
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              delta={{
                sign:
                  metrics.newContactsToday.current -
                  metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current -
                    metrics.newContactsToday.previous,
                  'frente a ayer'
                ),
              }}
              tone="sky"
            />
            <MetricCard
              title="Oportunidades abiertas"
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              subtitle={`${metrics.openDealsCount} oportunidad${metrics.openDealsCount === 1 ? '' : 'es'} en curso`}
              tone="emerald"
            />
            <MetricCard
              title="Mensajes enviados hoy"
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              delta={{
                sign:
                  metrics.messagesSentToday.current -
                  metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current -
                    metrics.messagesSentToday.previous,
                  'frente a ayer'
                ),
              }}
              tone="amber"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      {/* items-stretch (the grid default) stretches the two columns to
          match the tallest sibling; adding h-full on each wrapper and
          on the inner panels makes both cards actually fill that
          stretched height so their rounded borders line up. Without
          this, the pipeline card rendered at its natural (shorter)
          height while the line chart drove the row height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  );
}

// ------------------------------------------------------------

function deltaLabel(delta: number, suffix: string): string {
  if (delta === 0) return `Sin cambios ${suffix}`;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toLocaleString()} ${suffix}`;
}
