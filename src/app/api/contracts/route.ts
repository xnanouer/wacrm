import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  inputToRpcPayload,
  parseVehicleConsignmentInput,
  validateVehicleConsignmentInput,
} from '@/lib/contracts/payload';
import { contractFromRow, loadContracts } from '@/lib/contracts/server';
import {
  CONTRACT_STATUS_LABELS,
  type ContractStatus,
} from '@/lib/contracts/types';
import { isUuid } from '@/lib/validation/uuid';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const status =
      statusValue && statusValue in CONTRACT_STATUS_LABELS
        ? (statusValue as ContractStatus)
        : undefined;
    const creatorValue = url.searchParams.get('creator');
    return NextResponse.json(
      await loadContracts(ctx, {
        query: url.searchParams.get('q') ?? undefined,
        status,
        createdByUserId:
          creatorValue && isUuid(creatorValue) ? creatorValue : undefined,
        page: Number(url.searchParams.get('page') ?? 1),
      })
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `contract-create:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const parsedInput = parseVehicleConsignmentInput(
      await request.json().catch(() => null)
    );
    if (!parsedInput)
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    let input = parsedInput;
    if (!hasMinRole(ctx.role, 'admin')) {
      const { data: profile, error: profileError } = await ctx.supabase
        .from('profiles')
        .select('full_name, email')
        .eq('account_id', ctx.accountId)
        .eq('user_id', ctx.userId)
        .single();
      if (profileError || !profile)
        return NextResponse.json(
          { error: 'No fue posible identificar al ejecutivo.' },
          { status: 403 }
        );
      input = {
        ...parsedInput,
        executiveUserId: ctx.userId,
        executiveName: profile.full_name || profile.email || 'Ejecutivo Nexora',
        executiveEmail: profile.email || '',
      };
    }
    const errors = validateVehicleConsignmentInput(input);
    if (Object.keys(errors).length)
      return NextResponse.json(
        { error: 'Revisa los campos marcados.', errors },
        { status: 400 }
      );
    const { data, error } = await ctx.supabase.rpc(
      'create_vehicle_consignment_contract',
      { p_payload: inputToRpcPayload(input) }
    );
    if (error || !data) {
      console.error('[contracts] create failed:', error);
      return NextResponse.json(
        { error: 'No fue posible guardar el contrato.' },
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
