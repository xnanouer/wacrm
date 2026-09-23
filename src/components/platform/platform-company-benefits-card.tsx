'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BrainCircuit,
  CarFront,
  Gift,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AiUsageSummary } from '@/lib/ai/points/types';
import type { PlatformCatalogCapacity } from '@/lib/platform/types';

type BenefitsResponse = {
  error?: string;
  message?: string;
  aiUsage?: AiUsageSummary;
  catalogCapacity?: PlatformCatalogCapacity;
};

export function PlatformCompanyBenefitsCard({
  accountId,
  initialAiUsage,
  initialCatalogCapacity,
}: {
  accountId: string;
  initialAiUsage: AiUsageSummary;
  initialCatalogCapacity: PlatformCatalogCapacity;
}) {
  const router = useRouter();
  const [aiUsage, setAiUsage] = useState(initialAiUsage);
  const [catalog, setCatalog] = useState(initialCatalogCapacity);
  const [points, setPoints] = useState('1000');
  const [pointsReason, setPointsReason] = useState('');
  const [catalogExtra, setCatalogExtra] = useState(
    String(initialCatalogCapacity.extraUnits)
  );
  const [catalogReason, setCatalogReason] = useState('');
  const [saving, setSaving] = useState<'points' | 'catalog' | null>(null);

  async function requestAdjustment(body: Record<string, unknown>) {
    const response = await fetch(
      `/api/platform/accounts/${accountId}/benefits`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const data = (await response.json().catch(() => ({}))) as BenefitsResponse;
    if (!response.ok) {
      throw new Error(data.error ?? 'No se pudo guardar el ajuste.');
    }
    return data;
  }

  async function grantPoints() {
    setSaving('points');
    try {
      const data = await requestAdjustment({
        action: 'grant_ai_points',
        points: Number(points),
        reason: pointsReason,
      });
      if (data.aiUsage) setAiUsage(data.aiUsage);
      setPointsReason('');
      toast.success(data.message ?? 'Puntos Nexora agregados.');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveCatalogCapacity() {
    setSaving('catalog');
    try {
      const data = await requestAdjustment({
        action: 'set_catalog_extra_units',
        extra_units: Number(catalogExtra),
        reason: catalogReason,
      });
      if (data.catalogCapacity) {
        setCatalog(data.catalogCapacity);
        setCatalogExtra(String(data.catalogCapacity.extraUnits));
      }
      setCatalogReason('');
      toast.success(data.message ?? 'Capacidad de catálogo actualizada.');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(null);
    }
  }

  function changeCatalogExtra(delta: number) {
    const current = Number(catalogExtra) || 0;
    setCatalogExtra(String(Math.max(0, current + delta)));
  }

  return (
    <section className="surface-elevated border-primary/20 overflow-hidden rounded-3xl border">
      <div className="border-border flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="text-primary flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
            <Gift className="size-4" /> Beneficios manuales
          </div>
          <h2 className="text-foreground mt-2 text-xl font-bold">
            Ajustes especiales para esta empresa
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Se suman al plan actual y solo pueden modificarse desde tu panel de
            propietario.
          </p>
        </div>
        <span className="border-primary/20 bg-primary/10 text-primary inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck className="size-3.5" /> Solo owner
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <article className="border-border bg-muted/20 rounded-2xl border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-foreground flex items-center gap-2 font-semibold">
                <BrainCircuit className="text-primary size-5" /> Puntos Nexora
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Entrega un bono adicional de consumo, sin cambiar los puntos
                mensuales del plan.
              </p>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl px-3 py-2 text-right">
              <p className="text-lg font-bold">
                {aiUsage.totalAvailable.toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] font-medium">disponibles</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-background/70 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Plan mensual</p>
              <p className="text-foreground mt-1 font-bold">
                {aiUsage.monthlyAvailable.toLocaleString('es-CL')}
              </p>
            </div>
            <div className="bg-background/70 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Bonos adicionales</p>
              <p className="text-foreground mt-1 font-bold">
                {aiUsage.additionalAvailable.toLocaleString('es-CL')}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-ai-points">
                Puntos que deseas agregar
              </Label>
              <Input
                id="manual-ai-points"
                type="number"
                min={1}
                max={10_000_000}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-ai-reason">Motivo del beneficio</Label>
              <Input
                id="manual-ai-reason"
                value={pointsReason}
                onChange={(event) => setPointsReason(event.target.value)}
                maxLength={500}
                placeholder="Ejemplo: cortesía comercial"
              />
            </div>
            <Button
              className="w-full"
              onClick={grantPoints}
              disabled={saving !== null}
            >
              {saving === 'points' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Agregar puntos
            </Button>
          </div>
        </article>

        <article className="border-border bg-muted/20 rounded-2xl border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-foreground flex items-center gap-2 font-semibold">
                <CarFront className="text-primary size-5" /> Espacios de
                catálogo
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                Define el total adicional sobre la capacidad incluida en el
                plan.
              </p>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl px-3 py-2 text-right">
              <p className="text-lg font-bold">
                {catalog.totalLimit.toLocaleString('es-CL')}
              </p>
              <p className="text-[11px] font-medium">capacidad total</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="bg-background/70 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Plan</p>
              <p className="text-foreground mt-1 font-bold">
                {catalog.baseLimit}
              </p>
            </div>
            <div className="bg-background/70 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">Adicionales</p>
              <p className="text-foreground mt-1 font-bold">
                +{catalog.extraUnits}
              </p>
            </div>
            <div className="bg-background/70 rounded-xl p-3">
              <p className="text-muted-foreground text-xs">En uso</p>
              <p className="text-foreground mt-1 font-bold">
                {catalog.usedUnits}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-catalog-spaces">
                Cupos adicionales (bloques de 10)
              </Label>
              <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeCatalogExtra(-10)}
                  disabled={saving !== null || Number(catalogExtra) <= 0}
                  aria-label="Quitar diez cupos"
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  id="manual-catalog-spaces"
                  type="number"
                  min={0}
                  max={1_000_000}
                  step={10}
                  value={catalogExtra}
                  onChange={(event) => setCatalogExtra(event.target.value)}
                  className="text-center font-semibold"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeCatalogExtra(10)}
                  disabled={saving !== null}
                  aria-label="Agregar diez cupos"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-catalog-reason">Motivo del ajuste</Label>
              <Input
                id="manual-catalog-reason"
                value={catalogReason}
                onChange={(event) => setCatalogReason(event.target.value)}
                maxLength={500}
                placeholder="Ejemplo: ampliación negociada"
              />
            </div>
            <Button
              className="w-full"
              onClick={saveCatalogCapacity}
              disabled={saving !== null}
            >
              {saving === 'catalog' && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Guardar capacidad
            </Button>
          </div>
        </article>
      </div>
    </section>
  );
}
