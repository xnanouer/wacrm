// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  canManageMembers,
  isAccountRole,
  isAssignableAccountRole,
} from '@/lib/auth/roles';
import {
  createAccountMember,
  getAccountSeatUsage,
  MemberProvisionError,
} from '@/lib/members/provision';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import type { AccountMember } from '@/types';
import { isUuid } from '@/lib/validation/uuid';

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role, created_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/account/members] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load members' },
        { status: 500 }
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? '',
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
        },
      ];
    });

    const seats = await getAccountSeatUsage(
      ctx.accountId,
      ctx.account.plan_code
    );

    return NextResponse.json({ members, seats });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:memberCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json(
        { error: 'Solicitud inválida' },
        { status: 400 }
      );
    }

    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const departmentIds = Array.isArray(body.departmentIds)
      ? [
          ...new Set(
            body.departmentIds.filter(
              (id): id is string => typeof id === 'string'
            )
          ),
        ]
      : [];

    if (fullName.length < 2 || fullName.length > 80) {
      return NextResponse.json(
        { error: 'El nombre debe tener entre 2 y 80 caracteres' },
        { status: 400 }
      );
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Ingresa un correo electrónico válido' },
        { status: 400 }
      );
    }
    if (
      password.length < 10 ||
      password.length > 128 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return NextResponse.json(
        {
          error:
            'La contraseña debe tener al menos 10 caracteres, una letra y un número',
        },
        { status: 400 }
      );
    }
    if (!isAssignableAccountRole(role)) {
      return NextResponse.json(
        { error: "El rol debe ser 'Administrador' o 'Agente'" },
        { status: 400 }
      );
    }
    if (departmentIds.length > 50 || departmentIds.some((id) => !isUuid(id))) {
      return NextResponse.json(
        { error: 'La selección de departamentos es inválida' },
        { status: 400 }
      );
    }
    if (role !== 'agent' && departmentIds.length > 0) {
      return NextResponse.json(
        { error: 'Este rol no utiliza asignaciones por departamento' },
        { status: 400 }
      );
    }

    const result = await createAccountMember({
      accountId: ctx.accountId,
      planCode: ctx.account.plan_code,
      fullName,
      email,
      password,
      role,
      departmentIds,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MemberProvisionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
