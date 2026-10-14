'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CarFront,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CreditCard,
  Globe2,
  History,
  Images,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PointPackages } from '@/components/billing/point-packages';
import type { AccountPlanSummary } from '@/lib/billing/summary';
import {
  COMMERCIAL_PLANS,
  EXTRA_CONNECTION_PRICE,
  EXTRA_USER_PRICE,
  FOLLOW_UP_AGENT_ADDON,
  TRIAL_DAYS,
  calculatePlan,
  formatClp,
  formatNumber,
  getCommercialPlan,
  recommendHigherPlan,
  type CommercialPlanCode,
} from '@/lib/billing/plans';
import { subscriptionStatusLabel } from '@/lib/billing/access';
import { CATALOG_ADDON, CATALOG_SHARE_MAX_ITEMS } from '@/lib/catalog/config';
import { cn } from '@/lib/utils';

interface PlansAndPaymentsProps {
  summary: AccountPlanSummary;
}

function usagePercentage(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function UsageLine({
  label,
  used,
  limit,
  detail,
}: {
  label: string;
  used: number;
  limit: number | null;
  detail?: string;
}) {
  const percentage = usagePercentage(used, limit);
  const isNearLimit = limit !== null && percentage >= 80;

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {detail ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p>
          ) : null}
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {formatNumber(used)} /{' '}
          {limit === null ? 'Sin límite' : formatNumber(limit)}
        </p>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            isNearLimit ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${limit === null ? 8 : percentage}%` }}
        />
      </div>
    </div>
  );
}

function HelpText({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/45 border-border flex gap-3 rounded-xl border p-3">
      <CircleHelp
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <div>
        <p className="text-foreground text-xs font-semibold">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

function QuantityControl({
  label,
  value,
  minimum,
  step = 1,
  maximum = 999,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  step?: number;
  maximum?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="border-border bg-background/40 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Mínimo incluido: {minimum}
          </p>
        </div>
        <div className="border-border bg-card flex items-center rounded-xl border p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar un elemento de ${label.toLowerCase()}`}
            disabled={value <= minimum}
            onClick={() => onChange(Math.max(minimum, value - step))}
          >
            <Minus />
          </Button>
          <span
            aria-live="polite"
            className="min-w-12 text-center text-base font-bold tabular-nums"
          >
            {value}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Agregar un elemento a ${label.toLowerCase()}`}
            onClick={() => onChange(Math.min(maximum, value + step))}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PlansAndPayments({ summary }: PlansAndPaymentsProps) {
  const currentCommercialPlan = getCommercialPlan(summary.planCode);
  const initialPlanCode = currentCommercialPlan?.code ?? 'professional';
  const [selectedPlanCode, setSelectedPlanCode] =
    useState<CommercialPlanCode>(initialPlanCode);
  const initialPlan = getCommercialPlan(initialPlanCode)!;
  const [users, setUsers] = useState(initialPlan.includedUsers);
  const [connections, setConnections] = useState(
    initialPlan.includedConnections
  );
  const [catalogItems, setCatalogItems] = useState(
    initialPlan.includedCatalogItems
  );
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);
  const [checkoutIssue, setCheckoutIssue] = useState<{
    message: string;
    setupUrl?: string;
  } | null>(null);
  const configuratorRef = useRef<HTMLDivElement>(null);

  const calculation = useMemo(
    () => calculatePlan(selectedPlanCode, users, connections, catalogItems),
    [catalogItems, connections, selectedPlanCode, users]
  );
  const recommendation = useMemo(
    () =>
      recommendHigherPlan(selectedPlanCode, users, connections, catalogItems),
    [catalogItems, connections, selectedPlanCode, users]
  );

  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get('payment');
    if (state === 'approved') {
      toast.success('Pago confirmado. Tu cuenta ya fue actualizada.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (state === 'pending') {
      toast.info('El pago está pendiente de confirmación.');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (state === 'error') {
      toast.error(
        'No pudimos confirmar el pago. Revisa el estado en unos minutos.'
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const hasUnsupportedAddons =
    calculation.extraUsers > 0 ||
    calculation.extraConnections > 0 ||
    calculation.extraCatalogBlocks > 0;
  const followUpAddon = summary.addons.followUpAgent;
  const followUpActive = followUpAddon?.status === 'active';
  const followUpPending = followUpAddon?.status === 'pending';
  const followUpPaymentIssue =
    followUpAddon?.status === 'past_due' ||
    followUpAddon?.status === 'suspended';

  const startPlanCheckout = async () => {
    if (hasUnsupportedAddons) return;
    setCheckoutLoading(true);
    setCheckoutIssue(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'subscription',
          planCode: calculation.plan.code,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        checkoutUrl?: string;
        error?: string;
        setupUrl?: string;
      } | null;
      if (!response.ok || !payload?.checkoutUrl) {
        const message = payload?.error || 'No se pudo iniciar el pago.';
        setCheckoutIssue({ message, setupUrl: payload?.setupUrl });
        toast.error(message);
        setCheckoutLoading(false);
        return;
      }
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo iniciar el pago.'
      );
      setCheckoutLoading(false);
    }
  };

  const startFollowUpAgentCheckout = async () => {
    setAddonLoading(true);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'addon',
          addonCode: FOLLOW_UP_AGENT_ADDON.code,
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
      setAddonLoading(false);
    }
  };

  const cancelFollowUpAgent = async () => {
    if (
      !window.confirm(
        'Se detendrán los seguimientos pendientes y Mercado Pago dejará de renovar este complemento. ¿Deseas continuar?'
      )
    ) {
      return;
    }
    setAddonLoading(true);
    try {
      const response = await fetch(
        `/api/billing/addons/${FOLLOW_UP_AGENT_ADDON.code}`,
        { method: 'DELETE' }
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error || 'No se pudo cancelar el complemento.'
        );
      }
      toast.success('Agente de Seguimiento Pro cancelado.');
      window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo cancelar el complemento.'
      );
      setAddonLoading(false);
    }
  };

  const selectPlan = (
    code: CommercialPlanCode,
    options: { preserveQuantities?: boolean; scroll?: boolean } = {}
  ) => {
    const nextPlan = getCommercialPlan(code)!;
    setCheckoutIssue(null);
    setSelectedPlanCode(code);
    setUsers((current) =>
      options.preserveQuantities
        ? Math.max(nextPlan.includedUsers, current)
        : nextPlan.includedUsers
    );
    setConnections((current) =>
      options.preserveQuantities
        ? Math.max(nextPlan.includedConnections, current)
        : nextPlan.includedConnections
    );
    setCatalogItems((current) =>
      options.preserveQuantities
        ? Math.max(nextPlan.includedCatalogItems, current)
        : nextPlan.includedCatalogItems
    );
    if (options.scroll !== false) {
      requestAnimationFrame(() =>
        configuratorRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      );
    }
  };

  const aiUsage = summary.aiUsage;
  const currentUsersLimit =
    currentCommercialPlan?.includedUsers ?? summary.users.limit;
  const currentConnectionsLimit =
    currentCommercialPlan?.includedConnections ?? summary.connections.limit;
  const currentPointsLimit =
    currentCommercialPlan?.nexoraPoints ?? aiUsage?.monthlyIncluded ?? null;
  const currentCatalogLimit =
    summary.catalog?.limit ??
    currentCommercialPlan?.includedCatalogItems ??
    null;
  const currentPrice = currentCommercialPlan
    ? `${formatClp(currentCommercialPlan.price)} / mes`
    : 'Precio no registrado';
  const statusLabel = subscriptionStatusLabel(summary.subscriptionStatus);
  const trialDate =
    summary.subscriptionStatus === 'trialing' && summary.trialEndsAt
      ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'long' }).format(
          new Date(summary.trialEndsAt)
        )
      : null;

  return (
    <div className="space-y-8 pb-12">
      <section className="border-primary/20 from-primary/15 via-card to-card shadow-primary/5 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-xl sm:p-8">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary"
            >
              Administración de cuenta
            </Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Planes y pagos
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed sm:text-base">
              Revisa el uso de {summary.accountName}, compara alternativas y
              calcula la configuración ideal para tu equipo.
            </p>
          </div>
          <div className="border-primary/20 bg-background/60 rounded-xl border px-4 py-3 backdrop-blur">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Simulador
            </p>
            <p className="mt-1 text-sm font-medium">
              Pago seguro con Mercado Pago
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="current-plan-title">
        <div className="mb-4">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Mi plan
          </p>
          <h2
            id="current-plan-title"
            className="mt-1 text-2xl font-bold tracking-tight"
          >
            Tu capacidad actual, en un vistazo
          </h2>
        </div>

        <Card className="border-primary/20 from-card to-primary/5 bg-gradient-to-br">
          <CardContent className="grid gap-7 p-6 lg:grid-cols-[0.8fr_1.5fr] lg:p-8">
            <div className="border-border flex flex-col justify-between border-b pb-6 lg:border-r lg:border-b-0 lg:pr-8 lg:pb-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-3xl font-black tracking-tight">
                    {currentCommercialPlan?.name ??
                      summary.planName.toUpperCase()}
                  </p>
                  <Badge variant="outline">{statusLabel}</Badge>
                </div>
                <p className="mt-3 text-xl font-bold">{currentPrice}</p>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  El cobro y la renovación se gestionan de forma segura con
                  Mercado Pago.
                </p>
                {trialDate ? (
                  <p className="mt-3 text-sm font-medium text-amber-500">
                    Prueba disponible hasta el {trialDate}.
                  </p>
                ) : null}
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm">
                <Bot className="text-primary size-5" />
                <span>Agente IA Nexora</span>
                <Badge className="ml-auto">Incluido</Badge>
              </div>
            </div>

            <div className="space-y-6">
              <UsageLine
                label="Usuarios"
                used={summary.users.used}
                limit={currentUsersLimit}
                detail="Personas con acceso individual a Nexora."
              />
              <UsageLine
                label="Conexiones"
                used={summary.connections.used}
                limit={currentConnectionsLimit}
                detail="WhatsApp, Instagram y Facebook enlazados."
              />
              {summary.catalog ? (
                <UsageLine
                  label="Vehículos del catálogo"
                  used={summary.catalog.used}
                  limit={currentCatalogLimit}
                  detail={
                    summary.catalog.extraUnits > 0
                      ? `${formatNumber(summary.catalog.extraUnits)} cupos adicionales activos.`
                      : 'Borradores, pendientes, disponibles y reservados consumen capacidad.'
                  }
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  El consumo del catálogo no está disponible en este momento.
                </p>
              )}
              {aiUsage ? (
                <UsageLine
                  label="Puntos Nexora"
                  used={aiUsage.monthlyUsed}
                  limit={currentPointsLimit}
                  detail={`${formatNumber(aiUsage.totalAvailable)} disponibles, incluyendo puntos adicionales.`}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  El consumo de Puntos Nexora no está disponible en este
                  momento.
                </p>
              )}
              <p className="text-muted-foreground border-border border-t pt-4 text-xs">
                La capacidad mostrada corresponde a los límites reales de tu
                empresa y considera los adicionales que tenga activos.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="compare-plans-title">
        <div className="mb-5">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Comparar planes
          </p>
          <h2
            id="compare-plans-title"
            className="mt-1 text-2xl font-bold tracking-tight"
          >
            Elige una base para tu operación
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Seleccionar un plan solo actualiza el simulador. No modifica tu
            suscripción actual.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {COMMERCIAL_PLANS.map((plan) => {
            const isSelected = selectedPlanCode === plan.code;

            return (
              <Card
                key={plan.code}
                data-selected={isSelected}
                className={cn(
                  'relative transition-all duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none',
                  'hover:shadow-primary/10 hover:-translate-y-1 hover:shadow-xl',
                  plan.recommended &&
                    !isSelected &&
                    'border-primary/35 from-primary/8 to-card bg-gradient-to-b shadow-md lg:-translate-y-1',
                  isSelected &&
                    'border-primary from-primary/16 to-card shadow-primary/15 ring-primary/20 -translate-y-2 scale-[1.015] bg-gradient-to-b shadow-2xl ring-2'
                )}
              >
                <CardHeader className="pt-0">
                  <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
                    {isSelected ? (
                      <span className="bg-primary text-primary-foreground shadow-primary/20 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase shadow-md">
                        <Check className="size-3" />
                        Seleccionado
                      </span>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    {plan.recommended ? (
                      <span className="border-primary/30 bg-primary/10 text-primary inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase">
                        Más recomendado
                      </span>
                    ) : null}
                  </div>
                  <CardTitle className="text-xl font-black">
                    {plan.name}
                  </CardTitle>
                  <CardDescription className="min-h-20 leading-relaxed">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex h-full flex-col">
                  <div>
                    <span className="text-3xl font-black tracking-tight">
                      {formatClp(plan.price)}
                    </span>
                    <span className="text-muted-foreground ml-1 text-sm">
                      / mes
                    </span>
                  </div>
                  <ul className="mt-6 space-y-3 text-sm">
                    {[
                      `${plan.includedUsers} usuarios incluidos`,
                      `${plan.includedConnections} conexiones incluidas`,
                      `${formatNumber(plan.includedCatalogItems)} vehículos activos en Catálogo`,
                      `${formatNumber(plan.nexoraPoints)} Puntos Nexora / mes`,
                      'Agente IA Nexora incluido',
                      `${TRIAL_DAYS} días gratis`,
                      ...plan.benefits.slice(0, 2),
                    ].map((benefit) => (
                      <li key={benefit} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    aria-pressed={isSelected}
                    className="mt-7 w-full transition-transform duration-200 active:scale-[0.98]"
                    variant={
                      isSelected || plan.recommended ? 'default' : 'outline'
                    }
                    onClick={() => selectPlan(plan.code)}
                  >
                    <CreditCard />
                    {isSelected
                      ? 'Continuar con este plan'
                      : `Comprar ${plan.name}`}
                  </Button>
                  <p className="text-muted-foreground mt-2 text-center text-[11px]">
                    Revisarás el total antes de autorizar el pago.
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        ref={configuratorRef}
        aria-labelledby="plan-configurator-title"
        className="scroll-mt-6"
      >
        <div className="mb-5">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Personalizar plan
          </p>
          <h2
            id="plan-configurator-title"
            className="mt-1 text-2xl font-bold tracking-tight"
          >
            Diseña la capacidad que necesitas
          </h2>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardHeader>
              <CardTitle>Configura tu plan</CardTitle>
              <CardDescription>
                El precio se actualiza de inmediato. Confirmarás todo antes de
                pagar en Mercado Pago.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-semibold">Plan</p>
                <div className="grid grid-cols-3 gap-2">
                  {COMMERCIAL_PLANS.map((plan) => (
                    <Button
                      key={plan.code}
                      type="button"
                      variant={
                        selectedPlanCode === plan.code ? 'default' : 'outline'
                      }
                      className="h-11"
                      onClick={() => selectPlan(plan.code, { scroll: false })}
                    >
                      {plan.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <QuantityControl
                  label="Usuarios"
                  value={calculation.users}
                  minimum={calculation.plan.includedUsers}
                  onChange={setUsers}
                />
                <QuantityControl
                  label="Conexiones"
                  value={calculation.connections}
                  minimum={calculation.plan.includedConnections}
                  onChange={setConnections}
                />
                <QuantityControl
                  label="Vehículos de catálogo"
                  value={calculation.catalogItems}
                  minimum={calculation.plan.includedCatalogItems}
                  step={CATALOG_ADDON.units}
                  maximum={10_000}
                  onChange={setCatalogItems}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <HelpText title="¿Qué es un usuario?">
                  Una persona con acceso individual a Nexora.
                </HelpText>
                <HelpText title="¿Qué es una conexión?">
                  Una cuenta de WhatsApp, Instagram o Facebook enlazada a
                  Nexora.
                </HelpText>
                <HelpText title="¿Qué es la capacidad de Catálogo?">
                  Es la cantidad de vehículos activos que tu empresa puede
                  mantener. Los adicionales se agregan en bloques de{' '}
                  {CATALOG_ADDON.units}.
                </HelpText>
              </div>

              {recommendation ? (
                <div className="border-primary/30 bg-primary/10 rounded-xl border p-4">
                  <div className="flex gap-3">
                    <Sparkles className="text-primary mt-0.5 size-5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold">
                        {recommendation.recommended.plan.name} es más
                        conveniente para tu configuración
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        Tu configuración con {calculation.plan.name} cuesta{' '}
                        {formatClp(calculation.monthlyTotal)} al mes. Con{' '}
                        {recommendation.recommended.plan.name} pagarías{' '}
                        {formatClp(recommendation.recommended.monthlyTotal)} al
                        mes.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Badge className="bg-emerald-500 text-white">
                          Ahorras {formatClp(recommendation.monthlySavings)} /
                          mes
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            selectPlan(recommendation.recommended.plan.code, {
                              preserveQuantities: true,
                              scroll: false,
                            })
                          }
                        >
                          Ver {recommendation.recommended.plan.name}
                          <ChevronRight />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-primary/25 xl:sticky xl:top-6">
            <CardHeader>
              <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
                Tu configuración
              </p>
              <CardTitle className="text-2xl">
                {calculation.plan.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Usuarios', calculation.users],
                  ['Conexiones', calculation.connections],
                  ['Vehículos', formatNumber(calculation.catalogItems)],
                  ['Puntos / mes', formatNumber(calculation.plan.nexoraPoints)],
                  ['Agente IA', 'Incluido'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="bg-muted/50 rounded-xl p-3 text-center"
                  >
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="border-border space-y-3 border-y py-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Plan base</span>
                  <span className="font-semibold">
                    {formatClp(calculation.plan.price)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {calculation.extraUsers} usuarios adicionales
                  </span>
                  <span className="font-semibold">
                    {formatClp(calculation.extraUsersTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {calculation.extraConnections} conexiones adicionales
                  </span>
                  <span className="font-semibold">
                    {formatClp(calculation.extraConnectionsTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {calculation.extraCatalogBlocks}{' '}
                    {calculation.extraCatalogBlocks === 1
                      ? 'bloque adicional de Catálogo'
                      : 'bloques adicionales de Catálogo'}
                  </span>
                  <span className="font-semibold">
                    {formatClp(calculation.extraCatalogTotal)}
                  </span>
                </div>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Total mensual
                  </p>
                  <p className="mt-1 text-3xl font-black tracking-tight">
                    {formatClp(calculation.monthlyTotal)}
                  </p>
                </div>
                <span className="text-muted-foreground pb-1 text-sm">
                  / mes
                </span>
              </div>

              {hasUnsupportedAddons ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed">
                  El pago automático de adicionales está en preparación. Para
                  contratar ahora, vuelve a la capacidad incluida del plan.
                </div>
              ) : (
                <div className="border-primary/20 bg-primary/5 flex gap-3 rounded-xl border p-4">
                  <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">Pago automático mensual</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      Al continuar, autorizarás a Mercado Pago para proteger tu
                      tarjeta y cobrar este plan cada mes. Nexora nunca recibe
                      ni almacena los datos de la tarjeta.
                    </p>
                  </div>
                </div>
              )}

              {checkoutIssue ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
                >
                  <p className="text-sm font-semibold">
                    {checkoutIssue.message}
                  </p>
                  {checkoutIssue.setupUrl ? (
                    <Link
                      href={checkoutIssue.setupUrl}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                        'mt-3'
                      )}
                    >
                      Configurar Mercado Pago
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {hasUnsupportedAddons ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    selectPlan(calculation.plan.code, { scroll: false })
                  }
                >
                  Restablecer capacidad incluida
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={checkoutLoading}
                  onClick={() => void startPlanCheckout()}
                >
                  {checkoutLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CreditCard />
                  )}
                  Comprar plan
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="extras-title">
        <div className="mb-5">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Adicionales
          </p>
          <h2 id="extras-title" className="mt-1 text-2xl font-bold">
            Crece cuando lo necesites
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                <UserRound className="size-5" />
              </div>
              <div>
                <p className="font-bold">Usuario adicional</p>
                <p className="mt-1 text-xl font-black">
                  {formatClp(EXTRA_USER_PRICE)}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    / mes
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                <WalletCards className="size-5" />
              </div>
              <div>
                <p className="font-bold">Conexión adicional</p>
                <p className="mt-1 text-xl font-black">
                  {formatClp(EXTRA_CONNECTION_PRICE)}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    / mes
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                <CarFront className="size-5" />
              </div>
              <div>
                <p className="font-bold">
                  Bloque de {CATALOG_ADDON.units} vehículos
                </p>
                <p className="mt-1 text-xl font-black">
                  {formatClp(CATALOG_ADDON.monthlyPrice)}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    / mes
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card id="follow-up-agent" className="border-primary/30 scroll-mt-24">
            <CardContent className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                  <Bot className="size-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">Agente de Seguimiento Pro</p>
                    {followUpActive ? (
                      <Badge>Activo</Badge>
                    ) : followUpPending ? (
                      <Badge variant="outline">Pago pendiente</Badge>
                    ) : followUpPaymentIssue ? (
                      <Badge variant="destructive">Pago pendiente</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xl font-black">
                    {formatClp(FOLLOW_UP_AGENT_ADDON.monthlyPrice)}{' '}
                    <span className="text-muted-foreground text-xs font-normal">
                      / mes
                    </span>
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground text-xs leading-5">
                Segundo agente, seguimientos cancelables y{' '}
                {formatNumber(FOLLOW_UP_AGENT_ADDON.includedPoints)} Puntos
                Nexora mensuales incluidos.
              </p>
              {followUpActive ? (
                <div className="mt-auto flex gap-2">
                  <Link
                    href="/agents"
                    className={cn(buttonVariants({ size: 'sm' }), 'flex-1')}
                  >
                    Configurar
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={addonLoading}
                    onClick={cancelFollowUpAgent}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : followUpPaymentIssue ? (
                <div className="mt-auto space-y-2">
                  <p className="text-muted-foreground text-xs">
                    Mercado Pago no pudo renovar el complemento. Cancela esta
                    suscripción antes de contratarlo nuevamente.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={addonLoading}
                    onClick={cancelFollowUpAgent}
                  >
                    Cancelar suscripción
                  </Button>
                </div>
              ) : (
                <div className="mt-auto flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    disabled={addonLoading}
                    onClick={startFollowUpAgentCheckout}
                  >
                    {addonLoading ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <CreditCard className="mr-2 size-4" />
                    )}
                    {followUpPending ? 'Continuar pago' : 'Contratar'}
                  </Button>
                  {followUpPending ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={addonLoading}
                      onClick={cancelFollowUpAgent}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Los adicionales se suman al precio mensual. Agregar usuarios o
          conexiones no aumenta automáticamente tus Puntos Nexora. El agente de
          seguimiento incluye su propia bolsa mensual y luego consume el saldo
          general de la empresa.
        </p>
      </section>

      <section aria-labelledby="catalog-plan-title">
        <div className="mb-5">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Catálogo Nexora
          </p>
          <h2 id="catalog-plan-title" className="mt-1 text-2xl font-bold">
            Inventario incluido en todos los planes
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Administra vehículos, fotografías, precios y aprobaciones desde una
            capacidad independiente para cada empresa.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                  <CarFront className="size-5" />
                </div>
                <div>
                  <CardTitle>Qué incluye el Catálogo</CardTitle>
                  <CardDescription>
                    Herramientas reales para mantener el inventario ordenado.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Images,
                    title: 'Fichas con fotografías',
                    detail:
                      'Datos comerciales, precio, financiamiento, ubicación e imágenes.',
                  },
                  {
                    icon: ClipboardCheck,
                    title: 'Aprobación controlada',
                    detail:
                      'El agente envía la unidad y el administrador aprueba o rechaza.',
                  },
                  {
                    icon: CarFront,
                    title: 'Estados de inventario',
                    detail:
                      'Borrador, pendiente, disponible, reservado, vendido e inactivo.',
                  },
                  {
                    icon: Send,
                    title: 'Preparado para conversaciones',
                    detail: `Selección de hasta ${CATALOG_SHARE_MAX_ITEMS} vehículos por envío desde la Bandeja.`,
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="border-border bg-muted/25 rounded-xl border p-4"
                  >
                    <feature.icon className="text-primary size-5" />
                    <p className="mt-3 text-sm font-bold">{feature.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      {feature.detail}
                    </p>
                  </div>
                ))}
              </div>
              <Link
                href="/catalogo"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'w-full sm:w-auto'
                )}
              >
                Abrir mi Catálogo
                <ChevronRight />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capacidad por plan</CardTitle>
              <CardDescription>
                Cantidad máxima de vehículos activos incluida en el precio
                mensual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {COMMERCIAL_PLANS.map((plan) => (
                  <div
                    key={plan.code}
                    className={cn(
                      'border-border flex items-center justify-between rounded-xl border px-4 py-3',
                      plan.code === summary.planCode &&
                        'border-primary/30 bg-primary/5'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{plan.name}</span>
                      {plan.code === summary.planCode ? (
                        <Badge variant="outline">Tu plan</Badge>
                      ) : null}
                    </div>
                    <span className="text-sm font-black tabular-nums">
                      {formatNumber(plan.includedCatalogItems)} vehículos
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
                <p className="text-sm font-bold">Capacidad adicional</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <p className="text-muted-foreground text-xs">
                    Bloques de {CATALOG_ADDON.units} vehículos activos.
                  </p>
                  <p className="text-lg font-black whitespace-nowrap">
                    {formatClp(CATALOG_ADDON.monthlyPrice)}
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      / mes
                    </span>
                  </p>
                </div>
              </div>

              <HelpText title="¿Qué consume capacidad?">
                Borradores, pendientes de aprobación, disponibles y reservados.
                Las unidades vendidas, inactivas o archivadas no consumen cupo.
              </HelpText>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="nexora-points" aria-labelledby="points-title">
        <div className="mb-5">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Puntos Nexora
          </p>
          <h2 id="points-title" className="mt-1 text-2xl font-bold">
            Inteligencia Artificial, explicada de forma simple
          </h2>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle>Mi consumo</CardTitle>
              <CardDescription>
                Créditos de uso incluidos para las funciones de IA de Nexora.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiUsage ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Incluidos en el plan', aiUsage.monthlyIncluded],
                      ['Utilizados', aiUsage.monthlyUsed],
                      ['Disponibles del plan', aiUsage.monthlyAvailable],
                      ['Puntos adicionales', aiUsage.additionalAvailable],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-muted/50 rounded-xl p-3">
                        <p className="text-muted-foreground text-[11px]">
                          {label}
                        </p>
                        <p className="mt-1 text-lg font-bold">
                          {formatNumber(Number(value))}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="border-primary/20 bg-primary/10 mt-3 flex items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <p className="text-primary text-xs font-semibold">
                        Total disponible
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        Plan + puntos adicionales
                      </p>
                    </div>
                    <p className="text-2xl font-black tabular-nums">
                      {formatNumber(aiUsage.totalAvailable)}
                    </p>
                  </div>
                  <div className="bg-muted mt-5 h-3 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{
                        width: `${Math.min(100, aiUsage.usagePercentage)}%`,
                      }}
                    />
                  </div>
                  <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                    <span>{aiUsage.usagePercentage}% utilizado</span>
                    <span>
                      Renueva el{' '}
                      {new Intl.DateTimeFormat('es-CL', {
                        day: '2-digit',
                        month: 'short',
                      }).format(new Date(aiUsage.cycleEndsAt))}
                    </span>
                  </div>
                  <Link
                    href="/agents"
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'mt-5 w-full'
                    )}
                  >
                    Ver consumo detallado
                  </Link>
                </>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No pudimos cargar el consumo en este momento.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>¿Qué consume puntos?</CardTitle>
              <CardDescription>
                Las acciones manuales del CRM no consumen Puntos Nexora.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['Respuesta IA básica', '1 punto'],
                  ['Sugerencia de respuesta', '1 punto'],
                  ['Resumen con IA', '1 punto'],
                  ['Análisis o clasificación', '1 punto'],
                  ['Transcripción de audio', '2 puntos / min'],
                  ['Respuesta mediante audio', '5 puntos / min'],
                ].map(([label, cost]) => (
                  <div
                    key={label}
                    className="border-border flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <span className="text-sm">{label}</span>
                    <span className="text-primary text-right text-xs font-bold">
                      {cost}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-600 dark:text-emerald-300">
                Respuestas manuales, contactos, oportunidades, usuarios,
                conexiones, navegación y funciones normales del CRM: 0 puntos.
              </div>
              <p className="text-muted-foreground text-xs">
                Las funciones de audio se consumen únicamente cuando el
                propietario de Nexora y el administrador de la empresa las
                habilitan.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <HelpText title="¿Qué son los Puntos Nexora?">
            Los Puntos Nexora son créditos de uso que permiten utilizar las
            funciones de Inteligencia Artificial de Nexora. Tu plan incluye una
            cantidad que se renueva mensualmente. Los puntos adicionales se
            mantienen separados de los puntos incluidos en tu plan.
          </HelpText>
          <HelpText title="¿Qué es el Agente IA Nexora?">
            Es el asistente inteligente principal de tu empresa. Puede operar en
            tus conexiones habilitadas utilizando los puntos disponibles.
          </HelpText>
        </div>

        <PointPackages
          currentPlanCode={summary.planCode}
          usage={aiUsage}
          onViewPlan={selectPlan}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <History className="size-5" />
              </div>
              <div>
                <CardTitle>Historial de pagos</CardTitle>
                <CardDescription>
                  Registro de movimientos futuros.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-border bg-muted/30 rounded-xl border border-dashed px-5 py-8 text-center">
              <ReceiptText className="text-muted-foreground mx-auto size-7" />
              <p className="mt-3 text-sm font-semibold">
                Aún no hay pagos registrados
              </p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs leading-relaxed">
                Tu historial aparecerá aquí cuando habilitemos los pagos dentro
                de Nexora.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <CreditCard className="size-5" />
              </div>
              <div>
                <CardTitle>Pago protegido</CardTitle>
                <CardDescription>
                  La autorización se realiza fuera de Nexora.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border-border bg-muted/30 rounded-xl border border-dashed px-5 py-8 text-center">
              <div className="text-muted-foreground mx-auto flex w-fit gap-2">
                <MessageCircle className="size-5" aria-hidden="true" />
                <Globe2 className="size-5" aria-hidden="true" />
                <WalletCards className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-semibold">Mercado Pago</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs leading-relaxed">
                Nexora no solicita ni almacena números de tarjeta. El medio de
                pago y la renovación se administran en Mercado Pago.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
