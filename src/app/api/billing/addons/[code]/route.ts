import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  loadMercadoPagoSettings,
  mercadoPagoRequest,
} from '@/lib/billing/mercado-pago';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireRole('admin');
    const { code } = await context.params;
    if (code !== 'follow_up_agent') {
      return NextResponse.json(
        { error: 'Complemento inválido.' },
        { status: 404 }
      );
    }
    const admin = supabaseAdmin();
    const { data: addon, error } = await admin
      .from('account_addons')
      .select('status, provider, provider_subscription_id')
      .eq('account_id', auth.accountId)
      .eq('addon_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!addon || addon.status === 'canceled') {
      return NextResponse.json({ success: true, alreadyCanceled: true });
    }

    if (addon.provider === 'mercadopago' && addon.provider_subscription_id) {
      const runtime = await loadMercadoPagoSettings();
      await mercadoPagoRequest(
        runtime.accessToken,
        `/preapproval/${encodeURIComponent(addon.provider_subscription_id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        }
      );
    }

    const now = new Date().toISOString();
    const [addonUpdate, agentUpdate, jobsUpdate, intentUpdate] =
      await Promise.all([
        admin
          .from('account_addons')
          .update({ status: 'canceled', canceled_at: now })
          .eq('account_id', auth.accountId)
          .eq('addon_code', code),
        admin
          .from('ai_follow_up_agents')
          .update({ is_active: false, updated_by: auth.userId })
          .eq('account_id', auth.accountId),
        admin
          .from('ai_follow_up_jobs')
          .update({
            status: 'canceled',
            cancel_reason: 'addon_canceled',
            completed_at: now,
          })
          .eq('account_id', auth.accountId)
          .in('status', ['pending', 'running']),
        admin
          .from('billing_checkout_intents')
          .update({ status: 'canceled', completed_at: now })
          .eq('account_id', auth.accountId)
          .eq('kind', 'addon')
          .eq('addon_code', code)
          .in('status', ['pending', 'redirected']),
      ]);
    const writeError = [
      addonUpdate.error,
      agentUpdate.error,
      jobsUpdate.error,
      intentUpdate.error,
    ].find(Boolean);
    if (writeError) throw writeError;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
