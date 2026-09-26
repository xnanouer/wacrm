'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CarFront,
  FileDown,
  Loader2,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ContractLivePreview } from '@/components/contracts/contract-live-preview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';
import type {
  CompanyContractSnapshot,
  ContractRecord,
  PaymentCommitmentInput,
} from '@/lib/contracts/types';

interface OptionsPayload {
  company: CompanyContractSnapshot;
  contacts: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    rut: string | null;
  }[];
  members: { user_id: string; full_name: string; email: string }[];
  currentUserId: string;
  currentRole: AccountRole;
}

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): PaymentCommitmentInput => ({
  contactId: null,
  conversationId: null,
  catalogItemId: null,
  executiveUserId: null,
  executiveName: '',
  executivePhone: '',
  executiveEmail: '',
  issueDate: today(),
  providerName: '',
  providerRut: '',
  providerAddress: '',
  providerCommune: '',
  providerCity: '',
  providerRegion: '',
  providerPhone: '',
  providerEmail: '',
  vehicleType: 'Automóvil',
  vehicleMake: '',
  vehicleModel: '',
  vehicleYear: null,
  vehicleColor: '',
  vehicleFuel: '',
  vehicleEngineNumber: '',
  vehicleChassisNumber: '',
  vehiclePlate: '',
  hasPensionDebt: false,
  branchName: '',
  branchAddress: '',
  takePrice: 0,
  cashPaymentBusinessDays: 4,
  financedPaymentBusinessDays: 10,
  internalNotes: '',
});

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function PaymentCommitmentEditor() {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [input, setInput] = useState<PaymentCommitmentInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof PaymentCommitmentInput>(
    key: K,
    value: PaymentCommitmentInput[K]
  ) => setInput((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    fetch('/api/contracts/options', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as OptionsPayload & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || 'No se pudieron cargar los datos.');
        return payload;
      })
      .then((payload) => {
        setOptions(payload);
        const current = payload.members.find(
          (member) => member.user_id === payload.currentUserId
        );
        setInput((value) => ({
          ...value,
          executiveUserId: current?.user_id ?? null,
          executiveName: current?.full_name ?? '',
          executiveEmail: current?.email ?? '',
          branchName: payload.company.defaultBranchName,
          branchAddress:
            payload.company.defaultBranchAddress ||
            payload.company.legalAddress,
          providerCity: payload.company.city,
          providerRegion: payload.company.region,
        }));
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'No se pudo cargar.'
        )
      )
      .finally(() => setLoading(false));
  }, []);

  function chooseContact(id: string) {
    const contact = options?.contacts.find((item) => item.id === id);
    setInput((value) => ({
      ...value,
      contactId: contact?.id ?? null,
      providerName: contact?.name ?? '',
      providerRut: contact?.rut ?? '',
      providerPhone: contact?.phone ?? '',
      providerEmail: contact?.email ?? '',
    }));
  }
  function chooseExecutive(id: string) {
    const member = options?.members.find((item) => item.user_id === id);
    setInput((value) => ({
      ...value,
      executiveUserId: member?.user_id ?? null,
      executiveName: member?.full_name ?? '',
      executiveEmail: member?.email ?? '',
    }));
  }
  async function generatePdf() {
    setSaving(true);
    setErrors({});
    try {
      const response = await fetch('/api/contracts/payment-commitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as {
        contract?: ContractRecord;
        error?: string;
        errors?: Record<string, string>;
      };
      if (!response.ok || !payload.contract) {
        if (payload.errors) setErrors(payload.errors);
        throw new Error(payload.error || 'No se pudo guardar el compromiso.');
      }
      toast.info(`${payload.contract.contractNumber} creado. Generando PDF…`);
      const generated = await fetch(
        `/api/contracts/${payload.contract.id}/generate`,
        { method: 'POST' }
      );
      const result = (await generated.json()) as {
        error?: string;
        version?: number;
      };
      if (!generated.ok || !result.version)
        toast.warning(
          `El contrato quedó guardado, pero el PDF no pudo generarse: ${result.error || 'intenta nuevamente.'}`
        );
      else toast.success(`${payload.contract.contractNumber} · PDF listo.`);
      router.push(`/contracts/${payload.contract.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="text-muted-foreground flex min-h-[55vh] items-center justify-center gap-2">
        <Loader2 className="size-5 animate-spin" /> Preparando el compromiso…
      </div>
    );
  const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className="nexora-page-stack pb-28">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" /> Volver
          </button>
          <p className="nexora-kicker">Nuevo contrato</p>
          <h1 className="nexora-title mt-2">Compromiso de pago</h1>
          <p className="nexora-description mt-3">
            Registra el proveedor, el vehículo, el precio y los plazos de pago
            acordados.
          </p>
        </div>
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          Modelo adaptado del documento proporcionado. Recomendamos una revisión
          jurídica antes de utilizarlo con clientes.
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Section
            icon={Building2}
            title="Empresa"
            description="El logo y los datos se obtienen de Configuración > Empresa."
          >
            <div className={grid}>
              <Field label="Razón social">
                <Input value={options?.company.legalName ?? ''} disabled />
              </Field>
              <Field label="RUT empresa">
                <Input value={options?.company.taxId ?? ''} disabled />
              </Field>
              <Field label="Dirección legal">
                <Input value={options?.company.legalAddress ?? ''} disabled />
              </Field>
            </div>
          </Section>
          <Section
            icon={UserRound}
            title="Parte proveedora"
            description="Selecciona un contacto o completa sus antecedentes."
          >
            <div className={grid}>
              <Field label="Contacto de Nexora">
                <select
                  value={input.contactId ?? ''}
                  onChange={(e) => chooseContact(e.target.value)}
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="">Seleccionar contacto</option>
                  {options?.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name || contact.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha" error={errors.issueDate}>
                <Input
                  type="date"
                  value={input.issueDate}
                  onChange={(e) => update('issueDate', e.target.value)}
                />
              </Field>
              <Field label="Nombre completo" error={errors.providerName}>
                <Input
                  value={input.providerName}
                  onChange={(e) => update('providerName', e.target.value)}
                />
              </Field>
              <Field label="RUT" error={errors.providerRut}>
                <Input
                  value={input.providerRut}
                  onChange={(e) => update('providerRut', e.target.value)}
                />
              </Field>
              <Field label="Domicilio" error={errors.providerAddress}>
                <Input
                  value={input.providerAddress}
                  onChange={(e) => update('providerAddress', e.target.value)}
                />
              </Field>
              <Field label="Comuna">
                <Input
                  value={input.providerCommune}
                  onChange={(e) => update('providerCommune', e.target.value)}
                />
              </Field>
              <Field label="Ciudad">
                <Input
                  value={input.providerCity}
                  onChange={(e) => update('providerCity', e.target.value)}
                />
              </Field>
              <Field label="Región">
                <Input
                  value={input.providerRegion}
                  onChange={(e) => update('providerRegion', e.target.value)}
                />
              </Field>
              <Field label="Teléfono" error={errors.providerPhone}>
                <Input
                  value={input.providerPhone}
                  onChange={(e) => update('providerPhone', e.target.value)}
                />
              </Field>
              <Field label="Correo">
                <Input
                  type="email"
                  value={input.providerEmail}
                  onChange={(e) => update('providerEmail', e.target.value)}
                />
              </Field>
            </div>
          </Section>
          <Section
            icon={CarFront}
            title="Vehículo"
            description="Completa los antecedentes del vehículo nuevo que está ingresando a la sucursal."
          >
            <div className={grid}>
              <Field label="Tipo">
                <Input
                  value={input.vehicleType}
                  onChange={(e) => update('vehicleType', e.target.value)}
                />
              </Field>
              <Field label="Marca" error={errors.vehicleMake}>
                <Input
                  value={input.vehicleMake}
                  onChange={(e) => update('vehicleMake', e.target.value)}
                />
              </Field>
              <Field label="Modelo" error={errors.vehicleModel}>
                <Input
                  value={input.vehicleModel}
                  onChange={(e) => update('vehicleModel', e.target.value)}
                />
              </Field>
              <Field label="Año" error={errors.vehicleYear}>
                <Input
                  type="number"
                  value={input.vehicleYear ?? ''}
                  onChange={(e) =>
                    update(
                      'vehicleYear',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
              <Field label="Color">
                <Input
                  value={input.vehicleColor}
                  onChange={(e) => update('vehicleColor', e.target.value)}
                />
              </Field>
              <Field label="Combustible">
                <Input
                  value={input.vehicleFuel}
                  onChange={(e) => update('vehicleFuel', e.target.value)}
                />
              </Field>
              <Field label="N.º de motor">
                <Input
                  value={input.vehicleEngineNumber}
                  onChange={(e) =>
                    update('vehicleEngineNumber', e.target.value)
                  }
                />
              </Field>
              <Field label="N.º de chasis / VIN">
                <Input
                  value={input.vehicleChassisNumber}
                  onChange={(e) =>
                    update('vehicleChassisNumber', e.target.value)
                  }
                />
              </Field>
              <Field label="Patente" error={errors.vehiclePlate}>
                <Input
                  value={input.vehiclePlate}
                  onChange={(e) =>
                    update('vehiclePlate', e.target.value.toUpperCase())
                  }
                />
              </Field>
            </div>
          </Section>
          <Section
            icon={WalletCards}
            title="Compromiso de pago"
            description="Define la sucursal, el valor recibido y los plazos."
          >
            <div className={grid}>
              <Field label="Sucursal">
                <Input
                  value={input.branchName}
                  onChange={(e) => update('branchName', e.target.value)}
                />
              </Field>
              <Field label="Dirección de sucursal" error={errors.branchAddress}>
                <Input
                  value={input.branchAddress}
                  onChange={(e) => update('branchAddress', e.target.value)}
                />
              </Field>
              <Field label="Valor de toma" error={errors.takePrice}>
                <Input
                  type="number"
                  min={0}
                  value={input.takePrice || ''}
                  onChange={(e) => update('takePrice', Number(e.target.value))}
                />
              </Field>
              <Field label="Días hábiles · contado">
                <Input
                  type="number"
                  min={1}
                  value={input.cashPaymentBusinessDays}
                  onChange={(e) =>
                    update('cashPaymentBusinessDays', Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Días hábiles · financiamiento">
                <Input
                  type="number"
                  min={1}
                  value={input.financedPaymentBusinessDays}
                  onChange={(e) =>
                    update(
                      'financedPaymentBusinessDays',
                      Number(e.target.value)
                    )
                  }
                />
              </Field>
              <Field label="¿Deuda de pensión?">
                <select
                  value={input.hasPensionDebt ? 'yes' : 'no'}
                  onChange={(e) =>
                    update('hasPensionDebt', e.target.value === 'yes')
                  }
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </select>
              </Field>
              <Field label="Ejecutivo" error={errors.executiveName}>
                <select
                  value={input.executiveUserId ?? ''}
                  onChange={(e) => chooseExecutive(e.target.value)}
                  disabled={
                    options ? !hasMinRole(options.currentRole, 'admin') : true
                  }
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm disabled:opacity-70"
                >
                  <option value="">Seleccionar ejecutivo</option>
                  {options?.members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Teléfono del ejecutivo">
                <Input
                  value={input.executivePhone}
                  onChange={(e) => update('executivePhone', e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Notas internas (no aparecen en el PDF)">
                <Textarea
                  value={input.internalNotes}
                  onChange={(e) => update('internalNotes', e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </div>
        {options ? (
          <ContractLivePreview
            templateKey="payment_commitment_v1"
            input={input}
            company={options.company}
          />
        ) : null}
      </div>
      <div className="border-border bg-background/95 fixed right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 z-20 border-t p-4 shadow-2xl backdrop-blur md:bottom-0 lg:left-[304px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-sm font-semibold">Generar compromiso</p>
            <p className="text-muted-foreground text-xs">
              Guarda los datos y crea la primera versión del PDF.
            </p>
          </div>
          <Button
            onClick={() => void generatePdf()}
            disabled={saving}
            className="ml-auto min-w-48"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            {saving ? 'Generando PDF…' : 'Generar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}
