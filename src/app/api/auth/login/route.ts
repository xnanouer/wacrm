import { NextResponse } from 'next/server';

import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

function getSessionClockDelayMs(accessToken: string | undefined): number {
  if (!accessToken) return 0;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')
    ) as { iat?: unknown };
    if (typeof payload.iat !== 'number') return 0;
    return Math.max(0, payload.iat * 1_000 - Date.now() + 1_500);
  } catch {
    return 0;
  }
}

export async function POST(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientIp =
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwardedFor?.split(',')[0]?.trim() ||
    'local';

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 254 || password.length > 256) {
    return NextResponse.json(
      { error: 'Email y contraseña son obligatorios' },
      { status: 400 }
    );
  }

  const ipLimit = checkRateLimit(`login-ip:${clientIp}`, RATE_LIMITS.loginIp);
  if (!ipLimit.success) return rateLimitResponse(ipLimit);

  const limit = checkRateLimit(
    `login:${clientIp}:${email.toLowerCase()}`,
    RATE_LIMITS.login
  );
  if (!limit.success) return rateLimitResponse(limit);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const upstreamUnavailable =
      (typeof error.status === 'number' && error.status >= 500) ||
      /fetch failed|network|timeout|timed out|econn|enotfound|eacces/i.test(
        error.message
      );
    if (upstreamUnavailable) {
      console.error('[auth] Supabase login unavailable:', error.message);
      return NextResponse.json(
        {
          error:
            'No pudimos conectar con el servicio de acceso. Intenta nuevamente en unos segundos.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Correo o contraseña incorrectos' },
      { status: 401 }
    );
  }

  if (!data.user) {
    return NextResponse.json(
      { error: 'Correo o contraseña incorrectos' },
      { status: 401 }
    );
  }

  const sessionClockDelayMs = getSessionClockDelayMs(
    data.session?.access_token
  );
  console.info('[auth] session issued', {
    userId: data.user.id,
    clockDelayMs: sessionClockDelayMs,
  });

  return NextResponse.json({
    success: true,
    sessionClockDelayMs: Math.min(sessionClockDelayMs, 5 * 60_000),
  });
}
