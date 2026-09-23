import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CONFIGS,
  getIndustryConfig,
  isActiveIndustry,
  sanitizeOnboardingAnswers,
  validateOnboardingAnswers,
} from './config';

describe('industry configuration', () => {
  it('only enables the two launch industries', () => {
    expect(
      INDUSTRY_CONFIGS.filter((item) => item.enabled).map((item) => item.id)
    ).toEqual(['automotive', 'real_estate_construction']);
    expect(INDUSTRY_CONFIGS.filter((item) => !item.enabled).length).toBe(6);
  });

  it('rejects future industries at the validation boundary', () => {
    expect(isActiveIndustry('automotive')).toBe(true);
    expect(isActiveIndustry('real_estate_construction')).toBe(true);
    expect(isActiveIndustry('restaurant')).toBe(false);
    expect(isActiveIndustry('healthcare')).toBe(false);
  });

  it.each(['automotive', 'real_estate_construction'] as const)(
    'accepts a complete %s flow and strips unknown answers',
    (industry) => {
      const raw = Object.fromEntries(
        getIndustryConfig(industry).questions.map((question) => [
          question.id,
          question.type === 'multiple'
            ? [question.options[0].value]
            : question.options[0].value,
        ])
      );
      const clean = sanitizeOnboardingAnswers(industry, {
        ...raw,
        injected: 'not-allowed',
      });
      expect(clean).not.toHaveProperty('injected');
      expect(validateOnboardingAnswers(industry, clean)).toEqual({
        valid: true,
        missing: [],
      });
    }
  );

  it('reports required answers that are missing', () => {
    const result = validateOnboardingAnswers('automotive', {});
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('vehicle_types');
    expect(result.missing).toContain('goals');
  });
});
