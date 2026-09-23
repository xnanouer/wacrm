import { describe, expect, it } from 'vitest';

import {
  canAccessAppPath,
  homePathForRole,
  isAdminWorkspacePath,
} from './route-access';
import type { AccountRole } from './roles';

describe('workspace route access', () => {
  const administrativePaths = [
    '/dashboard',
    '/contacts',
    '/contacts/contact-1',
    '/pipelines',
    '/broadcasts/new',
    '/automations/automation-1',
    '/flows/flow-1',
    '/agents',
    '/plans',
  ];

  it.each(administrativePaths)('recognizes %s as admin-only', (pathname) => {
    expect(isAdminWorkspacePath(pathname)).toBe(true);
  });

  it.each<AccountRole>(['agent', 'supervisor', 'viewer'])(
    'keeps %s out of workspace administration',
    (role) => {
      for (const pathname of administrativePaths) {
        expect(canAccessAppPath(role, pathname)).toBe(false);
      }
      expect(canAccessAppPath(role, '/inbox')).toBe(true);
      expect(canAccessAppPath(role, '/catalogo')).toBe(true);
      expect(canAccessAppPath(role, '/notifications')).toBe(true);
      expect(canAccessAppPath(role, '/settings')).toBe(true);
    }
  );

  it.each<AccountRole>(['owner', 'admin'])(
    'allows %s to administer the workspace',
    (role) => {
      for (const pathname of administrativePaths) {
        expect(canAccessAppPath(role, pathname)).toBe(true);
      }
    }
  );

  it('uses the inbox as the operational home for non-admin roles', () => {
    expect(homePathForRole('agent')).toBe('/inbox');
    expect(homePathForRole('supervisor')).toBe('/inbox');
    expect(homePathForRole('viewer')).toBe('/inbox');
    expect(homePathForRole(null)).toBe('/inbox');
    expect(homePathForRole('admin')).toBe('/dashboard');
    expect(homePathForRole('owner')).toBe('/dashboard');
  });
});
