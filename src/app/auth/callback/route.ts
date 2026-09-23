import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const requestedNext = url.searchParams.get('next');
  const safeNext =
    requestedNext === '/reset-password' ? requestedNext : '/dashboard';

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_callback', url.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_or_expired_link', url.origin)
    );
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
