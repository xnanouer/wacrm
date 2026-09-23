import crypto from 'crypto';
import { NextResponse } from 'next/server';

import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  buildGoogleAuthorizationUrl,
  googleOAuthConfigured,
} from '@/lib/platform-support/calendar';

export async function GET(request: Request) {
  try {
    await requirePlatformRole('platform_owner');
    if (!googleOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            'Configura GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET en el servidor.',
        },
        { status: 503 }
      );
    }
    const state = crypto.randomBytes(32).toString('hex');
    const response = NextResponse.redirect(
      buildGoogleAuthorizationUrl(state, new URL(request.url).origin)
    );
    response.cookies.set('nexora_google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
