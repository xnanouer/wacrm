import { describe, expect, it } from 'vitest';

import { storageAlertLevel, usagePercent } from './storage-monitor-shared';

describe('platform storage monitor', () => {
  it('calculates stable percentages', () => {
    expect(usagePercent(250, 500)).toBe(50);
    expect(usagePercent(1, 3)).toBe(33.333);
    expect(usagePercent(10, 0)).toBe(0);
  });

  it('uses the highest reached alert threshold', () => {
    expect(storageAlertLevel(59.999)).toBe(0);
    expect(storageAlertLevel(60)).toBe(60);
    expect(storageAlertLevel(80)).toBe(80);
    expect(storageAlertLevel(95)).toBe(90);
  });
});
