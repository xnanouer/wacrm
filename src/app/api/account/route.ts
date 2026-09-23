// ============================================================
// /api/account
//
//   GET   — current caller's account + role. Any member.
//   PATCH — rename the account.                  Admin+.
//
// Why both verbs share a route file
//   They speak about the same singular resource (the caller's
//   account) and reuse the same `requireRole` plumbing. Splitting
//   them across files would duplicate the `account_id` lookup
//   without buying anything.
// ============================================================

import { NextResponse } from 'next/server';

import {
  requireRole,
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  isActiveIndustry,
  type BusinessSubtype,
} from '@/lib/industries/config';

const BUSINESS_SUBTYPES = new Set<BusinessSubtype>([
  'construction_company',
  'real_estate_agency',
  'construction_and_real_estate',
]);

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('accounts')
      .select(
        'id, name, logo_url, industry, business_subtype, onboarding_completed, onboarding_completed_at, onboarding_answers'
      )
      .eq('id', ctx.accountId)
      .single();
    if (error) throw error;
    return NextResponse.json({
      account: data,
      role: ctx.role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_NAME_LEN = 80;
const MAX_LOGO_URL_LEN = 2000;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');

    // Per-user limit on admin-class mutations. Bounds accidental
    // abuse (script run in a loop) and a compromised admin session
    // spamming renames. Each admin endpoint keys its own bucket so
    // one route doesn't starve another.
    const limit = checkRateLimit(
      `admin:rename:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      logoUrl?: unknown;
      industry?: unknown;
      businessSubtype?: unknown;
    } | null;
    const rawName = body?.name;

    if (typeof rawName !== 'string') {
      return NextResponse.json(
        { error: "'name' must be a string" },
        { status: 400 }
      );
    }

    const name = rawName.trim();
    if (name.length === 0) {
      return NextResponse.json(
        { error: 'Account name cannot be empty' },
        { status: 400 }
      );
    }
    if (name.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `Account name must be ${MAX_NAME_LEN} characters or fewer` },
        { status: 400 }
      );
    }

    const rawLogoUrl = body?.logoUrl;
    if (rawLogoUrl !== undefined && rawLogoUrl !== null) {
      if (
        typeof rawLogoUrl !== 'string' ||
        rawLogoUrl.length > MAX_LOGO_URL_LEN
      ) {
        return NextResponse.json(
          { error: "'logoUrl' must be a valid company logo URL" },
          { status: 400 }
        );
      }

      const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
        /\/$/,
        ''
      );
      const expectedPrefix = `${storageBase}/storage/v1/object/public/company-logos/${ctx.accountId}/`;
      if (!storageBase || !rawLogoUrl.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: 'The company logo must come from Nexora storage' },
          { status: 400 }
        );
      }
    }

    const logoUrl =
      rawLogoUrl === null
        ? null
        : typeof rawLogoUrl === 'string'
          ? rawLogoUrl
          : undefined;

    const rawIndustry = body?.industry;
    if (rawIndustry !== undefined && !isActiveIndustry(rawIndustry)) {
      return NextResponse.json(
        { error: 'Selecciona un tipo de empresa disponible' },
        { status: 400 }
      );
    }

    let businessSubtype: BusinessSubtype | null | undefined;
    if (rawIndustry === 'automotive') {
      businessSubtype = null;
    } else if (rawIndustry === 'real_estate_construction') {
      if (
        typeof body?.businessSubtype !== 'string' ||
        !BUSINESS_SUBTYPES.has(body.businessSubtype as BusinessSubtype)
      ) {
        return NextResponse.json(
          { error: 'Selecciona el tipo de empresa inmobiliaria' },
          { status: 400 }
        );
      }
      businessSubtype = body.businessSubtype as BusinessSubtype;
    } else if (body?.businessSubtype !== undefined) {
      return NextResponse.json(
        { error: 'El subtipo requiere un tipo de empresa compatible' },
        { status: 400 }
      );
    }

    // RLS allows this UPDATE because accounts_update requires
    // `is_account_member(id, 'admin')`, and requireRole already
    // guaranteed the caller is admin+.
    const { data, error } = await ctx.supabase
      .from('accounts')
      .update({
        name,
        ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
        ...(rawIndustry !== undefined ? { industry: rawIndustry } : {}),
        ...(businessSubtype !== undefined
          ? { business_subtype: businessSubtype }
          : {}),
      })
      .eq('id', ctx.accountId)
      .select('id, name, logo_url, industry, business_subtype')
      .single();

    if (error) {
      console.error('[PATCH /api/account] update error:', error);
      return NextResponse.json(
        { error: 'Failed to update account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
