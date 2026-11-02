import { describe, expect, it } from 'vitest';

import { formatAnalyticsDuration } from './duration';

describe('formatAnalyticsDuration', () => {
  it('rounds sub-minute durations to one decimal place', () => {
    expect(formatAnalyticsDuration(17.455 / 60)).toBe('17.5s');
  });

  it('shows complete hour, minute and second components', () => {
    expect(formatAnalyticsDuration((2 * 3_600 + 5 * 60 + 28.855) / 60)).toBe(
      '2h 5m 28.9s',
    );
  });

  it('shows complete minute and second components', () => {
    expect(formatAnalyticsDuration(4.125)).toBe('4m 7.5s');
  });

  it('keeps a visible decimal when seconds are exact', () => {
    expect(formatAnalyticsDuration(3)).toBe('3m 0.0s');
  });

  it('handles missing values', () => {
    expect(formatAnalyticsDuration(null)).toBe('—');
  });
});
