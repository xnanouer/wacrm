'use client';

import { useEffect, useState } from 'react';
import { FileSignature, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CompanyLegalProfile } from '@/lib/contracts/types';

const EMPTY: CompanyLegalProfile = {
  accountId: '',
  legalName: '',
  tradeName: '',
  taxId: '',
  businessActivity: '',
  legalAddress: '',
  commune: '',
  city: '',
  region: '',
  phone: '',
  email: '',
  legalRepresentativeName: '',
  legalRepresentativeTaxId: '',
  defaultBranchName: '',
  defaultBranchAddress: '',
};

function Field({
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

export function CompanyLegalProfileSettings() {
  const [profile, setProfile] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/legal-profile', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          profile?: CompanyLegalProfile;
          error?: string;
        };
        if (!response.ok || !payload.profile)
          throw new Error(payload.error || 'No se pudo cargar la ficha legal.');
        if (!cancelled) setProfile(payload.profile);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(
            error instanceof Error ? error.message : 'No se pudo cargar.'
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof CompanyLegalProfile>(
    key: K,
    value: CompanyLegalProfile[K]
  ) => setProfile((current) => ({ ...current, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/account/legal-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const payload = (await response.json()) as {
        profile?: CompanyLegalProfile;
        error?: string;
      };
      if (!response.ok || !payload.profile)
        throw new Error(payload.error || 'No se pudo guardar.');
      setProfile(payload.profile);
      toast.success('Datos legales actualizados.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-5">
      <Card>
        <CardContent className="space-y-7">
          <div className="flex items-start gap-4">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <FileSignature className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Datos legales y contractuales</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Nexora utiliza esta ficha para completar contratos y documentos
                de esta empresa.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Cargando ficha legal…
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Razón social">
                  <Input
                    value={profile.legalName}
                    onChange={(e) => update('legalName', e.target.value)}
                    required
                  />
                </Field>
                <Field label="Nombre comercial">
                  <Input
                    value={profile.tradeName}
                    onChange={(e) => update('tradeName', e.target.value)}
                    required
                  />
                </Field>
                <Field label="RUT de la empresa">
                  <Input
                    value={profile.taxId}
                    onChange={(e) => update('taxId', e.target.value)}
                    placeholder="76.123.456-7"
                  />
                </Field>
                <Field label="Giro comercial">
                  <Input
                    value={profile.businessActivity}
                    onChange={(e) => update('businessActivity', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Dirección legal">
                <Input
                  value={profile.legalAddress}
                  onChange={(e) => update('legalAddress', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Comuna">
                  <Input
                    value={profile.commune}
                    onChange={(e) => update('commune', e.target.value)}
                  />
                </Field>
                <Field label="Ciudad">
                  <Input
                    value={profile.city}
                    onChange={(e) => update('city', e.target.value)}
                  />
                </Field>
                <Field label="Región">
                  <Input
                    value={profile.region}
                    onChange={(e) => update('region', e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Teléfono de la empresa">
                  <Input
                    value={profile.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                </Field>
                <Field label="Correo de la empresa">
                  <Input
                    type="email"
                    value={profile.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                </Field>
                <Field label="Representante legal">
                  <Input
                    value={profile.legalRepresentativeName}
                    onChange={(e) =>
                      update('legalRepresentativeName', e.target.value)
                    }
                  />
                </Field>
                <Field label="RUT del representante">
                  <Input
                    value={profile.legalRepresentativeTaxId}
                    onChange={(e) =>
                      update('legalRepresentativeTaxId', e.target.value)
                    }
                  />
                </Field>
                <Field label="Nombre de sucursal predeterminada">
                  <Input
                    value={profile.defaultBranchName}
                    onChange={(e) =>
                      update('defaultBranchName', e.target.value)
                    }
                    placeholder="Sucursal principal"
                  />
                </Field>
                <Field label="Dirección de sucursal">
                  <Input
                    value={profile.defaultBranchAddress}
                    onChange={(e) =>
                      update('defaultBranchAddress', e.target.value)
                    }
                  />
                </Field>
              </div>
              <div className="border-border bg-muted/30 flex items-start gap-3 rounded-xl border p-3">
                <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Estos datos pertenecen únicamente a tu empresa. Si falta un
                  dato obligatorio, Nexora impedirá generar el contrato final.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Guardar datos legales
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
