import { describe, expect, it } from 'vitest';

import { formatAnalyticsDuration } from './duration';

describe('formatAnalyticsDuration', () => {
  it('keeps sub-minute precision instead of rounding to whole seconds', () => {
    expect(formatAnalyticsDuration(17.4976 / 60)).toBe('17.498s');
  });

  it('shows complete hour, minute and second components', () => {
    expect(formatAnalyticsDuration(127.0125)).toBe('2h 7m 0.75s');
  });

  it('shows complete minute and second components', () => {
    expect(formatAnalyticsDuration(4.125)).toBe('4m 7.5s');
  });

  it('handles missing values', () => {
    expect(formatAnalyticsDuration(null)).toBe('—');
  });
});
