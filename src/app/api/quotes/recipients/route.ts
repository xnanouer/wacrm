import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select('id, name, phone, email, company')
      .eq('account_id', ctx.accountId)
      .not('phone', 'is', null)
      .order('name', { ascending: true, nullsFirst: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({
      contacts: (data ?? []).filter((contact) => contact.phone?.trim()),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
