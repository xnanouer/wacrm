'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { QuotationSettings } from '@/lib/quotes/types';

export function QuotationSettingsForm({
  initialSettings,
}: {
  initialSettings: QuotationSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof QuotationSettings>(
    key: K,
    value: QuotationSettings[K]
  ) => setSettings((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/quotes/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as {
        error?: string;
        settings?: QuotationSettings;
      };
      if (!response.ok || !payload.settings)
        throw new Error(payload.error || 'No se pudo guardar.');
      setSettings(payload.settings);
      toast.success('Configuración de cotizaciones guardada.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary text-xs font-bold tracking-[.18em] uppercase">
            Cotizaciones
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Configuración del documento
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Personaliza la identidad, numeración y mensaje por empresa.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar cambios
        </Button>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <SettingsCard title="Empresa">
          <Setting label="Nombre visible">
            <Input
              value={settings.companyDisplayName}
              onChange={(event) =>
                update('companyDisplayName', event.target.value)
              }
            />
          </Setting>
          <div className="grid gap-4 sm:grid-cols-2">
            <Setting label="RUT empresa">
              <Input
                value={settings.companyRut ?? ''}
                onChange={(event) =>
                  update('companyRut', event.target.value || null)
                }
              />
            </Setting>
            <Setting label="Teléfono">
              <Input
                value={settings.companyPhone ?? ''}
                onChange={(event) =>
                  update('companyPhone', event.target.value || null)
                }
              />
            </Setting>
            <Setting label="Correo">
              <Input
                value={settings.companyEmail ?? ''}
                onChange={(event) =>
                  update('companyEmail', event.target.value || null)
                }
              />
            </Setting>
            <Setting label="Dirección">
              <Input
                value={settings.companyAddress ?? ''}
                onChange={(event) =>
                  update('companyAddress', event.target.value || null)
                }
              />
            </Setting>
          </div>
          <Setting label="Logo (URL opcional)">
            <Input
              value={settings.logoUrl ?? ''}
              onChange={(event) =>
                update('logoUrl', event.target.value || null)
              }
              placeholder="Usa el logo Nexora si lo dejas vacío"
            />
          </Setting>
          <div className="grid gap-4 sm:grid-cols-2">
            <Setting label="Color principal">
              <Input
                type="color"
                value={settings.primaryColor}
                onChange={(event) => update('primaryColor', event.target.value)}
              />
            </Setting>
            <Setting label="Color acento">
              <Input
                type="color"
                value={settings.accentColor}
                onChange={(event) => update('accentColor', event.target.value)}
              />
            </Setting>
          </div>
        </SettingsCard>
        <SettingsCard title="Numeración y vigencia">
          <div className="grid gap-4 sm:grid-cols-2">
            <Setting label="Prefijo">
              <Input
                value={settings.quotePrefix}
                onChange={(event) =>
                  update('quotePrefix', event.target.value.toUpperCase())
                }
              />
            </Setting>
            <Setting label="Dígitos">
              <Input
                type="number"
                min={3}
                max={10}
                value={settings.sequenceDigits}
                onChange={(event) =>
                  update('sequenceDigits', Number(event.target.value))
                }
              />
            </Setting>
            <Setting label="Próximo correlativo">
              <Input
                value={String(settings.nextSequence).padStart(
                  settings.sequenceDigits,
                  '0'
                )}
                disabled
              />
            </Setting>
            <Setting label="Vigencia predeterminada">
              <Input
                type="number"
                min={1}
                max={365}
                value={settings.defaultValidityDays}
                onChange={(event) =>
                  update('defaultValidityDays', Number(event.target.value))
                }
              />
            </Setting>
          </div>
          <Setting label="Formato predeterminado">
            <select
              value={settings.defaultAttachmentFormat}
              onChange={(event) =>
                update(
                  'defaultAttachmentFormat',
                  event.target.value as 'pdf' | 'png' | 'both'
                )
              }
              className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="png">PNG</option>
              <option value="both">PDF y PNG</option>
            </select>
          </Setting>
        </SettingsCard>
        <SettingsCard title="Contenido visible">
          <Toggle
            label="Mostrar RUT del cliente"
            checked={settings.showClientRut}
            onChange={(value) => update('showClientRut', value)}
          />
          <Toggle
            label="Mostrar correo del cliente"
            checked={settings.showClientEmail}
            onChange={(value) => update('showClientEmail', value)}
          />
          <Toggle
            label="Mostrar patente"
            checked={settings.showVehiclePlate}
            onChange={(value) => update('showVehiclePlate', value)}
          />
          <Toggle
            label="Mostrar teléfono del ejecutivo"
            checked={settings.showExecutivePhone}
            onChange={(value) => update('showExecutivePhone', value)}
          />
          <Toggle
            label="Mostrar correo del ejecutivo"
            checked={settings.showExecutiveEmail}
            onChange={(value) => update('showExecutiveEmail', value)}
          />
        </SettingsCard>
        <SettingsCard title="Mensajes y condiciones">
          <Setting label="Mensaje de WhatsApp">
            <Textarea
              value={settings.messageTemplate}
              onChange={(event) =>
                update('messageTemplate', event.target.value)
              }
              rows={4}
            />
            <p className="text-muted-foreground mt-2 text-xs">
              Variables: {'{{cliente}}'}, {'{{numero}}'}, {'{{vehiculo}}'},{' '}
              {'{{precio}}'}, {'{{vigencia}}'}, {'{{ejecutivo}}'}.
            </p>
          </Setting>
          <Setting label="Condiciones predeterminadas">
            <Textarea
              value={settings.defaultTerms}
              onChange={(event) => update('defaultTerms', event.target.value)}
              rows={5}
            />
          </Setting>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card space-y-4 rounded-2xl border p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Setting({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="border-border flex items-center justify-between rounded-xl border p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
