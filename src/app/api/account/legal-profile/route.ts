import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  legalProfileFromRow,
  loadCompanyLegalProfile,
} from '@/lib/contracts/server';

function field(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    return NextResponse.json({ profile: await loadCompanyLegalProfile(ctx) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `company-legal-profile:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body)
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

    const legalName = field(body.legalName, 180);
    const tradeName = field(body.tradeName, 180);
    if (!legalName || !tradeName)
      return NextResponse.json(
        { error: 'La razón social y el nombre comercial son obligatorios.' },
        { status: 400 }
      );

    const row = {
      account_id: ctx.accountId,
      legal_name: legalName,
      trade_name: tradeName,
      tax_id: field(body.taxId, 30),
      business_activity: field(body.businessActivity, 240),
      legal_address: field(body.legalAddress, 300),
      commune: field(body.commune, 120),
      city: field(body.city, 120),
      region: field(body.region, 120),
      phone: field(body.phone, 40),
      email: field(body.email, 160),
      legal_representative_name: field(body.legalRepresentativeName, 180),
      legal_representative_tax_id: field(body.legalRepresentativeTaxId, 30),
      default_branch_name: field(body.defaultBranchName, 160),
      default_branch_address: field(body.defaultBranchAddress, 300),
    };
    const { data, error } = await ctx.supabase
      .from('account_legal_profiles')
      .upsert(row, { onConflict: 'account_id' })
      .select('*')
      .single();
    if (error || !data) {
      console.error('[company legal profile] save failed:', error);
      return NextResponse.json(
        { error: 'No se pudo guardar la ficha legal.' },
        { status: 500 }
      );
    }

    // Keep the already-existing quotation document identity aligned while
    // account_legal_profiles becomes the source of truth for new modules.
    await ctx.supabase
      .from('quotation_settings')
      .update({
        company_display_name: tradeName,
        company_rut: row.tax_id,
        company_phone: row.phone,
        company_email: row.email,
        company_address: [row.legal_address, row.commune, row.city]
          .filter(Boolean)
          .join(', '),
      })
      .eq('account_id', ctx.accountId);

    return NextResponse.json({ profile: legalProfileFromRow(data) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
