import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { quotationInputToRpcPayload } from '@/lib/quotes/payload';
import {
  loadQuotation,
  loadQuotationSettings,
  quotationFromRow,
} from '@/lib/quotes/server';
import { isUuid } from '@/lib/validation/uuid';

type RouteContext = { params: Promise<{ id: string }> };

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const ctx = await requireRole('agent');
    const [{ quotation }, settings] = await Promise.all([
      loadQuotation(ctx, id),
      loadQuotationSettings(ctx),
    ]);
    const issueDate = new Date();
    const validUntil = new Date(issueDate);
    validUntil.setDate(validUntil.getDate() + settings.defaultValidityDays);
    const { data, error } = await ctx.supabase.rpc('create_vehicle_quotation', {
      p_payload: quotationInputToRpcPayload({
        ...quotation,
        issueDate: isoDate(issueDate),
        validUntil: isoDate(validUntil),
        internalNotes: quotation.internalNotes
          ? `${quotation.internalNotes}\nDuplicada desde ${quotation.quoteNumber}.`
          : `Duplicada desde ${quotation.quoteNumber}.`,
      }),
    });
    if (error || !data) {
      return NextResponse.json(
        { error: 'No fue posible duplicar la cotización.' },
        { status: 500 }
      );
    }
    const duplicated = quotationFromRow(data as Record<string, unknown>);
    await ctx.supabase.from('quotation_events').insert({
      account_id: ctx.accountId,
      quotation_id: duplicated.id,
      event_type: 'duplicated',
      actor_user_id: ctx.userId,
      metadata: {
        source_quotation_id: quotation.id,
        source_number: quotation.quoteNumber,
      },
    });
    return NextResponse.json({ quotation: duplicated }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
