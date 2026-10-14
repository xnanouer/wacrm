import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  loadMercadoPagoSettings,
  mercadoPagoRequest,
  type MercadoPagoRuntimeSettings,
} from '@/lib/billing/mercado-pago';

const GRACE_DAYS = 5;

interface MercadoPagoPreapproval {
  id: string;
  external_reference?: string | number | null;
  status?: string | null;
  payer_id?: string | number | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    currency_id?: string | null;
    transaction_amount?: number | null;
  } | null;
}

interface MercadoPagoPayment {
  id: string | number;
  external_reference?: string | null;
  status?: string | null;
  status_detail?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  date_approved?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface MercadoPagoAuthorizedPayment {
  id: string | number;
  preapproval_id?: string | null;
  currency_id?: string | null;
  transaction_amount?: string | number | null;
  debit_date?: string | null;
  status?: string | null;
  summarized?: string | null;
  payment?: {
    id?: string | number | null;
    status?: string | null;
    status_detail?: string | null;
  } | null;
}

interface CheckoutIntent {
  id: string;
  account_id: string;
  kind: 'subscription' | 'points' | 'addon';
  plan_code: string | null;
  point_package_id: string | null;
  addon_code: string | null;
  amount: number | string;
  currency: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export interface ReconcileResult {
  accountId: string;
  intentId: string;
  status: string;
  kind: CheckoutIntent['kind'];
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function addMonth(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

function paymentStatus(value: string | null | undefined) {
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  if (value === 'cancelled' || value === 'canceled') return 'canceled';
  if (value === 'refunded' || value === 'charged_back') return 'canceled';
  return 'pending';
}

async function getIntent(reference: unknown): Promise<CheckoutIntent | null> {
  if (typeof reference !== 'string' || !reference.trim()) return null;
  const { data, error } = await supabaseAdmin()
    .from('billing_checkout_intents')
    .select(
      'id, account_id, kind, plan_code, point_package_id, addon_code, amount, currency, status, metadata'
    )
    .eq('id', reference.trim())
    .maybeSingle();
  if (error) throw error;
  return (data as CheckoutIntent | null) ?? null;
}

function assertExpectedAmount(
  intent: CheckoutIntent,
  amount: number | null | undefined,
  currency: string | null | undefined
) {
  if (
    !Number.isFinite(amount) ||
    Number(amount) !== Number(intent.amount) ||
    currency !== intent.currency
  ) {
    throw new Error('MERCADO_PAGO_AMOUNT_MISMATCH');
  }
}

async function runtimeSettings(settings?: MercadoPagoRuntimeSettings) {
  return settings ?? loadMercadoPagoSettings();
}

async function stopAddonRuntime(
  accountId: string,
  reason: string,
  disableAgent: boolean
) {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const writes = [
    admin
      .from('ai_follow_up_jobs')
      .update({
        status: 'canceled',
        cancel_reason: reason,
        completed_at: now,
      })
      .eq('account_id', accountId)
      .in('status', ['pending', 'running']),
  ];
  if (disableAgent) {
    writes.push(
      admin
        .from('ai_follow_up_agents')
        .update({ is_active: false })
        .eq('account_id', accountId)
    );
  }
  const results = await Promise.all(writes);
  const error = results.map((result) => result.error).find(Boolean);
  if (error) throw error;
}

async function syncAddonFromPreapproval(
  intent: CheckoutIntent,
  subscription: MercadoPagoPreapproval,
  providerStatus: string
) {
  if (intent.kind !== 'addon' || !intent.addon_code) return;
  const now = new Date().toISOString();
  const status =
    providerStatus === 'authorized'
      ? 'active'
      : providerStatus === 'paused'
        ? 'past_due'
        : providerStatus === 'cancelled' || providerStatus === 'canceled'
          ? 'canceled'
          : 'pending';
  const { error } = await supabaseAdmin()
    .from('account_addons')
    .upsert(
      {
        account_id: intent.account_id,
        addon_code: intent.addon_code,
        status,
        monthly_price_snapshot: Number(intent.amount),
        included_points: Number(intent.metadata?.included_points ?? 0),
        provider: 'mercadopago',
        provider_subscription_id: subscription.id,
        current_period_ends_at: subscription.next_payment_date ?? null,
        activated_at: status === 'active' ? now : null,
        canceled_at: status === 'canceled' ? now : null,
      },
      { onConflict: 'account_id,addon_code' }
    );
  if (error) throw error;
  if (status !== 'active') {
    await stopAddonRuntime(
      intent.account_id,
      status === 'canceled' ? 'addon_canceled' : 'addon_payment_inactive',
      status === 'canceled'
    );
  }
}

async function grantAddonPoints(
  intent: CheckoutIntent,
  providerPaymentId: string,
  paidAt?: string | null
) {
  if (intent.kind !== 'addon') return;
  const points = Number(intent.metadata?.included_points ?? 0);
  if (!Number.isSafeInteger(points) || points <= 0) return;
  const base = paidAt ? new Date(paidAt) : new Date();
  const expiresAt = new Date(base);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);
  const { error } = await supabaseAdmin()
    .from('ai_point_grants')
    .insert({
      account_id: intent.account_id,
      source: 'purchase',
      original_points: points,
      expires_at: expiresAt.toISOString(),
      reference: `mercadopago:addon:${providerPaymentId}`,
      metadata: {
        checkout_intent_id: intent.id,
        addon_code: intent.addon_code,
        provider_payment_id: providerPaymentId,
      },
    });
  if (error && error.code !== '23505') throw error;
}

export async function reconcileMercadoPagoSubscription(
  subscriptionId: string,
  settings?: MercadoPagoRuntimeSettings,
  expectedAccountId?: string
): Promise<ReconcileResult | null> {
  const runtime = await runtimeSettings(settings);
  const subscription = await mercadoPagoRequest<MercadoPagoPreapproval>(
    runtime.accessToken,
    `/preapproval/${encodeURIComponent(subscriptionId)}`
  );
  const intent = await getIntent(String(subscription.external_reference ?? ''));
  if (
    !intent ||
    (intent.kind !== 'subscription' && intent.kind !== 'addon') ||
    (intent.kind === 'subscription' && !intent.plan_code) ||
    (intent.kind === 'addon' && !intent.addon_code)
  ) {
    return null;
  }
  if (expectedAccountId && intent.account_id !== expectedAccountId) {
    throw new Error('BILLING_ACCOUNT_MISMATCH');
  }

  assertExpectedAmount(
    intent,
    subscription.auto_recurring?.transaction_amount,
    subscription.auto_recurring?.currency_id
  );

  const admin = supabaseAdmin();
  const status = subscription.status ?? 'pending';
  const now = new Date();
  const intentStatus =
    status === 'authorized'
      ? 'approved'
      : status === 'cancelled' || status === 'canceled'
        ? 'canceled'
        : status === 'paused'
          ? 'rejected'
          : 'redirected';

  const { error: intentError } = await admin
    .from('billing_checkout_intents')
    .update({
      provider_reference: subscription.id,
      status: intentStatus,
      completed_at: intentStatus === 'approved' ? now.toISOString() : null,
    })
    .eq('id', intent.id);
  if (intentError) throw intentError;

  if (intent.kind === 'addon') {
    await syncAddonFromPreapproval(intent, subscription, status);
    return {
      accountId: intent.account_id,
      intentId: intent.id,
      status,
      kind: intent.kind,
    };
  }

  if (status === 'authorized') {
    const { error } = await admin
      .from('accounts')
      .update({
        plan_code: intent.plan_code,
        subscription_status: 'active',
        billing_provider: 'mercadopago',
        billing_customer_id:
          subscription.payer_id === null || subscription.payer_id === undefined
            ? null
            : String(subscription.payer_id),
        billing_subscription_id: subscription.id,
        trial_ends_at: null,
        grace_ends_at: null,
        suspended_at: null,
        suspension_reason: null,
        current_period_ends_at: subscription.next_payment_date ?? null,
      })
      .eq('id', intent.account_id);
    if (error) throw error;
  } else if (status === 'paused') {
    const { error } = await admin
      .from('accounts')
      .update({
        subscription_status: 'past_due',
        grace_ends_at: addDays(now, GRACE_DAYS),
        billing_provider: 'mercadopago',
        billing_subscription_id: subscription.id,
        suspension_reason: 'Pago de suscripción pendiente',
      })
      .eq('id', intent.account_id);
    if (error) throw error;
  } else if (status === 'cancelled' || status === 'canceled') {
    const { error } = await admin
      .from('accounts')
      .update({
        subscription_status: 'canceled',
        billing_provider: 'mercadopago',
        billing_subscription_id: subscription.id,
        suspended_at: now.toISOString(),
        grace_ends_at: null,
        suspension_reason: 'Suscripción cancelada',
      })
      .eq('id', intent.account_id);
    if (error) throw error;
  }

  return {
    accountId: intent.account_id,
    intentId: intent.id,
    status,
    kind: intent.kind,
  };
}

export async function reconcileMercadoPagoPayment(
  paymentId: string,
  settings?: MercadoPagoRuntimeSettings,
  expectedAccountId?: string
): Promise<ReconcileResult | null> {
  const runtime = await runtimeSettings(settings);
  const payment = await mercadoPagoRequest<MercadoPagoPayment>(
    runtime.accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}`
  );
  const intent = await getIntent(payment.external_reference);
  if (!intent) return null;
  if (expectedAccountId && intent.account_id !== expectedAccountId) {
    throw new Error('BILLING_ACCOUNT_MISMATCH');
  }

  assertExpectedAmount(intent, payment.transaction_amount, payment.currency_id);

  const admin = supabaseAdmin();
  const normalizedStatus = paymentStatus(payment.status);
  const providerPaymentId = String(payment.id);
  const { error: paymentError } = await admin.from('billing_payments').upsert(
    {
      account_id: intent.account_id,
      checkout_intent_id: intent.id,
      provider: 'mercadopago',
      provider_payment_id: providerPaymentId,
      provider_subscription_id:
        typeof payment.metadata?.preapproval_id === 'string'
          ? payment.metadata.preapproval_id
          : null,
      kind: intent.kind,
      status: payment.status ?? 'unknown',
      amount: Number(payment.transaction_amount),
      currency: payment.currency_id,
      status_detail: payment.status_detail ?? null,
      paid_at: payment.date_approved ?? null,
      raw_summary: {
        status: payment.status ?? null,
        status_detail: payment.status_detail ?? null,
      },
    },
    { onConflict: 'provider,provider_payment_id' }
  );
  if (paymentError) throw paymentError;

  const { error: intentError } = await admin
    .from('billing_checkout_intents')
    .update({
      status: normalizedStatus,
      completed_at:
        normalizedStatus === 'approved' ? new Date().toISOString() : null,
    })
    .eq('id', intent.id);
  if (intentError) throw intentError;

  if (normalizedStatus === 'approved' && intent.kind === 'points') {
    const points = Number(intent.metadata?.points);
    if (!Number.isSafeInteger(points) || points <= 0) {
      throw new Error('INVALID_POINT_CHECKOUT_METADATA');
    }
    const { error } = await admin.from('ai_point_grants').insert({
      account_id: intent.account_id,
      source: 'purchase',
      original_points: points,
      reference: `mercadopago:${providerPaymentId}`,
      metadata: {
        checkout_intent_id: intent.id,
        point_package_id: intent.point_package_id,
        provider_payment_id: providerPaymentId,
      },
    });
    if (error && error.code !== '23505') throw error;
  }

  if (normalizedStatus === 'approved' && intent.kind === 'subscription') {
    const { error } = await admin
      .from('accounts')
      .update({
        plan_code: intent.plan_code,
        subscription_status: 'active',
        billing_provider: 'mercadopago',
        trial_ends_at: null,
        grace_ends_at: null,
        suspended_at: null,
        suspension_reason: null,
      })
      .eq('id', intent.account_id);
    if (error) throw error;
  }

  if (intent.kind === 'addon' && intent.addon_code) {
    if (normalizedStatus !== 'pending') {
      const addonStatus =
        normalizedStatus === 'approved'
          ? 'active'
          : normalizedStatus === 'rejected'
            ? 'past_due'
            : 'canceled';
      const { error } = await admin
        .from('account_addons')
        .update({
          status: addonStatus,
          activated_at:
            addonStatus === 'active' ? new Date().toISOString() : undefined,
          canceled_at:
            addonStatus === 'canceled' ? new Date().toISOString() : null,
        })
        .eq('account_id', intent.account_id)
        .eq('addon_code', intent.addon_code);
      if (error) throw error;
      if (addonStatus !== 'active') {
        await stopAddonRuntime(
          intent.account_id,
          addonStatus === 'canceled'
            ? 'addon_canceled'
            : 'addon_payment_inactive',
          addonStatus === 'canceled'
        );
      }
    }
    if (normalizedStatus === 'approved') {
      await grantAddonPoints(intent, providerPaymentId, payment.date_approved);
    }
  }

  return {
    accountId: intent.account_id,
    intentId: intent.id,
    status: payment.status ?? 'unknown',
    kind: intent.kind,
  };
}

export async function reconcileMercadoPagoAuthorizedPayment(
  authorizedPaymentId: string,
  settings?: MercadoPagoRuntimeSettings
): Promise<ReconcileResult | null> {
  const runtime = await runtimeSettings(settings);
  const invoice = await mercadoPagoRequest<MercadoPagoAuthorizedPayment>(
    runtime.accessToken,
    `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`
  );
  if (!invoice.preapproval_id) return null;

  const admin = supabaseAdmin();
  const { data: intent, error: intentError } = await admin
    .from('billing_checkout_intents')
    .select(
      'id, account_id, kind, plan_code, point_package_id, addon_code, amount, currency, status, metadata'
    )
    .eq('provider', 'mercadopago')
    .eq('provider_reference', invoice.preapproval_id)
    .in('kind', ['subscription', 'addon'])
    .maybeSingle();
  if (intentError) throw intentError;
  if (!intent) return null;

  const typedIntent = intent as CheckoutIntent;
  assertExpectedAmount(
    typedIntent,
    Number(invoice.transaction_amount),
    invoice.currency_id
  );

  const paymentId = invoice.payment?.id;
  const status =
    invoice.payment?.status ?? invoice.summarized ?? invoice.status;
  if (paymentId === null || paymentId === undefined || !status) return null;
  const normalizedStatus = paymentStatus(status);
  const now = new Date();

  const { error: paymentError } = await admin.from('billing_payments').upsert(
    {
      account_id: typedIntent.account_id,
      checkout_intent_id: typedIntent.id,
      provider: 'mercadopago',
      provider_payment_id: String(paymentId),
      provider_subscription_id: invoice.preapproval_id,
      kind: typedIntent.kind,
      status,
      amount: Number(invoice.transaction_amount),
      currency: invoice.currency_id,
      status_detail: invoice.payment?.status_detail ?? null,
      paid_at: normalizedStatus === 'approved' ? now.toISOString() : null,
      raw_summary: {
        authorized_payment_id: String(invoice.id),
        summarized: invoice.summarized ?? null,
        retry_status: invoice.status ?? null,
      },
    },
    { onConflict: 'provider,provider_payment_id' }
  );
  if (paymentError) throw paymentError;

  if (normalizedStatus === 'approved') {
    if (typedIntent.kind === 'subscription') {
      const { error } = await admin
        .from('accounts')
        .update({
          subscription_status: 'active',
          grace_ends_at: null,
          suspended_at: null,
          suspension_reason: null,
          current_period_ends_at: addMonth(invoice.debit_date),
        })
        .eq('id', typedIntent.account_id)
        .eq('billing_subscription_id', invoice.preapproval_id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('account_addons')
        .update({
          status: 'active',
          current_period_ends_at: addMonth(invoice.debit_date),
          activated_at: now.toISOString(),
          canceled_at: null,
        })
        .eq('account_id', typedIntent.account_id)
        .eq('addon_code', typedIntent.addon_code)
        .eq('provider_subscription_id', invoice.preapproval_id);
      if (error) throw error;
      await grantAddonPoints(
        typedIntent,
        String(paymentId),
        invoice.debit_date
      );
    }
  } else if (normalizedStatus === 'rejected') {
    if (typedIntent.kind === 'subscription') {
      const { error } = await admin
        .from('accounts')
        .update({
          subscription_status: 'past_due',
          grace_ends_at: addDays(now, GRACE_DAYS),
          suspension_reason: 'Mercado Pago no pudo procesar la renovación',
        })
        .eq('id', typedIntent.account_id)
        .eq('billing_subscription_id', invoice.preapproval_id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('account_addons')
        .update({ status: 'past_due' })
        .eq('account_id', typedIntent.account_id)
        .eq('addon_code', typedIntent.addon_code)
        .eq('provider_subscription_id', invoice.preapproval_id);
      if (error) throw error;
      await stopAddonRuntime(
        typedIntent.account_id,
        'addon_payment_inactive',
        false
      );
    }
  }

  return {
    accountId: typedIntent.account_id,
    intentId: typedIntent.id,
    status,
    kind: typedIntent.kind,
  };
}
