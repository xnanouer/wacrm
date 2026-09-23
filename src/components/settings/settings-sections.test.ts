import { describe, expect, it } from 'vitest';

import { settingsSectionsForRole } from './settings-sections';

describe('settings sections by role', () => {
  it.each(['agent', 'supervisor'] as const)(
    'shows only personal settings to %s',
    (role) => {
      expect(settingsSectionsForRole(role)).toEqual([
        'profile',
        'security',
        'appearance',
        'quick-replies',
      ]);
    }
  );

  it('keeps the viewer role read-only', () => {
    expect(settingsSectionsForRole('viewer')).toEqual([
      'profile',
      'security',
      'appearance',
    ]);
  });

  it.each(['owner', 'admin'] as const)(
    'shows workspace administration to %s',
    (role) => {
      expect(settingsSectionsForRole(role)).toContain('members');
      expect(settingsSectionsForRole(role)).toContain('company');
      expect(settingsSectionsForRole(role)).toContain('whatsapp');
      expect(settingsSectionsForRole(role)).toContain('api');
    }
  );
});
