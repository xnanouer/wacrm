import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { PlatformRole } from './types';

const PLATFORM_RANK: Record<PlatformRole, number> = {
  platform_owner: 3,
  platform_admin: 2,
  platform_support: 1,
};

export class PlatformUnauthorizedError extends Error {
  readonly status = 401 as const;
}

export class PlatformForbiddenError extends Error {
  readonly status = 403 as const;
}

export interface PlatformContext {
  userId: string;
  email: string;
  role: PlatformRole;
}

function configuredOwnerEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_OWNER_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    value === 'platform_owner' ||
    value === 'platform_admin' ||
    value === 'platform_support'
  );
}

/**
 * Secure platform bootstrap: an authenticated email must be explicitly listed
 * in the server-only PLATFORM_OWNER_EMAILS setting. The resulting DB row makes
 * later authorization auditable and avoids trusting a client-side flag.
 */
async function bootstrapConfiguredOwner(userId: string, email: string) {
  if (!configuredOwnerEmails().has(email.toLowerCase())) return null;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('platform_admins')
    .upsert(
      { user_id: userId, role: 'platform_owner' },
      { onConflict: 'user_id' }
    )
    .select('role')
    .single();
  if (error) throw error;
  return data;
}

export async function requirePlatformRole(
  minimum: PlatformRole = 'platform_support'
): Promise<PlatformContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email)
    throw new PlatformUnauthorizedError('Unauthorized');

  const admin = supabaseAdmin();
  const platformAdminResult = await admin
    .from('platform_admins')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  let platformAdmin = platformAdminResult.data;
  const platformError = platformAdminResult.error;

  if (platformError) throw platformError;
  if (!platformAdmin) {
    platformAdmin = await bootstrapConfiguredOwner(user.id, user.email);
  }

  if (!platformAdmin || !isPlatformRole(platformAdmin.role)) {
    throw new PlatformForbiddenError('Platform access required');
  }
  if (PLATFORM_RANK[platformAdmin.role] < PLATFORM_RANK[minimum]) {
    throw new PlatformForbiddenError('Insufficient platform role');
  }

  return { userId: user.id, email: user.email, role: platformAdmin.role };
}

export function toPlatformErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof PlatformUnauthorizedError ||
    error instanceof PlatformForbiddenError
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  console.error('[platform] unexpected error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
