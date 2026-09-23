'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CarFront,
  ClipboardCheck,
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
  VehicleConsignmentInput,
} from '@/lib/contracts/types';

interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  rut: string | null;
}

interface MemberOption {
  user_id: string;
  full_name: string;
  email: string;
}

interface OptionsPayload {
  company: CompanyContractSnapshot;
  contacts: ContactOption[];
  members: MemberOption[];
  currentUserId: string;
  currentRole: AccountRole;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blank(): VehicleConsignmentInput {
  return {
    contactId: null,
    conversationId: null,
    catalogItemId: null,
    executiveUserId: null,
    executiveName: '',
    executivePhone: '',
    executiveEmail: '',
    issueDate: today(),
    consignorName: '',
    consignorRut: '',
    consignorAddress: '',
    consignorCity: '',
    consignorPhone: '',
    consignorEmail: '',
    vehicleType: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleVersion: '',
    vehicleYear: null,
    vehicleColor: '',
    vehicleFuel: '',
    vehicleEngine: '',
    vehicleEngineNumber: '',
    vehicleChassisNumber: '',
    vehiclePlate: '',
    vehicleGrossWeightKg: null,
    vehicleMileageKm: null,
    keysReceived: 1,
    keysAtBranch: 1,
    documentsUpToDate: true,
    consignorCapacity: 'legal_owner',
    hasPowerOfAttorney: false,
    hasIdCopy: true,
    vehicleUse: 'Patio',
    hasLien: false,
    hasAnnotationsCertificate: true,
    hasAutofactReport: true,
    autofactPreparedBy: 'Ejecutivo de ventas',
    hasFines: false,
    hasPensionDebt: false,
    branchName: '',
    branchAddress: '',
    consignmentValue: 0,
    cashPaymentTerms:
      '2 a 4 días hábiles desde la obtención de la firma por ambas partes.',
    financedPaymentTerms:
      '6 a 8 días hábiles desde la obtención de la firma por ambas partes.',
    internalNotes: '',
  };
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

function YesNo({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
            value === option
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground'
          }`}
        >
          {option ? 'Sí' : 'No'}
        </button>
      ))}
    </div>
  );
}

export function ContractEditor() {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [input, setInput] = useState<VehicleConsignmentInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof VehicleConsignmentInput>(
    key: K,
    value: VehicleConsignmentInput[K]
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
          consignorCity: payload.company.city,
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
      consignorName: contact?.name ?? '',
      consignorRut: contact?.rut ?? '',
      consignorPhone: contact?.phone ?? '',
      consignorEmail: contact?.email ?? '',
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
      const response = await fetch('/api/contracts', {
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
        throw new Error(payload.error || 'No se pudo guardar el contrato.');
      }
      toast.info(`${payload.contract.contractNumber} creado. Generando PDF…`);
      const generationResponse = await fetch(
        `/api/contracts/${payload.contract.id}/generate`,
        { method: 'POST' }
      );
      const generationPayload = (await generationResponse.json()) as {
        error?: string;
        version?: number;
      };

      if (!generationResponse.ok || !generationPayload.version) {
        toast.warning(
          `${payload.contract.contractNumber} quedó guardado, pero el PDF no pudo generarse: ${generationPayload.error || 'intenta nuevamente desde la revisión.'}`
        );
        router.push(`/contracts/${payload.contract.id}`);
        return;
      }

      toast.success(
        `${payload.contract.contractNumber} · PDF versión ${generationPayload.version} listo.`
      );
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
        <Loader2 className="size-5 animate-spin" /> Preparando el contrato…
      </div>
    );

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
          <h1 className="nexora-title mt-2">Recepción y consignación</h1>
          <p className="nexora-description mt-3">
            Completa los antecedentes antes de generar el documento final.
          </p>
        </div>
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          Modelo operativo basado en el documento proporcionado. Recomendamos
          una revisión jurídica antes de utilizarlo con clientes.
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Section
            icon={Building2}
            title="Empresa"
            description="Estos datos provienen de Configuración > Empresa."
          >
            <div className="grid gap-4 sm:grid-cols-3">
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
            title="Parte consignadora"
            description="Puedes seleccionar un contacto y completar lo que falte."
          >
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
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
              <Field label="Fecha del contrato" error={errors.issueDate}>
                <Input
                  type="date"
                  value={input.issueDate}
                  onChange={(e) => update('issueDate', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo" error={errors.consignorName}>
                <Input
                  value={input.consignorName}
                  onChange={(e) => update('consignorName', e.target.value)}
                />
              </Field>
              <Field label="RUT" error={errors.consignorRut}>
                <Input
                  value={input.consignorRut}
                  onChange={(e) => update('consignorRut', e.target.value)}
                />
              </Field>
              <Field label="Domicilio" error={errors.consignorAddress}>
                <Input
                  value={input.consignorAddress}
                  onChange={(e) => update('consignorAddress', e.target.value)}
                />
              </Field>
              <Field label="Ciudad" error={errors.consignorCity}>
                <Input
                  value={input.consignorCity}
                  onChange={(e) => update('consignorCity', e.target.value)}
                />
              </Field>
              <Field label="Teléfono" error={errors.consignorPhone}>
                <Input
                  value={input.consignorPhone}
                  onChange={(e) => update('consignorPhone', e.target.value)}
                />
              </Field>
              <Field label="Correo">
                <Input
                  type="email"
                  value={input.consignorEmail}
                  onChange={(e) => update('consignorEmail', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={CarFront}
            title="Vehículo"
            description="Completa los antecedentes del vehículo nuevo que está ingresando a la sucursal."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Tipo" error={errors.vehicleType}>
                <Input
                  value={input.vehicleType}
                  onChange={(e) => update('vehicleType', e.target.value)}
                  placeholder="Camioneta, SUV, automóvil…"
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
              <Field label="Versión">
                <Input
                  value={input.vehicleVersion}
                  onChange={(e) => update('vehicleVersion', e.target.value)}
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
              <Field label="Patente" error={errors.vehiclePlate}>
                <Input
                  value={input.vehiclePlate}
                  onChange={(e) =>
                    update('vehiclePlate', e.target.value.toUpperCase())
                  }
                />
              </Field>
              <Field label="Combustible">
                <Input
                  value={input.vehicleFuel}
                  onChange={(e) => update('vehicleFuel', e.target.value)}
                />
              </Field>
              <Field label="Motor / cilindrada">
                <Input
                  value={input.vehicleEngine}
                  onChange={(e) => update('vehicleEngine', e.target.value)}
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
              <Field label="Kilometraje" error={errors.vehicleMileageKm}>
                <Input
                  type="number"
                  min={0}
                  value={input.vehicleMileageKm ?? ''}
                  onChange={(e) =>
                    update(
                      'vehicleMileageKm',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
              <Field label="Peso bruto vehicular (kg)">
                <Input
                  type="number"
                  min={0}
                  value={input.vehicleGrossWeightKg ?? ''}
                  onChange={(e) =>
                    update(
                      'vehicleGrossWeightKg',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
              <Field label="Llaves recibidas">
                <Input
                  type="number"
                  min={0}
                  value={input.keysReceived}
                  onChange={(e) =>
                    update('keysReceived', Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Llaves en sucursal">
                <Input
                  type="number"
                  min={0}
                  value={input.keysAtBranch}
                  onChange={(e) =>
                    update('keysAtBranch', Number(e.target.value))
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={ClipboardCheck}
            title="Documentación y estado legal"
            description="Registra lo que se recibió y las declaraciones del consignador."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['documentsUpToDate', 'Documentos al día'],
                  ['hasPowerOfAttorney', 'Carta poder'],
                  ['hasIdCopy', 'Copia de cédula'],
                  ['hasLien', 'Posee prenda'],
                  ['hasAnnotationsCertificate', 'Certificado de anotaciones'],
                  ['hasAutofactReport', 'Informe Autofact'],
                  ['hasFines', 'Posee multas'],
                  ['hasPensionDebt', 'Deuda de pensión'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <YesNo
                    value={input[key]}
                    onChange={(value) => update(key, value)}
                  />
                </Field>
              ))}
              <Field label="Calidad del consignador">
                <select
                  value={input.consignorCapacity}
                  onChange={(e) =>
                    update(
                      'consignorCapacity',
                      e.target
                        .value as VehicleConsignmentInput['consignorCapacity']
                    )
                  }
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="legal_owner">Dueño legal</option>
                  <option value="authorized_representative">
                    Representante autorizado
                  </option>
                </select>
              </Field>
              <Field label="Uso del vehículo">
                <Input
                  value={input.vehicleUse}
                  onChange={(e) => update('vehicleUse', e.target.value)}
                />
              </Field>
              <Field label="Informe Autofact preparado por">
                <Input
                  value={input.autofactPreparedBy}
                  onChange={(e) => update('autofactPreparedBy', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={WalletCards}
            title="Ingreso y condiciones"
            description="Define la sucursal, el valor y los plazos informados al cliente."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sucursal">
                <Input
                  value={input.branchName}
                  onChange={(e) => update('branchName', e.target.value)}
                />
              </Field>
              <Field label="Dirección de ingreso" error={errors.branchAddress}>
                <Input
                  value={input.branchAddress}
                  onChange={(e) => update('branchAddress', e.target.value)}
                />
              </Field>
              <Field label="Ejecutivo" error={errors.executiveName}>
                <select
                  value={input.executiveUserId ?? ''}
                  onChange={(e) => chooseExecutive(e.target.value)}
                  disabled={
                    options ? !hasMinRole(options.currentRole, 'admin') : true
                  }
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">Seleccionar ejecutivo</option>
                  {options?.members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
                {options && !hasMinRole(options.currentRole, 'admin') ? (
                  <p className="text-muted-foreground text-xs">
                    Este contrato quedará registrado a tu nombre.
                  </p>
                ) : null}
              </Field>
              <Field label="Teléfono del ejecutivo">
                <Input
                  value={input.executivePhone}
                  onChange={(e) => update('executivePhone', e.target.value)}
                />
              </Field>
              <Field
                label="Valor de consignación"
                error={errors.consignmentValue}
              >
                <Input
                  type="number"
                  min={0}
                  value={input.consignmentValue || ''}
                  onChange={(e) =>
                    update('consignmentValue', Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Plazo de pago al contado">
                <Textarea
                  value={input.cashPaymentTerms}
                  onChange={(e) => update('cashPaymentTerms', e.target.value)}
                />
              </Field>
              <Field label="Plazo de pago con financiamiento">
                <Textarea
                  value={input.financedPaymentTerms}
                  onChange={(e) =>
                    update('financedPaymentTerms', e.target.value)
                  }
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
            templateKey="vehicle_consignment_v1"
            input={input}
            company={options.company}
          />
        ) : null}
      </div>

      <div className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-20 border-t p-4 shadow-2xl backdrop-blur lg:left-[304px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="hidden sm:block">
            <p className="text-sm font-semibold">Generar documento</p>
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
