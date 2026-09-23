import { describe, expect, it } from 'vitest';

import {
  CATALOG_ADDON,
  CATALOG_PLAN_LIMITS,
  CATALOG_SHARE_MAX_ITEMS,
  catalogStatusConsumesQuota,
  formatCatalogClp,
} from './config';

describe('catalog configuration', () => {
  it('keeps the approved plan limits in one source of truth', () => {
    expect(CATALOG_PLAN_LIMITS).toEqual({
      starter: 50,
      professional: 150,
      enterprise: 500,
    });
    expect(CATALOG_ADDON).toEqual({
      units: 10,
      monthlyPrice: 5_990,
    });
  });

  it('counts only active catalog lifecycle states against capacity', () => {
    expect(catalogStatusConsumesQuota('draft')).toBe(true);
    expect(catalogStatusConsumesQuota('pending_approval')).toBe(true);
    expect(catalogStatusConsumesQuota('available')).toBe(true);
    expect(catalogStatusConsumesQuota('reserved')).toBe(true);
    expect(catalogStatusConsumesQuota('sold')).toBe(false);
    expect(catalogStatusConsumesQuota('inactive')).toBe(false);
    expect(catalogStatusConsumesQuota('archived')).toBe(false);
  });

  it('formats Chilean prices and caps one share at five vehicles', () => {
    expect(formatCatalogClp(5_990)).toBe('$5.990');
    expect(CATALOG_SHARE_MAX_ITEMS).toBe(5);
  });
});
