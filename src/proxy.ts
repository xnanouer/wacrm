import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  canAccessAppPath,
  homePathForRole,
  isAdminWorkspacePath,
} from '@/lib/auth/route-access';
import { isAccountRole } from '@/lib/auth/roles';
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

export async function proxy(request: NextRequest) {
  // Pass the trusted route pathname to the server layout. The layout performs
  // the role lookup and authorization; Proxy remains the lightweight session
  // refresh boundary recommended by Next.js.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nexora-pathname', request.nextUrl.pathname);
  const nextResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  let supabaseResponse = nextResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = nextResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // A refresh token can be invalidated remotely (for example after a
  // Supabase project is paused/resumed). Clear only the auth-token cookie
  // family so the browser can start a clean login instead of replaying the
  // same consumed token on every request.
  if (authError?.code === 'refresh_token_not_found') {
    request.cookies.getAll().forEach(({ name }) => {
      if (!name.startsWith('sb-') || !name.includes('-auth-token')) return;
      request.cookies.delete(name);
      supabaseResponse.cookies.set(name, '', {
        ...SUPABASE_COOKIE_OPTIONS,
        expires: new Date(0),
        maxAge: 0,
      });
    });
  }

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (
    user &&
    (request.nextUrl.pathname === '/login' ||
      request.nextUrl.pathname === '/signup' ||
      request.nextUrl.pathname === '/forgot-password')
  ) {
    const url = request.nextUrl.clone();
    const inviteToken = request.nextUrl.searchParams.get('invite');
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`;
      url.search = '';
    } else {
      url.pathname = '/dashboard';
      url.search = '';
    }
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/catalogo',
    '/pipelines',
    '/broadcasts',
    '/automations',
    '/settings',
    '/notifications',
    '/flows',
    '/agents',
    '/plans',
    '/billing',
    '/platform',
    '/support',
    '/onboarding',
  ];
  if (
    !user &&
    protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // This runs for every document/RSC request, whereas shared layouts can be
  // retained during client navigation. RLS remains the final data boundary.
  const pathname = request.nextUrl.pathname;
  const isProtectedDocument = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  if (user && isProtectedDocument) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = profile?.account_role;
    let onboardingCompleted = true;
    if (profile?.account_id) {
      const { data: account } = await supabase
        .from('accounts')
        .select('onboarding_completed')
        .eq('id', profile.account_id)
        .maybeSingle();
      onboardingCompleted = account?.onboarding_completed !== false;
    }

    if (!onboardingCompleted && pathname !== '/onboarding') {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      return withRefreshedCookies(NextResponse.redirect(url));
    }
    if (onboardingCompleted && pathname === '/onboarding') {
      const url = request.nextUrl.clone();
      url.pathname = isAccountRole(role) ? homePathForRole(role) : '/dashboard';
      url.search = '';
      return withRefreshedCookies(NextResponse.redirect(url));
    }
    if (
      isAdminWorkspacePath(pathname) &&
      (!isAccountRole(role) || !canAccessAppPath(role, pathname))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/inbox';
      url.search = '';
      return withRefreshedCookies(NextResponse.redirect(url));
    }
  }

  // API routes that need auth. Meta webhooks and the local WhatsApp Web
  // bridge authenticate with their own signatures/secrets, so they must
  // reach their route handlers before a browser session exists.
  const isWhatsAppIngress =
    request.nextUrl.pathname.includes('/webhook') ||
    request.nextUrl.pathname === '/api/whatsapp/web/inbound' ||
    request.nextUrl.pathname === '/api/whatsapp/web/status' ||
    request.nextUrl.pathname === '/api/whatsapp/web/media';
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
    !isWhatsAppIngress
  ) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
