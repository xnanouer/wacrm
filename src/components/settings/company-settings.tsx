'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { CompanyLogoPicker } from '@/components/account/company-logo-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import {
  INDUSTRY_CONFIGS,
  type ActiveIndustry,
  type BusinessSubtype,
} from '@/lib/industries/config';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';
import { CompanyLegalProfileSettings } from './company-legal-profile';

const MAX_NAME_LENGTH = 80;
const SUBTYPES: { value: BusinessSubtype; label: string }[] = [
  { value: 'construction_company', label: 'Constructora' },
  { value: 'real_estate_agency', label: 'Inmobiliaria' },
  {
    value: 'construction_and_real_estate',
    label: 'Constructora e inmobiliaria',
  },
];

export function CompanySettings() {
  const { account, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<ActiveIndustry | null>(null);
  const [businessSubtype, setBusinessSubtype] =
    useState<BusinessSubtype | null>(null);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmIndustry, setConfirmIndustry] = useState(false);

  useEffect(() => {
    setName(account?.name ?? '');
    setIndustry(account?.industry ?? null);
    setBusinessSubtype(account?.business_subtype ?? null);
  }, [account?.business_subtype, account?.industry, account?.name]);

  const trimmedName = name.trim();
  const industryChanged = industry !== (account?.industry ?? null);
  const subtypeChanged =
    businessSubtype !== (account?.business_subtype ?? null);
  const dirty = Boolean(
    account &&
    trimmedName &&
    (trimmedName !== account.name ||
      pendingLogo ||
      removeLogo ||
      industryChanged ||
      subtypeChanged)
  );
  const validIndustrySelection =
    industry !== 'real_estate_construction' || Boolean(businessSubtype);

  async function save() {
    if (!account || !trimmedName || !validIndustrySelection) return;
    setSaving(true);
    try {
      if (pendingLogo) {
        const form = new FormData();
        form.set('logo', pendingLogo);
        const upload = await fetch('/api/account/logo', {
          method: 'POST',
          body: form,
        });
        const payload = (await upload.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!upload.ok)
          throw new Error(payload.error ?? 'No se pudo subir el logo');
      } else if (removeLogo && account.logo_url) {
        const removal = await fetch('/api/account/logo', { method: 'DELETE' });
        if (!removal.ok) throw new Error('No se pudo quitar el logo');
      }

      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          ...(industry
            ? {
                industry,
                businessSubtype:
                  industry === 'real_estate_construction'
                    ? businessSubtype
                    : null,
              }
            : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'No se pudo actualizar la empresa');

      await refreshProfile();
      setPendingLogo(null);
      setRemoveLogo(false);
      setConfirmIndustry(false);
      toast.success('Empresa actualizada');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la empresa'
      );
    } finally {
      setSaving(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName)
      return toast.error('El nombre de la empresa es obligatorio');
    if (trimmedName.length > MAX_NAME_LENGTH)
      return toast.error(
        `El nombre puede tener hasta ${MAX_NAME_LENGTH} caracteres`
      );
    if (!validIndustrySelection)
      return toast.error('Selecciona qué describe mejor a tu empresa');
    if (industryChanged) setConfirmIndustry(true);
    else void save();
  }

  return (
    <section className="animate-in fade-in-50 max-w-3xl duration-200">
      <SettingsPanelHead
        title="Empresa"
        description="Administra la identidad y el tipo de empresa compartidos por todo tu equipo."
      />

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardContent className="space-y-7">
            <div className="flex items-start gap-4">
              <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                <Building2 className="size-5" />
              </span>
              <div>
                <h2 className="text-foreground font-semibold">
                  Identidad de la empresa
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Estos datos se comparten con todos los usuarios de la empresa.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-name">Nombre de la empresa</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Salgado Automotriz"
                maxLength={MAX_NAME_LENGTH}
                disabled={saving}
                required
              />
              <div className="text-muted-foreground flex justify-between gap-4 text-xs">
                <span>Aparecerá en el menú, encabezado e invitaciones.</span>
                <span>
                  {name.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
            </div>

            <CompanyLogoPicker
              file={pendingLogo}
              currentUrl={removeLogo ? null : account?.logo_url}
              companyName={trimmedName}
              disabled={saving}
              onChange={(file) => {
                setPendingLogo(file);
                setRemoveLogo(false);
              }}
              onRemove={() => {
                setPendingLogo(null);
                setRemoveLogo(true);
              }}
            />

            <div className="border-border/70 border-t pt-6">
              <Label>Tipo de empresa</Label>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                Nexora utiliza esta información para adaptar progresivamente tu
                experiencia. Cambiarla no elimina datos.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {INDUSTRY_CONFIGS.map((item) => {
                  const active = industry === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.enabled || saving}
                      onClick={() => {
                        if (!item.enabled) return;
                        setIndustry(item.id as ActiveIndustry);
                        if (item.id === 'automotive') setBusinessSubtype(null);
                      }}
                      className={cn(
                        'relative rounded-xl border px-4 py-3 text-left transition-colors',
                        item.enabled
                          ? 'border-border hover:border-primary/40'
                          : 'border-border/50 bg-muted/20 cursor-not-allowed opacity-45',
                        active &&
                          'border-primary bg-primary/8 ring-primary/15 ring-1'
                      )}
                    >
                      <span className="text-foreground flex items-center justify-between gap-2 text-sm font-semibold">
                        {item.label}
                        {active && <Check className="text-primary size-4" />}
                      </span>
                      {!item.enabled && (
                        <span className="text-muted-foreground mt-1 block text-[10px] font-bold tracking-wide uppercase">
                          Próximamente
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {industry === 'real_estate_construction' && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="business-subtype">
                    ¿Qué describe mejor a tu empresa?
                  </Label>
                  <select
                    id="business-subtype"
                    value={businessSubtype ?? ''}
                    onChange={(event) =>
                      setBusinessSubtype(
                        (event.target.value || null) as BusinessSubtype | null
                      )
                    }
                    disabled={saving}
                    className="border-input bg-background focus:border-primary h-11 w-full rounded-xl border px-3 text-sm outline-none"
                  >
                    <option value="">Selecciona una opción</option>
                    {SUBTYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border-border bg-muted/30 flex items-start gap-3 rounded-xl border p-3">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                Solo propietarios y administradores pueden cambiar estos datos.
                Tus contactos, conversaciones, usuarios e integraciones nunca se
                eliminan al cambiar de sector.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!dirty || saving || !validIndustrySelection}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar cambios
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <CompanyLegalProfileSettings />

      <Dialog open={confirmIndustry} onOpenChange={setConfirmIndustry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar tipo de empresa</DialogTitle>
            <DialogDescription>
              El tipo de empresa determina cómo Nexora adapta determinadas
              funciones y configuraciones. ¿Seguro que deseas cambiarlo? No se
              eliminará ningún dato existente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmIndustry(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}Cambiar
              tipo de empresa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
