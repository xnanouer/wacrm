import { describe, expect, it } from 'vitest';

import { isAutomaticAiActiveAt } from './schedule';

describe('isAutomaticAiActiveAt', () => {
  it('keeps the 24/7 option active every day', () => {
    expect(
      isAutomaticAiActiveAt({
        schedule: 'always',
        timezone: 'America/Santiago',
        at: new Date('2026-10-07T15:00:00Z'),
      })
    ).toBe(true);
  });

  it('activates the weekend option on Saturday and Sunday in Chile', () => {
    expect(
      isAutomaticAiActiveAt({
        schedule: 'weekends',
        timezone: 'America/Santiago',
        at: new Date('2026-10-03T15:00:00Z'),
      })
    ).toBe(true);
    expect(
      isAutomaticAiActiveAt({
        schedule: 'weekends',
        timezone: 'America/Santiago',
        at: new Date('2026-10-05T02:30:00Z'),
      })
    ).toBe(true);
  });

  it('disables the weekend option on weekdays in Chile', () => {
    expect(
      isAutomaticAiActiveAt({
        schedule: 'weekends',
        timezone: 'America/Santiago',
        at: new Date('2026-10-05T15:00:00Z'),
      })
    ).toBe(false);
  });

  it('fails closed for an invalid timezone in weekend mode', () => {
    expect(
      isAutomaticAiActiveAt({
        schedule: 'weekends',
        timezone: 'Zona/Inexistente',
        at: new Date('2026-10-03T15:00:00Z'),
      })
    ).toBe(false);
  });
});
