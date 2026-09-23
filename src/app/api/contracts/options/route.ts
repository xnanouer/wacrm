import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { loadCompanyLegalProfile } from '@/lib/contracts/server';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const conversationId = new URL(request.url).searchParams.get(
      'conversationId'
    );
    const [company, account, contacts, members, conversation] =
      await Promise.all([
        loadCompanyLegalProfile(ctx),
        ctx.supabase
          .from('accounts')
          .select('name, logo_url')
          .eq('id', ctx.accountId)
          .single(),
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
                'id, contact_id, assigned_agent_id, contact:contacts(id, name, phone, email, rut, company)'
              )
              .eq('account_id', ctx.accountId)
              .eq('id', conversationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (account.error || contacts.error || members.error || conversation.error)
      throw new Error('contract_options_load_failed');
    return NextResponse.json({
      company: {
        ...company,
        displayName:
          company.tradeName || company.legalName || account.data.name,
        logoUrl: account.data.logo_url,
      },
      contacts: contacts.data ?? [],
      members: (members.data ?? []).filter(
        (member) =>
          member.account_role !== 'viewer' &&
          (hasMinRole(ctx.role, 'admin') || member.user_id === ctx.userId)
      ),
      conversation: conversation.data,
      currentUserId: ctx.userId,
      currentRole: ctx.role,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
