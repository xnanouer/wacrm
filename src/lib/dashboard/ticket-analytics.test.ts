import { describe, expect, it } from 'vitest';

import {
  buildTicketAnalyticsRange,
  normalizeTicketAnalytics,
} from './ticket-analytics';

describe('normalizeTicketAnalytics', () => {
  it('normalizes PostgreSQL JSON keys and numeric values', () => {
    const result = normalizeTicketAnalytics(
      {
        range: {
          from: '2026-07-01T00:00:00Z',
          to: '2026-08-01T00:00:00Z',
          timezone: 'America/Santiago',
        },
        summary: {
          new_tickets: 12,
          pending_now: '3',
          closed_tickets: 8,
          avg_first_response_minutes: '4.5',
          avg_resolution_minutes: null,
          transfers: 2,
          customers_waiting: 1,
          overdue_follow_ups: 5,
        },
        daily: [{ day: '2026-07-01', new_tickets: 2, closed_tickets: 1 }],
        statuses: [
          { status: 'pending', total: 3 },
          { status: 'invalid', total: 99 },
        ],
        departments: [
          {
            department_id: 'department-1',
            name: 'Ventas',
            color: '#7c3aed',
            new_tickets: 4,
            pending_now: 1,
            closed_tickets: 2,
          },
        ],
        agents: [
          {
            agent_id: 'agent-1',
            assigned_now: 2,
            accepted_tickets: 4,
            closed_tickets: 3,
            avg_first_response_minutes: 2,
            avg_resolution_minutes: 20,
          },
        ],
      },
      {
        avg_first_response_minutes: '0.4',
        answered_tickets: '11',
        excluded_outliers: '2',
      }
    );

    expect(result.summary).toEqual({
      newTickets: 12,
      pendingNow: 3,
      closedTickets: 8,
      avgFirstResponseMinutes: 4.5,
      avgAiFirstResponseMinutes: 0.4,
      aiAnsweredTickets: 11,
      aiExcludedOutliers: 2,
      avgResolutionMinutes: null,
      transfers: 2,
      customersWaiting: 1,
      overdueFollowUps: 5,
    });
    expect(result.statuses).toEqual([{ status: 'pending', total: 3 }]);
    expect(result.departments[0]?.name).toBe('Ventas');
    expect(result.agents[0]?.acceptedTickets).toBe(4);
  });

  it('returns safe empty defaults for an invalid payload', () => {
    const result = normalizeTicketAnalytics(null);

    expect(result.summary.newTickets).toBe(0);
    expect(result.summary.avgFirstResponseMinutes).toBeNull();
    expect(result.summary.avgAiFirstResponseMinutes).toBeNull();
    expect(result.summary.aiAnsweredTickets).toBe(0);
    expect(result.summary.aiExcludedOutliers).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.departments).toEqual([]);
    expect(result.agents).toEqual([]);
  });
});

describe('buildTicketAnalyticsRange', () => {
  it('creates an inclusive seven-day range with an exclusive next-day end', () => {
    const result = buildTicketAnalyticsRange(
      7,
      new Date('2026-07-19T12:00:00-04:00')
    );

    expect(
      (new Date(result.to).getTime() - new Date(result.from).getTime()) /
        86_400_000
    ).toBe(7);
    expect(result.timezone.length).toBeGreaterThan(0);
  });
});
