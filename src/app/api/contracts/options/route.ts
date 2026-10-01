import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { buildContractContactPrefill } from '@/lib/contracts/prefill';
import { loadCompanyLegalProfile } from '@/lib/contracts/server';
import { isUuid } from '@/lib/validation/uuid';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const searchParams = new URL(request.url).searchParams;
    const conversationId = searchParams.get('conversationId');
    const requestedContactId = searchParams.get('contactId');
    if (conversationId && !isUuid(conversationId)) {
      return NextResponse.json(
        { error: 'Identificador de conversación inválido.' },
        { status: 400 }
      );
    }
    if (requestedContactId && !isUuid(requestedContactId)) {
      return NextResponse.json(
        { error: 'Identificador de contacto inválido.' },
        { status: 400 }
      );
    }

    const [company, account, contacts, members, conversation, leadProfiles] =
      await Promise.all([
        loadCompanyLegalProfile(ctx),
        ctx.supabase
          .from('accounts')
          .select('name, logo_url')
          .eq('id', ctx.accountId)
          .single(),
        ctx.supabase
          .from('contacts')
          .select(
            'id, name, phone, email, rut, company, address, commune, city, region, occupation, monthly_income, employment_type, employment_tenure, down_payment, interest_product, vehicle_plate, vehicle_price, payment_method, financing_requested, profile_sources'
          )
          .eq('account_id', ctx.accountId)
          .order('name', { ascending: true, nullsFirst: false })
          .limit(1000),
        ctx.supabase
          .from('profiles')
          .select('user_id, full_name, email, account_role')
          .eq('account_id', ctx.accountId)
          .order('full_name'),
        conversationId
          ? ctx.supabase
              .from('conversations')
              .select('id, contact_id, assigned_agent_id')
              .eq('account_id', ctx.accountId)
              .eq('id', conversationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        ctx.supabase
          .from('conversation_lead_profiles')
          .select(
            'conversation_id, contact_id, full_name, rut, phone, email, address, commune, city, region, occupation, company, monthly_income, employment_type, employment_tenure, down_payment, vehicle_interest, vehicle_plate, vehicle_price, payment_method, financing_requested, updated_at'
          )
          .eq('account_id', ctx.accountId)
          .order('updated_at', { ascending: false })
          .limit(1000),
      ]);
    if (
      account.error ||
      contacts.error ||
      members.error ||
      conversation.error ||
      leadProfiles.error
    )
      throw new Error('contract_options_load_failed');

    const selectedContactId =
      conversation.data?.contact_id ?? requestedContactId ?? null;
    const latestProfileByContact = new Map<
      string,
      (typeof leadProfiles.data)[number]
    >();
    for (const profile of leadProfiles.data ?? []) {
      if (!latestProfileByContact.has(profile.contact_id)) {
        latestProfileByContact.set(profile.contact_id, profile);
      }
    }
    if (conversationId && selectedContactId) {
      const conversationProfile = (leadProfiles.data ?? []).find(
        (profile) => profile.conversation_id === conversationId
      );
      if (conversationProfile) {
        latestProfileByContact.set(selectedContactId, conversationProfile);
      }
    }
    const contactOptions = (contacts.data ?? []).map((contact) => ({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      rut: contact.rut,
      company: contact.company,
      prefill: buildContractContactPrefill(
        contact,
        latestProfileByContact.get(contact.id) ?? null
      ),
    }));
    const selectedPrefill =
      contactOptions.find((contact) => contact.id === selectedContactId)
        ?.prefill ?? null;
    return NextResponse.json({
      company: {
        ...company,
        displayName:
          company.tradeName || company.legalName || account.data.name,
        logoUrl: account.data.logo_url,
      },
      contacts: contactOptions,
      members: (members.data ?? []).filter(
        (member) =>
          member.account_role !== 'viewer' &&
          (hasMinRole(ctx.role, 'admin') || member.user_id === ctx.userId)
      ),
      conversation: conversation.data,
      selectedContactId,
      selectedPrefill,
      currentUserId: ctx.userId,
      currentRole: ctx.role,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
