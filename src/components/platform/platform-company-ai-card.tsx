'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2, Power, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AiUsageSummary } from '@/lib/ai/points/types';

export function PlatformCompanyAiCard({
  accountId,
  initialUsage,
}: {
  accountId: string;
  initialUsage: AiUsageSummary;
}) {
  const [enabled, setEnabled] = useState(initialUsage.platformEnabled);
  const [override, setOverride] = useState(
    initialUsage.monthlyPointsOverride?.toString() ?? ''
  );
  const [reason, setReason] = useState(initialUsage.disabledReason ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/platform/accounts/${accountId}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          monthly_points_override: override.trim() ? Number(override) : null,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo actualizar la IA.');
      }
      toast.success('Acceso de IA actualizado.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar la IA.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="text-primary size-5" />
          Inteligencia Artificial
        </CardTitle>
        <CardDescription>
          Habilitación independiente y asignación mensual de Puntos Nexora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="border-border flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <p className="text-foreground flex items-center gap-2 text-sm font-medium">
              {enabled ? (
                <ShieldCheck className="size-4 text-emerald-500" />
              ) : (
                <Power className="text-muted-foreground size-4" />
              )}
              IA habilitada para la empresa
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              El administrador todavía decide si activa su propio agente.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company-ai-points">
              Puntos mensuales personalizados
            </Label>
            <Input
              id="company-ai-points"
              type="number"
              min={0}
              max={10_000_000}
              value={override}
              onChange={(event) => setOverride(event.target.value)}
              placeholder={`Plan: ${initialUsage.monthlyIncluded.toLocaleString('es-CL')}`}
            />
            <p className="text-muted-foreground text-xs">
              Vacío utiliza automáticamente los puntos del plan.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-ai-reason">Motivo al desactivar</Label>
            <Input
              id="company-ai-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              disabled={enabled}
              placeholder="Ejemplo: función no incluida"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/35 rounded-xl p-3">
            <p className="text-foreground font-bold">
              {initialUsage.monthlyUsed.toLocaleString('es-CL')}
            </p>
            <p className="text-muted-foreground text-xs">Consumidos</p>
          </div>
          <div className="bg-muted/35 rounded-xl p-3">
            <p className="text-foreground font-bold">
              {initialUsage.totalAvailable.toLocaleString('es-CL')}
            </p>
            <p className="text-muted-foreground text-xs">Disponibles</p>
          </div>
          <div className="bg-muted/35 rounded-xl p-3">
            <p className="text-foreground font-bold">
              {initialUsage.usagePercentage}%
            </p>
            <p className="text-muted-foreground text-xs">Uso mensual</p>
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Guardar acceso de IA
        </Button>
      </CardContent>
    </Card>
  );
}
