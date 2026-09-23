import type { CookieOptionsWithName } from '@supabase/ssr';

/**
 * Supabase SSR uses browser-readable auth cookies so the browser client can
 * refresh its PKCE session. `httpOnly` therefore requires a future BFF-style
 * session architecture and cannot be enabled safely in this client today.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};
