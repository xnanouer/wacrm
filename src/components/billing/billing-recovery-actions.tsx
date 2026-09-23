'use client';

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  COMMERCIAL_PLANS,
  formatClp,
  type CommercialPlanCode,
} from '@/lib/billing/plans';

export function BillingRecoveryActions({
  currentPlanCode,
}: {
  currentPlanCode: string;
}) {
  const fallback: CommercialPlanCode = 'professional';
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlanCode>(
    COMMERCIAL_PLANS.some((plan) => plan.code === currentPlanCode)
      ? (currentPlanCode as CommercialPlanCode)
      : fallback
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'subscription', planCode: selectedPlan }),
      });
      const payload = (await response.json().catch(() => null)) as {
        checkoutUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error || 'No se pudo iniciar el pago.');
      }
      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'No se pudo iniciar el pago.'
      );
      setLoading(false);
    }
  }

  return (
    <div className="border-border space-y-4 border-t pt-6">
      <div>
        <p className="text-foreground text-sm font-semibold">
          Reactivar con Mercado Pago
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Selecciona el plan y autoriza la tarjeta en Mercado Pago. El cobro
          quedará programado mensualmente hasta que canceles la suscripción.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {COMMERCIAL_PLANS.map((plan) => (
          <Button
            key={plan.code}
            type="button"
            variant={selectedPlan === plan.code ? 'default' : 'outline'}
            className="h-auto justify-start py-3"
            disabled={loading}
            onClick={() => setSelectedPlan(plan.code)}
          >
            <span className="text-left">
              <span className="block font-bold">{plan.name}</span>
              <span className="block text-xs opacity-80">
                {formatClp(plan.price)} / mes
              </span>
            </span>
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        disabled={loading}
        onClick={() => void checkout()}
      >
        {loading ? <Loader2 className="animate-spin" /> : <CreditCard />}
        Autorizar pago automático
      </Button>
    </div>
  );
}
