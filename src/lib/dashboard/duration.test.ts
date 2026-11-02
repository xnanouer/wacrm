import { describe, expect, it } from 'vitest';

import {
  formatDashboardDuration,
  formatFirstResponseDuration,
} from './duration';

describe('formatFirstResponseDuration', () => {
  it('rounds sub-minute durations to one decimal place', () => {
    expect(formatFirstResponseDuration(17.455 / 60)).toBe('17.5s');
  });

  it('shows complete hour, minute and second components', () => {
    expect(
      formatFirstResponseDuration((2 * 3_600 + 5 * 60 + 28.855) / 60),
    ).toBe('2h 5m 28.9s');
  });

  it('shows complete minute and second components', () => {
    expect(formatFirstResponseDuration(4.125)).toBe('4m 7.5s');
  });

  it('keeps a visible decimal when seconds are exact', () => {
    expect(formatFirstResponseDuration(3)).toBe('3m 0.0s');
  });

  it('handles missing values', () => {
    expect(formatFirstResponseDuration(null)).toBe('—');
  });
});

describe('formatDashboardDuration', () => {
  it('keeps the compact format used by resolution and agent tables', () => {
    expect(formatDashboardDuration(56 * 60 + 22)).toBe('2.3 d');
    expect(formatDashboardDuration(5 * 60 + 29)).toBe('5.5 h');
    expect(formatDashboardDuration(17.9)).toBe('18 min');
  });

  it('handles missing values', () => {
    expect(formatDashboardDuration(null)).toBe('—');
  });
});
