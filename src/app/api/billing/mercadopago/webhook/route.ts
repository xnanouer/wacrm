import { NextResponse } from 'next/server';

import {
  loadMercadoPagoSettings,
  verifyMercadoPagoWebhookSignature,
} from '@/lib/billing/mercado-pago';
import {
  reconcileMercadoPagoAuthorizedPayment,
  reconcileMercadoPagoPayment,
  reconcileMercadoPagoSubscription,
} from '@/lib/billing/mercado-pago-reconcile';
import { supabaseAdmin } from '@/lib/flows/admin-client';

interface MercadoPagoWebhookBody {
  id?: string | number;
  type?: string;
  action?: string;
  live_mode?: boolean;
  data?: { id?: string | number };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : 'Unknown error';
}

export async function POST(request: Request) {
  let eventRowId: string | null = null;
  try {
    const runtime = await loadMercadoPagoSettings();
    const url = new URL(request.url);
    const body = (await request
      .json()
      .catch(() => null)) as MercadoPagoWebhookBody | null;
    const dataId = String(
      body?.data?.id ?? url.searchParams.get('data.id') ?? ''
    );
    const requestId = request.headers.get('x-request-id');
    const signatureIsValid = verifyMercadoPagoWebhookSignature({
      xSignature: request.headers.get('x-signature'),
      xRequestId: requestId,
      dataId,
      secret: runtime.webhookSecret,
    });
    if (!signatureIsValid) {
      return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
    }
    if (!body || !dataId) {
      return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
    }
    if (
      (runtime.environment === 'test' && body.live_mode === true) ||
      (runtime.environment === 'production' && body.live_mode !== true)
    ) {
      return NextResponse.json(
        { error: 'El evento no corresponde al entorno configurado.' },
        { status: 400 }
      );
    }

    const type = body.type ?? url.searchParams.get('type') ?? 'unknown';
    const providerEventId = `${type}:${String(body.id ?? requestId ?? dataId)}`;
    const admin = supabaseAdmin();
    const { error: insertError } = await admin
      .from('billing_provider_events')
      .insert({
        provider: 'mercadopago',
        provider_event_id: providerEventId,
        event_type: type,
        resource_id: dataId,
        live_mode: body.live_mode === true,
        payload: body,
      });
    if (insertError && insertError.code !== '23505') throw insertError;

    const { data: event, error: eventError } = await admin
      .from('billing_provider_events')
      .select('id, status')
      .eq('provider', 'mercadopago')
      .eq('provider_event_id', providerEventId)
      .single();
    if (eventError) throw eventError;
    eventRowId = event.id;
    if (event.status === 'processed' || event.status === 'ignored') {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (event.status === 'processing') {
      return NextResponse.json({ received: true, processing: true });
    }

    const { data: claim, error: claimError } = await admin
      .from('billing_provider_events')
      .update({ status: 'processing', error_message: null })
      .eq('id', event.id)
      .in('status', ['received', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) {
      return NextResponse.json({ received: true, processing: true });
    }

    let result = null;
    if (type === 'subscription_preapproval') {
      result = await reconcileMercadoPagoSubscription(dataId, runtime);
    } else if (type === 'subscription_authorized_payment') {
      result = await reconcileMercadoPagoAuthorizedPayment(dataId, runtime);
    } else if (type === 'payment') {
      result = await reconcileMercadoPagoPayment(dataId, runtime);
    }

    const finalStatus = result ? 'processed' : 'ignored';
    const { error: processedError } = await admin
      .from('billing_provider_events')
      .update({
        status: finalStatus,
        processed_at: new Date().toISOString(),
      })
      .eq('id', event.id);
    if (processedError) throw processedError;

    return NextResponse.json({ received: true });
  } catch (error) {
    if (eventRowId) {
      await supabaseAdmin()
        .from('billing_provider_events')
        .update({ status: 'failed', error_message: errorMessage(error) })
        .eq('id', eventRowId);
    }
    console.error('[billing/webhook] processing failed', error);
    return NextResponse.json(
      { error: 'No se pudo procesar la notificación.' },
      { status: 500 }
    );
  }
}
