import { NextResponse } from 'next/server';

import { getCurrentAccount } from '@/lib/auth/account';
import {
  reconcileMercadoPagoPayment,
  reconcileMercadoPagoSubscription,
} from '@/lib/billing/mercado-pago-reconcile';

function redirectToPlans(request: Request, state: string) {
  const url = new URL('/plans', request.url);
  url.searchParams.set('payment', state);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAccount({ allowInactive: true });
    const url = new URL(request.url);
    const subscriptionId = url.searchParams.get('preapproval_id');
    const paymentId = url.searchParams.get('payment_id');

    let result = null;
    if (subscriptionId) {
      result = await reconcileMercadoPagoSubscription(
        subscriptionId,
        undefined,
        context.accountId
      );
    } else if (paymentId) {
      result = await reconcileMercadoPagoPayment(
        paymentId,
        undefined,
        context.accountId
      );
    }

    if (!result) return redirectToPlans(request, 'pending');
    return redirectToPlans(
      request,
      result.status === 'approved' || result.status === 'authorized'
        ? 'approved'
        : 'pending'
    );
  } catch (error) {
    console.error('[billing/return] reconciliation failed', error);
    return redirectToPlans(request, 'error');
  }
}
