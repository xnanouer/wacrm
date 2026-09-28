import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';
import {
  callWhatsAppWebService,
  isWhatsAppWebServiceOffline,
  type WhatsAppWebSessionStatus,
} from '@/lib/whatsapp/web-service';

export const dynamic = 'force-dynamic';

async function findConnection(
  ctx: Awaited<ReturnType<typeof getCurrentAccount>>,
  connectionId: string
) {
  if (!isUuid(connectionId)) return null;
  const { data } = await ctx.supabase
    .from('whatsapp_config')
    .select(
      'id, connection_name, is_default, status, display_phone, display_name, connected_at, default_department_id'
    )
    .eq('id', connectionId)
    .eq('account_id', ctx.accountId)
    .eq('provider', 'whatsapp_web')
    .is('removed_at', null)
    .maybeSingle();
  return data;
}

function serviceError(error: unknown) {
  return NextResponse.json(
    {
      error: isWhatsAppWebServiceOffline(error)
        ? 'El servicio QR no está disponible.'
        : error instanceof Error
          ? error.message
          : 'No se pudo contactar el servicio QR.',
    },
    { status: 502 }
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const ctx = await getCurrentAccount();
    const { connectionId } = await params;
    const connection = await findConnection(ctx, connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Conexión no encontrada.' },
        { status: 404 }
      );
    }
    try {
      const session = await callWhatsAppWebService<WhatsAppWebSessionStatus>(
        ctx.accountId,
        connection.id
      );
      return NextResponse.json({ connection, session });
    } catch (error) {
      return serviceError(error);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `whatsapp-web-connect:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { connectionId } = await params;
    const connection = await findConnection(ctx, connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Conexión no encontrada.' },
        { status: 404 }
      );
    }
    try {
      const session = await callWhatsAppWebService<WhatsAppWebSessionStatus>(
        ctx.accountId,
        connection.id,
        '',
        {
          method: 'POST',
          body: JSON.stringify({
            useLegacyClientId: connection.is_default,
          }),
        }
      );
      return NextResponse.json({ connection, session }, { status: 202 });
    } catch (error) {
      return serviceError(error);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `whatsapp-web-update:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { connectionId } = await params;
    const connection = await findConnection(ctx, connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Conexión no encontrada.' },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      name?: unknown;
      departmentId?: unknown;
    } | null;
    if (body?.action === 'disconnect') {
      try {
        await callWhatsAppWebService<WhatsAppWebSessionStatus>(
          ctx.accountId,
          connection.id,
          '/logout',
          { method: 'POST', body: '{}' }
        );
      } catch (error) {
        if (!isWhatsAppWebServiceOffline(error)) return serviceError(error);
      }

      const { error } = await ctx.supabase
        .from('whatsapp_config')
        .update({
          status: 'disconnected',
          connected_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
        .eq('account_id', ctx.accountId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    const updates: {
      connection_name?: string;
      default_department_id?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (body?.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 60) {
        return NextResponse.json(
          { error: 'El nombre debe tener entre 1 y 60 caracteres.' },
          { status: 400 }
        );
      }
      updates.connection_name = name;
    }
    if (body?.departmentId !== undefined) {
      const departmentId =
        body.departmentId === null || body.departmentId === ''
          ? null
          : typeof body.departmentId === 'string'
            ? body.departmentId
            : undefined;
      if (
        departmentId === undefined ||
        (departmentId !== null && !isUuid(departmentId))
      ) {
        return NextResponse.json(
          { error: 'El departamento seleccionado no es válido.' },
          { status: 400 }
        );
      }
      if (departmentId) {
        const { data: department } = await ctx.supabase
          .from('departments')
          .select('id')
          .eq('id', departmentId)
          .eq('account_id', ctx.accountId)
          .eq('is_active', true)
          .maybeSingle();
        if (!department) {
          return NextResponse.json(
            { error: 'El departamento seleccionado no está disponible.' },
            { status: 400 }
          );
        }
      }
      updates.default_department_id = departmentId;
    }
    if (
      updates.connection_name === undefined &&
      updates.default_department_id === undefined
    ) {
      return NextResponse.json(
        { error: 'No hay cambios válidos.' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('whatsapp_config')
      .update(updates)
      .eq('id', connection.id)
      .eq('account_id', ctx.accountId)
      .select(
        'id, connection_name, is_default, status, display_phone, display_name, connected_at, default_department_id, created_at'
      )
      .single();
    if (error) throw error;
    return NextResponse.json({ connection: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `whatsapp-web-remove:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { connectionId } = await params;
    const connection = await findConnection(ctx, connectionId);
    if (!connection) {
      return NextResponse.json(
        { error: 'Conexión no encontrada.' },
        { status: 404 }
      );
    }

    try {
      await callWhatsAppWebService<WhatsAppWebSessionStatus>(
        ctx.accountId,
        connection.id,
        '/logout',
        { method: 'POST', body: '{}' }
      );
    } catch (error) {
      console.warn(
        '[whatsapp web remove] worker logout failed; removing slot anyway:',
        error instanceof Error ? error.message : error
      );
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from('whatsapp_config')
      .update({
        status: 'disconnected',
        connected_at: null,
        is_default: false,
        removed_at: new Date().toISOString(),
        removed_by_user_id: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id)
      .eq('account_id', ctx.accountId);
    if (error) throw error;

    if (connection.is_default) {
      const { data: replacement, error: replacementError } = await admin
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', ctx.accountId)
        .is('removed_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (replacementError) throw replacementError;
      if (replacement) {
        const { error: defaultError } = await admin
          .from('whatsapp_config')
          .update({ is_default: true })
          .eq('id', replacement.id)
          .eq('account_id', ctx.accountId);
        if (defaultError) throw defaultError;
      }
    }

    return NextResponse.json({ success: true, removed: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
