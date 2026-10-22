import type { SupabaseClient } from '@supabase/supabase-js';

export type TicketAnalyticsRangeDays = 7 | 30 | 90;

export interface TicketAnalyticsFilters {
  from: string;
  to: string;
  timezone: string;
  departmentId: string | null;
  agentId: string | null;
  whatsappConfigId: string | null;
}

export interface TicketAnalyticsSummary {
  newTickets: number;
  pendingNow: number;
  closedTickets: number;
  avgFirstResponseMinutes: number | null;
  avgAiFirstResponseMinutes: number | null;
  aiAnsweredTickets: number;
  aiExcludedOutliers: number;
  avgResolutionMinutes: number | null;
  transfers: number;
  customersWaiting: number;
  overdueFollowUps: number;
}

export interface TicketDailyMetric {
  day: string;
  newTickets: number;
  closedTickets: number;
}

export interface TicketStatusMetric {
  status: 'pending' | 'open' | 'waiting' | 'closed';
  total: number;
}

export interface TicketDepartmentMetric {
  departmentId: string;
  name: string;
  color: string;
  newTickets: number;
  pendingNow: number;
  closedTickets: number;
}

export interface TicketAgentMetric {
  agentId: string;
  assignedNow: number;
  acceptedTickets: number;
  closedTickets: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
}

export interface TicketAnalytics {
  range: {
    from: string;
    to: string;
    timezone: string;
  };
  summary: TicketAnalyticsSummary;
  daily: TicketDailyMetric[];
  statuses: TicketStatusMetric[];
  departments: TicketDepartmentMetric[];
  agents: TicketAgentMetric[];
}

type DB = SupabaseClient;

export async function loadTicketAnalytics(
  db: DB,
  filters: TicketAnalyticsFilters
): Promise<TicketAnalytics> {
  const parameters = {
    p_from: filters.from,
    p_to: filters.to,
    p_timezone: filters.timezone,
    p_department_id: filters.departmentId,
    p_agent_id: filters.agentId,
    p_whatsapp_config_id: filters.whatsappConfigId,
  };

  const [ticketResult, aiResult] = await Promise.all([
    db.rpc('get_ticket_analytics', parameters),
    db.rpc('get_ai_first_response_analytics', parameters),
  ]);

  if (ticketResult.error) throw ticketResult.error;
  if (aiResult.error) throw aiResult.error;
  return normalizeTicketAnalytics(ticketResult.data, aiResult.data);
}

export function buildTicketAnalyticsRange(
  days: TicketAnalyticsRangeDays,
  now = new Date()
): Pick<TicketAnalyticsFilters, 'from' | 'to' | 'timezone'> {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const from = new Date(startToday);
  from.setDate(from.getDate() - (days - 1));

  const to = new Date(startToday);
  to.setDate(to.getDate() + 1);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

export function normalizeTicketAnalytics(
  value: unknown,
  aiValue: unknown = null
): TicketAnalytics {
  const root = asRecord(value);
  const range = asRecord(root.range);
  const summary = asRecord(root.summary);
  const aiSummary = asRecord(aiValue);

  return {
    range: {
      from: asString(range.from),
      to: asString(range.to),
      timezone: asString(range.timezone, 'UTC'),
    },
    summary: {
      newTickets: asNumber(summary.new_tickets),
      pendingNow: asNumber(summary.pending_now),
      closedTickets: asNumber(summary.closed_tickets),
      avgFirstResponseMinutes: asNullableNumber(
        summary.avg_first_response_minutes
      ),
      avgAiFirstResponseMinutes: asNullableNumber(
        aiSummary.avg_first_response_minutes
      ),
      aiAnsweredTickets: asNumber(aiSummary.answered_tickets),
      aiExcludedOutliers: asNumber(aiSummary.excluded_outliers),
      avgResolutionMinutes: asNullableNumber(summary.avg_resolution_minutes),
      transfers: asNumber(summary.transfers),
      customersWaiting: asNumber(summary.customers_waiting),
      overdueFollowUps: asNumber(summary.overdue_follow_ups),
    },
    daily: asArray(root.daily).map((item) => {
      const row = asRecord(item);
      return {
        day: asString(row.day),
        newTickets: asNumber(row.new_tickets),
        closedTickets: asNumber(row.closed_tickets),
      };
    }),
    statuses: asArray(root.statuses).flatMap((item) => {
      const row = asRecord(item);
      const status = row.status;
      if (
        status !== 'pending' &&
        status !== 'open' &&
        status !== 'waiting' &&
        status !== 'closed'
      ) {
        return [];
      }
      return [{ status, total: asNumber(row.total) }];
    }),
    departments: asArray(root.departments).map((item) => {
      const row = asRecord(item);
      return {
        departmentId: asString(row.department_id),
        name: asString(row.name, 'Departamento'),
        color: asString(row.color, '#64748b'),
        newTickets: asNumber(row.new_tickets),
        pendingNow: asNumber(row.pending_now),
        closedTickets: asNumber(row.closed_tickets),
      };
    }),
    agents: asArray(root.agents).map((item) => {
      const row = asRecord(item);
      return {
        agentId: asString(row.agent_id),
        assignedNow: asNumber(row.assigned_now),
        acceptedTickets: asNumber(row.accepted_tickets),
        closedTickets: asNumber(row.closed_tickets),
        avgFirstResponseMinutes: asNullableNumber(
          row.avg_first_response_minutes
        ),
        avgResolutionMinutes: asNullableNumber(row.avg_resolution_minutes),
      };
    }),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return asNumber(value);
}
