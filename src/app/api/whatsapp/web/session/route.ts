import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  callWhatsAppWebService,
  isWhatsAppWebServiceOffline,
  type WhatsAppWebSessionStatus,
} from '@/lib/whatsapp/web-service';

export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function offlineStatus(error: unknown): WhatsAppWebSessionStatus & {
  serviceOffline: true;
} {
  return {
    status: 'error',
    qrDataUrl: null,
    phone: null,
    displayName: null,
    lastError: isWhatsAppWebServiceOffline(error)
      ? 'El servicio de WhatsApp por QR no está ejecutándose. Reinicia Nexora con npm run dev.'
      : error instanceof Error
        ? error.message
        : 'No se pudo consultar la sesión.',
    updatedAt: new Date().toISOString(),
    serviceOffline: true,
  };
}

async function accountChannelUsage(
  ctx: Awaited<ReturnType<typeof getCurrentAccount>>
) {
  const [
    { data: plan, error: planError },
    { count: whatsappCount, error: whatsappError },
    { count: socialCount, error: socialError },
  ] = await Promise.all([
    ctx.supabase
      .from('saas_plans')
      .select('max_channels')
      .eq('code', ctx.account.plan_code)
      .maybeSingle(),
    ctx.supabase
      .from('whatsapp_config')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId),
    ctx.supabase
      .from('channel_connections')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId),
  ]);
  if (planError || whatsappError || socialError || !plan) {
    throw (
      planError ?? whatsappError ?? socialError ?? new Error('Plan not found')
    );
  }
  const current = (whatsappCount ?? 0) + (socialCount ?? 0);
  return {
    current,
    max: plan.max_channels as number | null,
    remaining:
      plan.max_channels === null
        ? null
        : Math.max(0, Number(plan.max_channels) - current),
  };
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data: connections, error } = await ctx.supabase
      .from('whatsapp_config')
      .select(
        'id, connection_name, is_default, status, display_phone, display_name, connected_at, default_department_id, created_at, department:departments!whatsapp_config_default_department_account_fkey(id, name, color)'
      )
      .eq('account_id', ctx.accountId)
      .eq('provider', 'whatsapp_web')
      .order('created_at');
    if (error) throw error;

    const hydrated = await Promise.all(
      (connections ?? []).map(async (connection) => {
        let session: WhatsAppWebSessionStatus & { serviceOffline?: boolean };
        try {
          session = await callWhatsAppWebService<WhatsAppWebSessionStatus>(
            ctx.accountId,
            connection.id
          );
          // A persisted linked-device session is restored lazily after the
          // worker restarts. Only connections that were previously connected
          // are auto-started; new/disconnected slots wait for an admin click.
          if (session.status === 'idle' && connection.status === 'connected') {
            session = await callWhatsAppWebService<WhatsAppWebSessionStatus>(
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
          }
          if (session.status === 'connected') {
            const { error: syncError } = await ctx.supabase
              .from('whatsapp_config')
              .update({
                status: 'connected',
                display_phone: session.phone,
                display_name: session.displayName,
                connected_at:
                  connection.connected_at ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', connection.id)
              .eq('account_id', ctx.accountId);
            if (syncError) {
              session = {
                ...session,
                status: 'error',
                lastError:
                  syncError.code === '23505'
                    ? 'Este número ya está conectado en otra empresa.'
                    : syncError.message,
              };
            }
          }
        } catch (sessionError) {
          session = offlineStatus(sessionError);
        }
        return { ...connection, session };
      })
    );

    return NextResponse.json({
      connections: hydrated,
      usage: await accountChannelUsage(ctx),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `whatsapp-web-create:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      departmentId?: unknown;
    } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const departmentId =
      body?.departmentId === null || body?.departmentId === ''
        ? null
        : typeof body?.departmentId === 'string'
          ? body.departmentId
          : undefined;
    if (!name || name.length > 60) {
      return NextResponse.json(
        { error: 'El nombre debe tener entre 1 y 60 caracteres.' },
        { status: 400 }
      );
    }
    if (
      departmentId === undefined ||
      (departmentId && !UUID_PATTERN.test(departmentId))
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

    const usage = await accountChannelUsage(ctx);
    if (usage.max !== null && usage.current >= usage.max) {
      return NextResponse.json(
        {
          error: `El plan actual permite ${usage.max} canal${usage.max === 1 ? '' : 'es'}. Actualiza el plan para conectar otro WhatsApp.`,
          code: 'plan_channel_limit_reached',
        },
        { status: 409 }
      );
    }

    const { count: existingCount } = await ctx.supabase
      .from('whatsapp_config')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);
    const { data: connection, error: insertError } = await ctx.supabase
      .from('whatsapp_config')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        provider: 'whatsapp_web',
        connection_name: name,
        is_default: (existingCount ?? 0) === 0,
        status: 'disconnected',
        default_department_id: departmentId,
        phone_number_id: null,
        waba_id: null,
        access_token: null,
        verify_token: null,
      })
      .select(
        'id, connection_name, is_default, status, display_phone, display_name, connected_at, default_department_id, created_at'
      )
      .single();
    if (insertError || !connection) {
      const channelLimit = insertError?.message.includes(
        'PLAN_CHANNEL_LIMIT_REACHED'
      );
      return NextResponse.json(
        {
          error: channelLimit
            ? 'El plan actual ya alcanzó su límite de canales.'
            : insertError?.message || 'No se pudo crear la conexión.',
          code: channelLimit ? 'plan_channel_limit_reached' : undefined,
        },
        { status: channelLimit ? 409 : 400 }
      );
    }

    let session: WhatsAppWebSessionStatus & { serviceOffline?: boolean };
    try {
      session = await callWhatsAppWebService<WhatsAppWebSessionStatus>(
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
    } catch (sessionError) {
      session = offlineStatus(sessionError);
    }

    return NextResponse.json(
      { connection: { ...connection, session } },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
