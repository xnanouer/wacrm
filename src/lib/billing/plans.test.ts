import { describe, expect, it } from 'vitest';

import {
  POINT_PACKAGES,
  TRIAL_DAYS,
  calculatePlan,
  estimatePointBalance,
  formatClp,
  pointPackagePricePerThousand,
  recommendPlanForPointPackage,
  recommendHigherPlan,
} from './plans';

describe('Nexora commercial plan calculations', () => {
  it('calculates PRO with 13 users and 4 connections', () => {
    const result = calculatePlan('professional', 13, 4);

    expect(result.extraUsers).toBe(3);
    expect(result.extraUsersTotal).toBe(38_970);
    expect(result.extraConnections).toBe(1);
    expect(result.extraConnectionsTotal).toBe(18_990);
    expect(result.monthlyTotal).toBe(217_950);
  });

  it('calculates PRO with 15 users and 5 connections', () => {
    expect(calculatePlan('professional', 15, 5).monthlyTotal).toBe(262_920);
  });

  it('never allows quantities below the selected plan minimum', () => {
    const result = calculatePlan('enterprise', 1, 0);

    expect(result.users).toBe(25);
    expect(result.connections).toBe(10);
    expect(result.catalogItems).toBe(500);
    expect(result.monthlyTotal).toBe(349_990);
  });

  it('adds catalog capacity in blocks of ten vehicles', () => {
    const result = calculatePlan('professional', 10, 3, 171);

    expect(result.catalogItems).toBe(180);
    expect(result.extraCatalogBlocks).toBe(3);
    expect(result.extraCatalogTotal).toBe(17_970);
    expect(result.monthlyTotal).toBe(177_960);
  });

  it('recommends a higher plan when catalog blocks make it cheaper', () => {
    const recommendation = recommendHigherPlan('professional', 10, 3, 500);

    expect(recommendation?.recommended.plan.code).toBe('enterprise');
    expect(recommendation?.current.extraCatalogBlocks).toBe(35);
    expect(recommendation?.recommended.extraCatalogBlocks).toBe(0);
  });

  it('recommends PRO when an expanded STARTER is more expensive', () => {
    const recommendation = recommendHigherPlan('starter', 10, 3);

    expect(recommendation?.current.monthlyTotal).toBe(208_900);
    expect(recommendation?.recommended.plan.code).toBe('professional');
    expect(recommendation?.recommended.monthlyTotal).toBe(159_990);
    expect(recommendation?.monthlySavings).toBe(48_910);
  });

  it('recommends BUSINESS when an expanded PRO is more expensive', () => {
    const recommendation = recommendHigherPlan('professional', 25, 10);

    expect(recommendation?.current.monthlyTotal).toBe(487_770);
    expect(recommendation?.recommended.plan.code).toBe('enterprise');
    expect(recommendation?.recommended.monthlyTotal).toBe(349_990);
    expect(recommendation?.monthlySavings).toBe(137_780);
  });

  it('does not recommend a more expensive upgrade', () => {
    expect(recommendHigherPlan('starter', 3, 1)).toBeNull();
    expect(recommendHigherPlan('enterprise', 100, 100)).toBeNull();
  });

  it('formats CLP without decimals or tax labels', () => {
    expect(formatClp(79_990)).toBe('$79.990');
  });

  it('keeps the commercial trial duration centralized', () => {
    expect(TRIAL_DAYS).toBe(3);
  });
});

describe('Nexora point packages', () => {
  it('calculates the price per 1,000 points dynamically', () => {
    expect(POINT_PACKAGES.map(pointPackagePricePerThousand)).toEqual([
      7_990, 5_998, 5_333, 5_000,
    ]);
  });

  it('estimates the balance without mutating a real balance', () => {
    expect(estimatePointBalance(6_580, POINT_PACKAGES[2])).toBe(21_580);
  });

  it('recommends PRO for a practically equivalent Starter recharge', () => {
    const recommendation = recommendPlanForPointPackage(
      'starter',
      'points_15000'
    );

    expect(recommendation?.combinedPrice).toBe(159_980);
    expect(recommendation?.recommendedPlan.code).toBe('professional');
    expect(recommendation?.priceDifference).toBe(10);
    expect(recommendation?.recommendedPlanIsCheaper).toBe(false);
  });

  it('recommends BUSINESS when it is cheaper than PRO plus points', () => {
    const recommendation = recommendPlanForPointPackage(
      'professional',
      'points_40000'
    );

    expect(recommendation?.combinedPrice).toBe(359_980);
    expect(recommendation?.recommendedPlan.code).toBe('enterprise');
    expect(recommendation?.priceDifference).toBe(9_990);
    expect(recommendation?.recommendedPlanIsCheaper).toBe(true);
  });

  it('does not recommend an upgrade without enough economic value', () => {
    expect(recommendPlanForPointPackage('starter', 'points_5000')).toBeNull();
    expect(
      recommendPlanForPointPackage('enterprise', 'points_40000')
    ).toBeNull();
  });
});
