import { describe, expect, it } from 'vitest';

import {
  EMPTY_CUSTOMER_BASE_FILTERS,
  customerBaseSearchParams,
  parseCustomerBaseFilters,
} from './customer-base';

describe('customer base filters', () => {
  it('round-trips valid filters used by the table and export', () => {
    const filters = {
      ...EMPTY_CUSTOMER_BASE_FILTERS,
      search: '  Marcela X55  ',
      tagIds: ['123e4567-e89b-42d3-a456-426614174000'],
      source: 'whatsapp' as const,
      profile: 'complete' as const,
      assignedAgentId: '123e4567-e89b-42d3-a456-426614174001',
      departmentId: '123e4567-e89b-42d3-a456-426614174002',
      evaluationStatus: 'Aprobado',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
    };

    const parsed = parseCustomerBaseFilters(customerBaseSearchParams(filters));

    expect(parsed).toEqual({ ...filters, search: 'Marcela X55' });
  });

  it('drops invalid ids, dates and enum values', () => {
    const params = new URLSearchParams({
      tags: 'not-an-id,123e4567-e89b-42d3-a456-426614174000',
      source: 'tiktok',
      profile: 'secret',
      agent: 'wrong',
      department: 'wrong',
      from: '01-08-2026',
      to: 'tomorrow',
    });

    expect(parseCustomerBaseFilters(params)).toMatchObject({
      tagIds: ['123e4567-e89b-42d3-a456-426614174000'],
      source: '',
      profile: 'all',
      assignedAgentId: '',
      departmentId: '',
      dateFrom: '',
      dateTo: '',
    });
  });

  it('limits free text accepted by the server', () => {
    const parsed = parseCustomerBaseFilters(
      new URLSearchParams({ search: 'x'.repeat(500), status: 'y'.repeat(200) })
    );

    expect(parsed.search).toHaveLength(200);
    expect(parsed.evaluationStatus).toHaveLength(80);
  });
});
