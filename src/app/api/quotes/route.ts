import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  parseQuotationInput,
  quotationInputToRpcPayload,
} from '@/lib/quotes/payload';
import { loadQuotations, quotationFromRow } from '@/lib/quotes/server';
import {
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from '@/lib/quotes/types';
import { validateQuotationInput } from '@/lib/quotes/validation';

function mutationError(error: { message?: string; code?: string }) {
  const message = error.message ?? '';
  if (message.includes('quotation_installment_required')) {
    return NextResponse.json(
      { error: 'Agrega al menos una opción de financiamiento.' },
      { status: 400 }
    );
  }
  if (message.includes('quotation_conversation_forbidden')) {
    return NextResponse.json(
      { error: 'No tienes acceso operativo a esa conversación.' },
      { status: 403 }
    );
  }
  if (error.code === '23505') {
    return NextResponse.json(
      { error: 'La cotización ya existe. Intenta nuevamente.' },
      { status: 409 }
    );
  }
  console.error('[quotes] mutation failed:', error);
  return NextResponse.json(
    { error: 'No fue posible guardar la cotización.' },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const status =
      statusValue && statusValue in QUOTATION_STATUS_LABELS
        ? (statusValue as QuotationStatus)
        : undefined;
    const data = await loadQuotations(ctx, {
      query: url.searchParams.get('q') ?? undefined,
      status,
      contactId: url.searchParams.get('contactId') ?? undefined,
      conversationId: url.searchParams.get('conversationId') ?? undefined,
      page: Number(url.searchParams.get('page') ?? 1),
      pageSize: Number(url.searchParams.get('pageSize') ?? 20),
    });
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quotation-create:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const input = parseQuotationInput(await request.json().catch(() => null));
    if (!input) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }
    const validation = validateQuotationInput(input);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Revisa los campos marcados.', errors: validation.errors },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase.rpc('create_vehicle_quotation', {
      p_payload: quotationInputToRpcPayload(input),
    });
    if (error || !data) return mutationError(error ?? {});
    return NextResponse.json(
      { quotation: quotationFromRow(data as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
