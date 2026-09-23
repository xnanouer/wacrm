'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Loader2,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AiUsageSummary } from '@/lib/ai/points/types';
import {
  POINT_PACKAGES,
  estimatePointBalance,
  formatClp,
  formatNumber,
  pointPackagePricePerThousand,
  recommendPlanForPointPackage,
  type CommercialPlanCode,
  type PointPackage,
} from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

interface PointPackagesProps {
  currentPlanCode: string;
  usage: AiUsageSummary | null;
  onViewPlan: (planCode: CommercialPlanCode) => void;
}

export function PointPackages({
  currentPlanCode,
  usage,
  onViewPlan,
}: PointPackagesProps) {
  const [selectedPackage, setSelectedPackage] = useState<PointPackage | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const recommendation = useMemo(
    () =>
      selectedPackage
        ? recommendPlanForPointPackage(currentPlanCode, selectedPackage.id)
        : null,
    [currentPlanCode, selectedPackage]
  );

  const currentBalance = usage?.totalAvailable ?? null;
  const estimatedBalance =
    selectedPackage && currentBalance !== null
      ? estimatePointBalance(currentBalance, selectedPackage)
      : null;

  const openPackage = (pointPackage: PointPackage) => {
    setSelectedPackage(pointPackage);
    setDialogOpen(true);
  };

  const startCheckout = async () => {
    if (!selectedPackage) return;
    setCheckoutLoading(true);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'points',
          pointPackageId: selectedPackage.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        checkoutUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error || 'No se pudo iniciar el pago.');
      }
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo iniciar el pago.'
      );
      setCheckoutLoading(false);
    }
  };

  const viewRecommendedPlan = () => {
    if (!recommendation) return;
    setDialogOpen(false);
    onViewPlan(recommendation.recommendedPlan.code);
  };

  return (
    <div id="point-packages" className="mt-8 scroll-mt-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            ¿Necesitas más Puntos Nexora?
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight">
            Elige capacidad adicional
          </h3>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
            Compra capacidad adicional. Los puntos se acreditan solamente
            después de que Mercado Pago confirme el pago.
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-primary/25 bg-primary/10 text-primary"
        >
          Compra segura
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {POINT_PACKAGES.map((pointPackage) => {
          const isSelected = selectedPackage?.id === pointPackage.id;
          const pricePerThousand = pointPackagePricePerThousand(pointPackage);

          return (
            <Card
              key={pointPackage.id}
              data-selected={isSelected}
              className={cn(
                'relative transition-all duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none',
                'hover:shadow-primary/10 hover:-translate-y-1 hover:shadow-xl',
                pointPackage.featured &&
                  !isSelected &&
                  'border-primary/35 from-primary/10 to-card bg-gradient-to-b',
                isSelected &&
                  'border-primary from-primary/15 to-card shadow-primary/15 ring-primary/20 -translate-y-1 bg-gradient-to-b shadow-xl ring-2'
              )}
            >
              <CardHeader className="pb-0">
                <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                    {pointPackage.label}
                  </span>
                  {pointPackage.featured ? (
                    <Badge className="text-[9px] tracking-wider uppercase">
                      Más elegido
                    </Badge>
                  ) : null}
                </div>
                <CardTitle className="flex items-end gap-2">
                  <span className="text-3xl font-black tracking-tight">
                    {formatNumber(pointPackage.points)}
                  </span>
                  <span className="text-muted-foreground pb-1 text-xs font-normal">
                    puntos
                  </span>
                </CardTitle>
                <CardDescription className="min-h-16 leading-relaxed">
                  {pointPackage.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex h-full flex-col">
                <div className="border-border border-y py-4">
                  <p className="text-2xl font-black">
                    {formatClp(pointPackage.price)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Aproximadamente {formatClp(pricePerThousand)} por cada 1.000
                    puntos
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="size-4" />
                  Se agrega al saldo disponible
                </div>

                <Button
                  type="button"
                  className="mt-5 w-full transition-transform active:scale-[0.98]"
                  variant={pointPackage.featured ? 'default' : 'outline'}
                  onClick={() => openPackage(pointPackage)}
                >
                  <Coins />
                  Agregar puntos
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="border-border bg-muted/30 mt-4 grid gap-3 rounded-xl border p-4 text-xs leading-relaxed md:grid-cols-3">
        <p>Comprar Puntos Nexora adicionales no cambia tu plan.</p>
        <p>
          Los Puntos Nexora adicionales no aumentan la cantidad de usuarios ni
          conexiones disponibles.
        </p>
        <p>
          Agregar usuarios o conexiones tampoco entrega Puntos Nexora
          adicionales.
        </p>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setCheckoutLoading(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="bg-primary/10 text-primary mb-1 flex size-11 items-center justify-center rounded-xl">
              <WalletCards className="size-5" />
            </div>
            <DialogTitle className="text-xl">Agregar Puntos Nexora</DialogTitle>
            <DialogDescription>
              Revisa los puntos y el total antes de continuar a Mercado Pago.
            </DialogDescription>
          </DialogHeader>

          {selectedPackage ? (
            <div className="space-y-4">
              <div className="from-primary/12 to-primary/4 border-primary/20 rounded-xl border bg-gradient-to-br p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-3xl font-black">
                      {formatNumber(selectedPackage.points)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Puntos Nexora adicionales
                    </p>
                  </div>
                  <p className="text-xl font-black">
                    {formatClp(selectedPackage.price)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/45 rounded-xl p-4">
                  <p className="text-muted-foreground text-xs">Saldo actual</p>
                  <p className="mt-1 text-xl font-bold">
                    {currentBalance === null
                      ? 'No disponible'
                      : formatNumber(currentBalance)}
                  </p>
                </div>
                <div className="bg-primary/10 rounded-xl p-4">
                  <p className="text-primary text-xs">Saldo simulado</p>
                  <p className="mt-1 text-xl font-bold">
                    {estimatedBalance === null
                      ? 'No disponible'
                      : formatNumber(estimatedBalance)}
                  </p>
                </div>
              </div>

              {usage ? (
                <div className="text-muted-foreground flex justify-between gap-4 text-xs">
                  <span>
                    Plan: {formatNumber(usage.monthlyAvailable)} disponibles
                  </span>
                  <span>
                    Adicionales: {formatNumber(usage.additionalAvailable)}{' '}
                    disponibles
                  </span>
                </div>
              ) : null}

              {recommendation ? (
                <div className="border-primary/25 bg-primary/10 rounded-xl border p-4">
                  <div className="flex gap-3">
                    <TrendingUp className="text-primary mt-0.5 size-5 shrink-0" />
                    <div>
                      <p className="font-bold">
                        {recommendation.recommendedPlanIsCheaper
                          ? `${recommendation.recommendedPlan.name} puede ser más conveniente`
                          : `Por prácticamente el mismo valor puedes pasar a ${recommendation.recommendedPlan.name}`}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {recommendation.currentPlan.name} más esta recarga suma{' '}
                        {formatClp(recommendation.combinedPrice)}.{' '}
                        {recommendation.recommendedPlan.name} cuesta{' '}
                        {formatClp(recommendation.recommendedPlan.price)} al mes
                        e incluye{' '}
                        {formatNumber(
                          recommendation.recommendedPlan.nexoraPoints
                        )}{' '}
                        puntos mensuales,{' '}
                        {recommendation.recommendedPlan.includedUsers} usuarios
                        y {recommendation.recommendedPlan.includedConnections}{' '}
                        conexiones.
                      </p>
                      <p className="text-primary mt-2 text-sm font-bold">
                        {recommendation.recommendedPlanIsCheaper
                          ? `Con ${recommendation.recommendedPlan.name} pagarías ${formatClp(recommendation.priceDifference)} menos este mes.`
                          : `La diferencia es de solo ${formatClp(recommendation.priceDifference)} al mes.`}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={viewRecommendedPlan}
                      >
                        Ver {recommendation.recommendedPlan.name}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="text-muted-foreground flex gap-2 text-xs leading-relaxed">
                <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
                Esta recarga es un pago único y no activa cobros automáticos.
                Los puntos adicionales se mantienen separados y se consumen
                después de los mensuales.
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={checkoutLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void startCheckout()}
              disabled={!selectedPackage || checkoutLoading}
            >
              {checkoutLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Coins />
              )}
              Pagar con Mercado Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
