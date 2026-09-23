import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { isUuid } from '@/lib/validation/uuid';

const PROFILE_COLUMNS =
  'id, account_id, conversation_id, contact_id, full_name, rut, phone, city, vehicle_interest, down_payment, income_proof, employment_type, employment_tenure, has_dicom, trade_in, trade_in_vehicle, purchase_timeline, financing_requested, captured_by_ai, updated_at';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Identificador de conversación inválido.' },
        { status: 400 }
      );
    }

    // Conversation RLS is the authoritative visibility check. Agents can read
    // this sensitive profile only for tickets they are allowed to see.
    const { data: conversation, error: conversationError } = await ctx.supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada.' },
        { status: 404 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('conversation_lead_profiles')
      .select(PROFILE_COLUMNS)
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ profile: data ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
