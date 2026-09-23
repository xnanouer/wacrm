import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  parsePaymentCommitmentInput,
  paymentCommitmentToRpcPayload,
  validatePaymentCommitmentInput,
} from '@/lib/contracts/payment-commitment-payload';
import { contractFromRow } from '@/lib/contracts/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `contract-create:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const parsed = parsePaymentCommitmentInput(
      await request.json().catch(() => null)
    );
    if (!parsed)
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    let input = parsed;
    if (!hasMinRole(ctx.role, 'admin')) {
      const { data: profile, error } = await ctx.supabase
        .from('profiles')
        .select('full_name, email')
        .eq('account_id', ctx.accountId)
        .eq('user_id', ctx.userId)
        .single();
      if (error || !profile)
        return NextResponse.json(
          { error: 'No fue posible identificar al ejecutivo.' },
          { status: 403 }
        );
      input = {
        ...parsed,
        executiveUserId: ctx.userId,
        executiveName: profile.full_name || profile.email || 'Ejecutivo Nexora',
        executiveEmail: profile.email || '',
      };
    }
    const errors = validatePaymentCommitmentInput(input);
    if (Object.keys(errors).length)
      return NextResponse.json(
        { error: 'Revisa los campos marcados.', errors },
        { status: 400 }
      );
    const { data, error } = await ctx.supabase.rpc(
      'create_payment_commitment_contract',
      {
        p_payload: paymentCommitmentToRpcPayload(input),
      }
    );
    if (error || !data) {
      console.error('[contracts] payment commitment create failed:', error);
      return NextResponse.json(
        { error: 'No fue posible guardar el compromiso.' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { contract: contractFromRow(data as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
