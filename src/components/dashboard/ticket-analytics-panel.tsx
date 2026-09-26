'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  MessageCircleWarning,
  RefreshCw,
  TicketPlus,
  TimerReset,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/dashboard/metric-card';
import { Skeleton, SkeletonCard } from '@/components/dashboard/skeleton';
import { EmptyState } from '@/components/dashboard/empty-state';
import { createClient } from '@/lib/supabase/client';
import {
  buildTicketAnalyticsRange,
  loadTicketAnalytics,
  type TicketAnalytics,
  type TicketAnalyticsRangeDays,
  type TicketDailyMetric,
} from '@/lib/dashboard/ticket-analytics';
import type { AccountMember, Department } from '@/types';

interface WhatsAppOption {
  id: string;
  connection_name: string;
  display_name: string | null;
  display_phone: string | null;
  phone_number_id: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  open: 'Abierto',
  waiting: 'Esperando',
  closed: 'Cerrado',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  open: '#3b82f6',
  waiting: '#8b5cf6',
  closed: '#10b981',
};

export function TicketAnalyticsPanel() {
  const db = useMemo(() => createClient(), []);
  const requestId = useRef(0);

  const [rangeDays, setRangeDays] = useState<TicketAnalyticsRangeDays>(30);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [whatsappConfigId, setWhatsappConfigId] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [whatsappConfigs, setWhatsappConfigs] = useState<WhatsAppOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [analytics, setAnalytics] = useState<TicketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [departmentsResponse, membersResponse, whatsappResponse] =
          await Promise.all([
            fetch('/api/departments', { cache: 'no-store' }),
            fetch('/api/account/members', { cache: 'no-store' }),
            db
              .from('whatsapp_config')
              .select(
                'id, connection_name, display_name, display_phone, phone_number_id'
              )
              .order('created_at'),
          ]);

        if (!departmentsResponse.ok || !membersResponse.ok) {
          throw new Error('No se pudieron cargar los filtros del dashboard');
        }

        const departmentPayload = (await departmentsResponse.json()) as {
          departments?: Department[];
        };
        const memberPayload = (await membersResponse.json()) as {
          members?: AccountMember[];
        };
        if (whatsappResponse.error) throw whatsappResponse.error;

        if (!cancelled) {
          setDepartments(departmentPayload.departments ?? []);
          setMembers(memberPayload.members ?? []);
          setWhatsappConfigs((whatsappResponse.data ?? []) as WhatsAppOption[]);
        }
      } catch (loadError) {
        console.error('[ticket analytics] filter options failed:', loadError);
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const range = buildTicketAnalyticsRange(rangeDays);
      const result = await loadTicketAnalytics(db, {
        ...range,
        departmentId,
        agentId,
        whatsappConfigId,
      });
      if (requestId.current === currentRequest) setAnalytics(result);
    } catch (loadError) {
      console.error('[ticket analytics] load failed:', loadError);
      if (requestId.current === currentRequest) {
        setError('No se pudieron cargar las estadísticas de tickets.');
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [agentId, db, departmentId, rangeDays, whatsappConfigId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const memberNames = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.user_id,
          member.full_name || member.email || 'Ejecutivo',
        ])
      ),
    [members]
  );

  const operativeMembers = members.filter((member) => member.role !== 'viewer');

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-foreground text-xl font-semibold">
            Operación de tickets
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Primera respuesta humana, resolución y carga por equipo con los
            permisos de tu rol.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      </div>

      <div className="border-border bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect
          label="Período"
          value={String(rangeDays)}
          disabled={false}
          onChange={(value) =>
            setRangeDays(Number(value) as TicketAnalyticsRangeDays)
          }
          options={[
            { value: '7', label: 'Últimos 7 días' },
            { value: '30', label: 'Últimos 30 días' },
            { value: '90', label: 'Últimos 90 días' },
          ]}
        />
        <FilterSelect
          label="Departamento"
          value={departmentId ?? ''}
          disabled={optionsLoading}
          onChange={(value) => setDepartmentId(value || null)}
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
          }))}
          allLabel="Todos los departamentos"
        />
        <FilterSelect
          label="Ejecutivo"
          value={agentId ?? ''}
          disabled={optionsLoading}
          onChange={(value) => setAgentId(value || null)}
          options={operativeMembers.map((member) => ({
            value: member.user_id,
            label: member.full_name || member.email || 'Ejecutivo',
          }))}
          allLabel="Todos los ejecutivos"
        />
        <FilterSelect
          label="Número de WhatsApp"
          value={whatsappConfigId ?? ''}
          disabled={optionsLoading || whatsappConfigs.length === 0}
          onChange={(value) => setWhatsappConfigId(value || null)}
          options={whatsappConfigs.map((config) => ({
            value: config.id,
            label:
              config.connection_name ||
              config.display_name ||
              config.display_phone ||
              config.phone_number_id ||
              'WhatsApp',
          }))}
          allLabel={
            whatsappConfigs.length === 0
              ? 'Sin números conectados'
              : 'Todos los números'
          }
        />
      </div>

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 rounded-xl border p-5">
          <p className="text-destructive text-sm font-medium">{error}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Revisa la conexión con Supabase o vuelve a intentarlo.
          </p>
        </div>
      ) : null}

      {loading || !analytics ? (
        <TicketAnalyticsSkeleton />
      ) : (
        <>
          <SummaryCards analytics={analytics} rangeDays={rangeDays} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <TicketVolumeChart data={analytics.daily} />
            <StatusOverview analytics={analytics} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DepartmentTable analytics={analytics} />
            <AgentTable analytics={analytics} memberNames={memberNames} />
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCards({
  analytics,
  rangeDays,
}: {
  analytics: TicketAnalytics;
  rangeDays: TicketAnalyticsRangeDays;
}) {
  const summary = analytics.summary;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Tickets nuevos"
        value={summary.newTickets.toLocaleString()}
        icon={TicketPlus}
        subtitle={`Últimos ${rangeDays} días`}
      />
      <MetricCard
        title="Pendientes actuales"
        value={summary.pendingNow.toLocaleString()}
        icon={Clock3}
        subtitle="Cola visible ahora"
      />
      <MetricCard
        title="Tickets cerrados"
        value={summary.closedTickets.toLocaleString()}
        icon={CheckCircle2}
        subtitle={`Últimos ${rangeDays} días`}
      />
      <MetricCard
        title="Primera respuesta"
        value={formatDuration(summary.avgFirstResponseMinutes)}
        icon={TimerReset}
        subtitle="Promedio humano"
      />
      <MetricCard
        title="Tiempo de resolución"
        value={formatDuration(summary.avgResolutionMinutes)}
        icon={AlarmClock}
        subtitle="Creación a cierre"
      />
      <MetricCard
        title="Transferencias"
        value={summary.transfers.toLocaleString()}
        icon={ArrowLeftRight}
        subtitle={`Últimos ${rangeDays} días`}
      />
      <MetricCard
        title="Esperando respuesta"
        value={summary.customersWaiting.toLocaleString()}
        icon={MessageCircleWarning}
        subtitle="Sin respuesta humana posterior"
      />
      <MetricCard
        title="Seguimientos vencidos"
        value={summary.overdueFollowUps.toLocaleString()}
        icon={AlarmClock}
        subtitle="Fecha anterior a hoy"
      />
    </div>
  );
}

function TicketVolumeChart({ data }: { data: TicketDailyMetric[] }) {
  const maximum = Math.max(
    1,
    ...data.map((point) => Math.max(point.newTickets, point.closedTickets))
  );
  const empty = data.every(
    (point) => point.newTickets === 0 && point.closedTickets === 0
  );

  return (
    <div className="border-border bg-card rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-foreground text-sm font-semibold">
          Volumen de tickets
        </h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Nuevos y cerrados por día
        </p>
      </div>
      <div className="p-5">
        {empty ? (
          <EmptyState
            icon={TicketPlus}
            title="Todavía no hay actividad de tickets"
            hint="Los tickets nuevos y cerrados aparecerán aquí."
          />
        ) : (
          <div
            className="flex h-52 items-end gap-0.5"
            role="img"
            aria-label="Tickets nuevos y cerrados por día"
          >
            {data.map((point, index) => (
              <div
                key={point.day}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px"
                title={`${formatDay(point.day)}: ${point.newTickets} nuevos, ${point.closedTickets} cerrados`}
              >
                <span
                  className="bg-primary/80 min-h-px w-1/2 rounded-t"
                  style={{
                    height: `${(point.newTickets / maximum) * 100}%`,
                  }}
                />
                <span
                  className="min-h-px w-1/2 rounded-t bg-emerald-500/80"
                  style={{
                    height: `${(point.closedTickets / maximum) * 100}%`,
                  }}
                />
                {(index === 0 || index === data.length - 1) && (
                  <span className="text-muted-foreground absolute -bottom-5 text-[10px]">
                    {shortDay(point.day)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-border text-muted-foreground flex gap-4 border-t px-5 py-3 text-xs">
        <Legend color="bg-primary" label="Nuevos" />
        <Legend color="bg-emerald-500" label="Cerrados" />
      </div>
    </div>
  );
}

function StatusOverview({ analytics }: { analytics: TicketAnalytics }) {
  const total = analytics.statuses.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="border-border bg-card rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-foreground text-sm font-semibold">Estado actual</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Distribución de los tickets visibles
        </p>
      </div>
      <div className="space-y-4 p-5">
        {analytics.statuses.map((item) => {
          const percentage = total === 0 ? 0 : (item.total / total) * 100;
          return (
            <div key={item.status}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[item.status] }}
                  />
                  {STATUS_LABELS[item.status]}
                </span>
                <span className="text-foreground font-medium tabular-nums">
                  {item.total}
                </span>
              </div>
              <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: STATUS_COLORS[item.status],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentTable({ analytics }: { analytics: TicketAnalytics }) {
  return (
    <AnalyticsTableCard
      title="Rendimiento por departamento"
      description="Actividad dentro del período seleccionado"
    >
      <div className="divide-border divide-y md:hidden">
        {analytics.departments.map((department) => (
          <div key={department.departmentId} className="p-4">
            <p className="text-foreground flex items-center gap-2 font-semibold">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: department.color }}
              />
              {department.name}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ['Nuevos', department.newTickets],
                ['Pendientes', department.pendingNow],
                ['Cerrados', department.closedTickets],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="bg-muted/50 rounded-xl p-2.5"
                >
                  <dt className="text-muted-foreground truncate">{label}</dt>
                  <dd className="text-foreground mt-1 font-bold tabular-nums">
                    {Number(value).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-border border-b">
              <th className="px-5 py-3 font-medium">Departamento</th>
              <th className="px-3 py-3 text-right font-medium">Nuevos</th>
              <th className="px-3 py-3 text-right font-medium">Pendientes</th>
              <th className="px-5 py-3 text-right font-medium">Cerrados</th>
            </tr>
          </thead>
          <tbody>
            {analytics.departments.map((department) => (
              <tr
                key={department.departmentId}
                className="border-border/70 border-b last:border-0"
              >
                <td className="text-foreground px-5 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: department.color }}
                    />
                    {department.name}
                  </span>
                </td>
                <NumberCell value={department.newTickets} />
                <NumberCell value={department.pendingNow} />
                <NumberCell value={department.closedTickets} last />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsTableCard>
  );
}

function AgentTable({
  analytics,
  memberNames,
}: {
  analytics: TicketAnalytics;
  memberNames: Map<string, string>;
}) {
  return (
    <AnalyticsTableCard
      title="Rendimiento por ejecutivo"
      description="Métricas objetivas, sin puntuación artificial"
    >
      <div className="divide-border divide-y md:hidden">
        {analytics.agents.map((agent) => (
          <div key={agent.agentId} className="p-4">
            <p className="text-foreground truncate font-semibold">
              {memberNames.get(agent.agentId) ?? 'Ejecutivo'}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {[
                ['Asignados', agent.assignedNow.toLocaleString()],
                ['Aceptados', agent.acceptedTickets.toLocaleString()],
                ['Cerrados', agent.closedTickets.toLocaleString()],
                ['1ª respuesta', formatDuration(agent.avgFirstResponseMinutes)],
                ['Resolución', formatDuration(agent.avgResolutionMinutes)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="bg-muted/50 flex min-w-0 items-center justify-between gap-2 rounded-xl p-2.5"
                >
                  <dt className="text-muted-foreground truncate">{label}</dt>
                  <dd className="text-foreground shrink-0 font-semibold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-border border-b">
              <th className="px-5 py-3 font-medium">Ejecutivo</th>
              <th className="px-3 py-3 text-right font-medium">Asignados</th>
              <th className="px-3 py-3 text-right font-medium">Aceptados</th>
              <th className="px-3 py-3 text-right font-medium">Cerrados</th>
              <th className="px-3 py-3 text-right font-medium">1ª respuesta</th>
              <th className="px-5 py-3 text-right font-medium">Resolución</th>
            </tr>
          </thead>
          <tbody>
            {analytics.agents.map((agent) => (
              <tr
                key={agent.agentId}
                className="border-border/70 border-b last:border-0"
              >
                <td className="text-foreground px-5 py-3 font-medium">
                  {memberNames.get(agent.agentId) ?? 'Ejecutivo'}
                </td>
                <NumberCell value={agent.assignedNow} />
                <NumberCell value={agent.acceptedTickets} />
                <NumberCell value={agent.closedTickets} />
                <td className="text-muted-foreground px-3 py-3 text-right tabular-nums">
                  {formatDuration(agent.avgFirstResponseMinutes)}
                </td>
                <td className="text-muted-foreground px-5 py-3 text-right tabular-nums">
                  {formatDuration(agent.avgResolutionMinutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsTableCard>
  );
}

function AnalyticsTableCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      <div className="border-border border-b px-5 py-4">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function NumberCell({
  value,
  last = false,
}: {
  value: number;
  last?: boolean;
}) {
  return (
    <td
      className={`${last ? 'px-5' : 'px-3'} text-muted-foreground py-3 text-right tabular-nums`}
    >
      {value.toLocaleString()}
    </td>
  );
}

function FilterSelect({
  label,
  value,
  disabled,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-muted-foreground space-y-1.5 text-xs font-medium">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background text-foreground focus:border-ring focus:ring-ring/30 h-9 w-full rounded-lg border px-3 text-sm font-normal outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TicketAnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function formatDay(day: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

function shortDay(day: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}
