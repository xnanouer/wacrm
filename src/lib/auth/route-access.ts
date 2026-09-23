import { hasMinRole, type AccountRole } from './roles';

/**
 * Workspace administration lives behind an explicit admin boundary.
 * Matching by prefix also protects nested editors such as /flows/:id.
 */
const ADMIN_ONLY_PREFIXES = [
  '/dashboard',
  '/contacts',
  '/pipelines',
  '/broadcasts',
  '/automations',
  '/flows',
  '/agents',
  '/plans',
] as const;

export function isAdminWorkspacePath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function canAccessAppPath(role: AccountRole, pathname: string): boolean {
  return !isAdminWorkspacePath(pathname) || hasMinRole(role, 'admin');
}

export function homePathForRole(role: AccountRole | null): string {
  return role && hasMinRole(role, 'admin') ? '/dashboard' : '/inbox';
}
