import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadCatalogData } from '@/lib/catalog/server';
import { loadQuotationSettings } from '@/lib/quotes/server';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const [
      settings,
      catalog,
      contactsResult,
      membersResult,
      conversationResult,
    ] = await Promise.all([
      loadQuotationSettings(ctx),
      loadCatalogData(ctx),
      ctx.supabase
        .from('contacts')
        .select('id, name, phone, email, rut, company')
        .eq('account_id', ctx.accountId)
        .order('name', { ascending: true, nullsFirst: false })
        .limit(250),
      ctx.supabase
        .from('profiles')
        .select('user_id, full_name, email, account_role')
        .eq('account_id', ctx.accountId)
        .order('full_name'),
      conversationId
        ? ctx.supabase
            .from('conversations')
            .select(
              'id, contact_id, assigned_agent_id, contact:contacts!conversations_contact_id_fkey(id, name, phone, email, rut, company)'
            )
            .eq('account_id', ctx.accountId)
            .eq('id', conversationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (
      contactsResult.error ||
      membersResult.error ||
      conversationResult.error
    ) {
      throw new Error('quotation_options_load_failed');
    }
    return NextResponse.json({
      settings,
      catalog: catalog.vehicles.filter((vehicle) =>
        ['available', 'reserved'].includes(vehicle.status)
      ),
      contacts: contactsResult.data ?? [],
      members: (membersResult.data ?? []).filter(
        (member) => member.account_role !== 'viewer'
      ),
      conversation: conversationResult.data,
      currentUserId: ctx.userId,
      role: ctx.role,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
