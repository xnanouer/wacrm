'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CarFront,
  FileDown,
  Handshake,
  Landmark,
  Loader2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContractLivePreview } from '@/components/contracts/contract-live-preview';
import {
  ContactPrefillPicker,
  ContractPrefillNotice,
} from '@/components/contracts/contact-prefill-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';
import type {
  ContractContactOption,
  ContractContactPrefill,
} from '@/lib/contracts/prefill';
import {
  VEHICLE_TRANSACTION_TEMPLATES,
  type CompanyContractSnapshot,
  type ContractRecord,
  type VehicleTransactionInput,
  type VehicleTransactionTemplateKey,
} from '@/lib/contracts/types';

interface MemberOption {
  user_id: string;
  full_name: string;
  email: string;
}
interface OptionsPayload {
  company: CompanyContractSnapshot;
  contacts: ContractContactOption[];
  members: MemberOption[];
  selectedContactId: string | null;
  selectedPrefill: ContractContactPrefill | null;
  currentUserId: string;
  currentRole: AccountRole;
}

const today = () => new Date().toISOString().slice(0, 10);
const inThirtyDays = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

function blank(): VehicleTransactionInput {
  return {
    contactId: null,
    conversationId: null,
    executiveUserId: null,
    executiveName: '',
    executivePhone: '',
    executiveEmail: '',
    issueDate: today(),
    issuePlace: '',
    sellerName: '',
    sellerRut: '',
    sellerAddress: '',
    sellerCity: '',
    sellerPhone: '',
    sellerRepresentativeName: '',
    sellerRepresentativeRut: '',
    sellerRepresentativeAddress: '',
    sellerRepresentativeCity: '',
    sellerPowerDate: '',
    sellerPowerNotary: '',
    buyerName: '',
    buyerRut: '',
    buyerAddress: '',
    buyerCity: '',
    buyerPhone: '',
    buyerCivilStatus: '',
    secondBuyerName: '',
    secondBuyerRut: '',
    secondBuyerAddress: '',
    secondBuyerCity: '',
    buyerRepresentativeName: '',
    buyerRepresentativeRut: '',
    buyerRepresentativeAddress: '',
    buyerRepresentativeCity: '',
    buyerPowerDate: '',
    buyerPowerNotary: '',
    powerValidityDays: 30,
    vehicleType: 'Automóvil',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: null,
    vehicleColor: '',
    vehicleFuel: '',
    vehicleEngineNumber: '',
    vehicleChassisNumber: '',
    vehicleSerialNumber: '',
    vehiclePlate: '',
    vehicleGrossWeightKg: null,
    totalPrice: 0,
    cashAmount: 0,
    financedAmount: 0,
    reservationAmount: 0,
    reservationPaymentMethod: 'Transferencia',
    reservationExpiresAt: inThirtyDays(),
    reservationConditions:
      'La reserva se mantendrá vigente hasta la fecha indicada y estará sujeta a las condiciones acordadas por las partes.',
    vehicleHasFines: false,
    sellerHasPensionDebt: false,
    buyerHasPensionDebt: false,
    amendmentAttorneyName: '',
    amendmentAttorneyRut: '',
    internalNotes: '',
  };
}

function applyBuyerPrefill(
  value: VehicleTransactionInput,
  prefill: ContractContactPrefill
): VehicleTransactionInput {
  const price = prefill.vehiclePrice ?? value.totalPrice;
  const downPayment = prefill.downPayment ?? value.cashAmount;
  return {
    ...value,
    contactId: prefill.contactId,
    conversationId: prefill.conversationId,
    buyerName: prefill.fullName,
    buyerRut: prefill.rut,
    buyerAddress: prefill.address,
    buyerCity: prefill.commune || prefill.city,
    buyerPhone: prefill.phone,
    vehiclePlate: prefill.vehiclePlate.toUpperCase(),
    totalPrice: price,
    cashAmount:
      prefill.financingRequested === false && price > 0 ? price : downPayment,
    financedAmount:
      prefill.financingRequested === true && price > 0
        ? Math.max(price - downPayment, 0)
        : value.financedAmount,
    reservationPaymentMethod:
      prefill.paymentMethod || value.reservationPaymentMethod,
  };
}

function applySellerPrefill(
  value: VehicleTransactionInput,
  prefill: ContractContactPrefill
): VehicleTransactionInput {
  return {
    ...value,
    sellerName: prefill.fullName,
    sellerRut: prefill.rut,
    sellerAddress: prefill.address,
    sellerCity: prefill.commune || prefill.city,
    sellerPhone: prefill.phone,
    vehiclePlate: prefill.vehiclePlate.toUpperCase() || value.vehiclePlate,
  };
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

export function VehicleTransactionEditor({
  templateKey,
  initialConversationId,
  initialContactId,
}: {
  templateKey: VehicleTransactionTemplateKey;
  initialConversationId: string | null;
  initialContactId: string | null;
}) {
  const router = useRouter();
  const template = VEHICLE_TRANSACTION_TEMPLATES.find(
    (item) => item.key === templateKey
  )!;
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [input, setInput] = useState<VehicleTransactionInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePrefill, setActivePrefill] =
    useState<ContractContactPrefill | null>(null);
  const reservation = templateKey === 'vehicle_reservation_v1';
  const companySeller = templateKey === 'vehicle_sale_company_v1';
  const secondBuyer = templateKey === 'vehicle_sale_civil_union_v1';
  const sellerPower = templateKey === 'vehicle_sale_seller_power_v1';
  const buyerPower = templateKey === 'vehicle_sale_purchase_power_v1';
  const update = <K extends keyof VehicleTransactionInput>(
    key: K,
    value: VehicleTransactionInput[K]
  ) => setInput((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const params = new URLSearchParams();
    if (initialConversationId)
      params.set('conversationId', initialConversationId);
    if (initialContactId) params.set('contactId', initialContactId);
    const query = params.size ? `?${params.toString()}` : '';
    fetch(`/api/contracts/options${query}`, { cache: 'no-store' })
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
        setActivePrefill(payload.selectedPrefill);
        const current = payload.members.find(
          (member) => member.user_id === payload.currentUserId
        );
        setInput((value) => {
          const base = {
            ...value,
            issuePlace: payload.company.city,
            sellerCity: payload.company.city,
            buyerCity: payload.company.city,
            executiveUserId: current?.user_id ?? null,
            executiveName: current?.full_name ?? '',
            executiveEmail: current?.email ?? '',
            amendmentAttorneyName: payload.company.legalRepresentativeName,
            amendmentAttorneyRut: payload.company.legalRepresentativeTaxId,
          };
          return payload.selectedPrefill
            ? applyBuyerPrefill(base, payload.selectedPrefill)
            : base;
        });
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'No se pudo cargar.'
        )
      )
      .finally(() => setLoading(false));
  }, [initialContactId, initialConversationId]);

  function chooseContact(id: string, party: 'buyer' | 'seller') {
    const contact = options?.contacts.find((item) => item.id === id);
    if (party === 'buyer') {
      setActivePrefill(contact?.prefill ?? null);
      setInput((value) =>
        contact
          ? applyBuyerPrefill(value, contact.prefill)
          : { ...value, contactId: null, conversationId: null }
      );
    } else {
      setInput((value) =>
        contact ? applySellerPrefill(value, contact.prefill) : value
      );
    }
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
      const response = await fetch('/api/contracts/vehicle-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey, input }),
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
        <Loader2 className="size-5 animate-spin" /> Preparando el contrato…
      </div>
    );
  const grid = 'grid gap-4 sm:grid-cols-2';
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
          <h1 className="nexora-title mt-2">{template.name}</h1>
          <p className="nexora-description mt-3">{template.description}</p>
        </div>
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          Nexora validará fechas y montos antes de generar. Recomendamos
          revisión jurídica antes de firmar.
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Section
            icon={Building2}
            title="Documento y empresa"
            description="Los datos de empresa y su logo provienen de Configuración."
          >
            <div className={grid}>
              <Field label="Empresa">
                <Input value={options?.company.displayName ?? ''} disabled />
              </Field>
              <Field label="RUT empresa">
                <Input value={options?.company.taxId ?? ''} disabled />
              </Field>
              <Field label="Lugar de celebración" error={errors.issuePlace}>
                <Input
                  value={input.issuePlace}
                  onChange={(e) => update('issuePlace', e.target.value)}
                />
              </Field>
              <Field label="Fecha" error={errors.issueDate}>
                <Input
                  type="date"
                  value={input.issueDate}
                  onChange={(e) => update('issueDate', e.target.value)}
                />
              </Field>
            </div>
          </Section>
          {!companySeller && !reservation ? (
            <Section
              icon={UserRound}
              title="Parte vendedora"
              description={
                sellerPower
                  ? 'Registra al propietario y a quien comparece mediante carta poder.'
                  : 'Antecedentes de quien vende el vehículo.'
              }
            >
              <div className={grid}>
                <Field label="Autocompletar desde contacto">
                  <ContactPrefillPicker
                    contacts={options?.contacts ?? []}
                    value={null}
                    onChange={(id) => chooseContact(id, 'seller')}
                  />
                </Field>
                <Field label="Nombre" error={errors.sellerName}>
                  <Input
                    value={input.sellerName}
                    onChange={(e) => update('sellerName', e.target.value)}
                  />
                </Field>
                <Field label="RUT" error={errors.sellerRut}>
                  <Input
                    value={input.sellerRut}
                    onChange={(e) => update('sellerRut', e.target.value)}
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    value={input.sellerPhone}
                    onChange={(e) => update('sellerPhone', e.target.value)}
                  />
                </Field>
                <Field label="Domicilio" error={errors.sellerAddress}>
                  <Input
                    value={input.sellerAddress}
                    onChange={(e) => update('sellerAddress', e.target.value)}
                  />
                </Field>
                <Field label="Ciudad">
                  <Input
                    value={input.sellerCity}
                    onChange={(e) => update('sellerCity', e.target.value)}
                  />
                </Field>
              </div>
              {sellerPower ? (
                <div className="border-border mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
                  <Field
                    label="Representante"
                    error={errors.sellerRepresentativeName}
                  >
                    <Input
                      value={input.sellerRepresentativeName}
                      onChange={(e) =>
                        update('sellerRepresentativeName', e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="RUT representante"
                    error={errors.sellerRepresentativeRut}
                  >
                    <Input
                      value={input.sellerRepresentativeRut}
                      onChange={(e) =>
                        update('sellerRepresentativeRut', e.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label="Fecha carta poder"
                    error={errors.sellerPowerDate}
                  >
                    <Input
                      type="date"
                      value={input.sellerPowerDate}
                      onChange={(e) =>
                        update('sellerPowerDate', e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Notaría" error={errors.sellerPowerNotary}>
                    <Input
                      value={input.sellerPowerNotary}
                      onChange={(e) =>
                        update('sellerPowerNotary', e.target.value)
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </Section>
          ) : null}
          <Section
            icon={Handshake}
            title={reservation ? 'Parte reservadora' : 'Parte compradora'}
            description={
              secondBuyer
                ? 'Registra a ambas personas compradoras.'
                : buyerPower
                  ? 'Registra al comprador y a su mandatario.'
                  : 'Antecedentes de quien compra o reserva.'
            }
          >
            <div className={grid}>
              <Field label="Contacto de Nexora">
                <ContactPrefillPicker
                  contacts={options?.contacts ?? []}
                  value={input.contactId ?? ''}
                  onChange={(id) => chooseContact(id, 'buyer')}
                />
              </Field>
              <Field label="Nombre" error={errors.buyerName}>
                <Input
                  value={input.buyerName}
                  onChange={(e) => update('buyerName', e.target.value)}
                />
              </Field>
              <ContractPrefillNotice prefill={activePrefill} />
              <Field label="RUT" error={errors.buyerRut}>
                <Input
                  value={input.buyerRut}
                  onChange={(e) => update('buyerRut', e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={input.buyerPhone}
                  onChange={(e) => update('buyerPhone', e.target.value)}
                />
              </Field>
              {!reservation ? (
                <>
                  <Field label="Domicilio" error={errors.buyerAddress}>
                    <Input
                      value={input.buyerAddress}
                      onChange={(e) => update('buyerAddress', e.target.value)}
                    />
                  </Field>
                  <Field label="Ciudad">
                    <Input
                      value={input.buyerCity}
                      onChange={(e) => update('buyerCity', e.target.value)}
                    />
                  </Field>
                  <Field label="Estado civil">
                    <Input
                      value={input.buyerCivilStatus}
                      onChange={(e) =>
                        update('buyerCivilStatus', e.target.value)
                      }
                    />
                  </Field>
                </>
              ) : null}
            </div>
            {secondBuyer ? (
              <div className="border-border mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
                <Field label="Segundo comprador" error={errors.secondBuyerName}>
                  <Input
                    value={input.secondBuyerName}
                    onChange={(e) => update('secondBuyerName', e.target.value)}
                  />
                </Field>
                <Field
                  label="RUT segundo comprador"
                  error={errors.secondBuyerRut}
                >
                  <Input
                    value={input.secondBuyerRut}
                    onChange={(e) => update('secondBuyerRut', e.target.value)}
                  />
                </Field>
                <Field label="Domicilio">
                  <Input
                    value={input.secondBuyerAddress}
                    onChange={(e) =>
                      update('secondBuyerAddress', e.target.value)
                    }
                  />
                </Field>
                <Field label="Ciudad">
                  <Input
                    value={input.secondBuyerCity}
                    onChange={(e) => update('secondBuyerCity', e.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            {buyerPower ? (
              <div className="border-border mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
                <Field
                  label="Mandatario"
                  error={errors.buyerRepresentativeName}
                >
                  <Input
                    value={input.buyerRepresentativeName}
                    onChange={(e) =>
                      update('buyerRepresentativeName', e.target.value)
                    }
                  />
                </Field>
                <Field
                  label="RUT mandatario"
                  error={errors.buyerRepresentativeRut}
                >
                  <Input
                    value={input.buyerRepresentativeRut}
                    onChange={(e) =>
                      update('buyerRepresentativeRut', e.target.value)
                    }
                  />
                </Field>
                <Field label="Domicilio mandatario">
                  <Input
                    value={input.buyerRepresentativeAddress}
                    onChange={(e) =>
                      update('buyerRepresentativeAddress', e.target.value)
                    }
                  />
                </Field>
                <Field label="Ciudad mandatario">
                  <Input
                    value={input.buyerRepresentativeCity}
                    onChange={(e) =>
                      update('buyerRepresentativeCity', e.target.value)
                    }
                  />
                </Field>
                <Field label="Fecha del poder" error={errors.buyerPowerDate}>
                  <Input
                    type="date"
                    value={input.buyerPowerDate}
                    onChange={(e) => update('buyerPowerDate', e.target.value)}
                  />
                </Field>
                <Field label="Notaría" error={errors.buyerPowerNotary}>
                  <Input
                    value={input.buyerPowerNotary}
                    onChange={(e) => update('buyerPowerNotary', e.target.value)}
                  />
                </Field>
                <Field label="Vigencia del poder (días)">
                  <Input
                    type="number"
                    min={1}
                    value={input.powerValidityDays}
                    onChange={(e) =>
                      update('powerValidityDays', Number(e.target.value))
                    }
                  />
                </Field>
              </div>
            ) : null}
          </Section>
          <Section
            icon={CarFront}
            title="Vehículo"
            description="Completa la identificación de la unidad involucrada."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Field label="N.º motor">
                <Input
                  value={input.vehicleEngineNumber}
                  onChange={(e) =>
                    update('vehicleEngineNumber', e.target.value)
                  }
                />
              </Field>
              <Field label="N.º chasis / VIN">
                <Input
                  value={input.vehicleChassisNumber}
                  onChange={(e) =>
                    update('vehicleChassisNumber', e.target.value)
                  }
                />
              </Field>
              <Field label="N.º serie">
                <Input
                  value={input.vehicleSerialNumber}
                  onChange={(e) =>
                    update('vehicleSerialNumber', e.target.value)
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
              <Field label="Peso bruto (kg)">
                <Input
                  type="number"
                  value={input.vehicleGrossWeightKg ?? ''}
                  onChange={(e) =>
                    update(
                      'vehicleGrossWeightKg',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
            </div>
          </Section>
          <Section
            icon={Landmark}
            title={
              reservation ? 'Reserva y garantía' : 'Precio y forma de pago'
            }
            description={
              reservation
                ? 'La cifra numérica será la única fuente del monto en el PDF.'
                : 'Nexora exige que contado y financiamiento sumen el precio total.'
            }
          >
            {reservation ? (
              <div className={grid}>
                <Field
                  label="Monto de reserva"
                  error={errors.reservationAmount}
                >
                  <Input
                    type="number"
                    min={0}
                    value={input.reservationAmount || ''}
                    onChange={(e) =>
                      update('reservationAmount', Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Medio de pago">
                  <Input
                    value={input.reservationPaymentMethod}
                    onChange={(e) =>
                      update('reservationPaymentMethod', e.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Reserva vigente hasta"
                  error={errors.reservationExpiresAt}
                >
                  <Input
                    type="date"
                    value={input.reservationExpiresAt}
                    onChange={(e) =>
                      update('reservationExpiresAt', e.target.value)
                    }
                  />
                </Field>
                <Field label="Condiciones">
                  <Textarea
                    value={input.reservationConditions}
                    onChange={(e) =>
                      update('reservationConditions', e.target.value)
                    }
                  />
                </Field>
              </div>
            ) : (
              <div className={grid}>
                <Field label="Precio total" error={errors.totalPrice}>
                  <Input
                    type="number"
                    min={0}
                    value={input.totalPrice || ''}
                    onChange={(e) =>
                      update('totalPrice', Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Monto al contado">
                  <Input
                    type="number"
                    min={0}
                    value={input.cashAmount || ''}
                    onChange={(e) =>
                      update('cashAmount', Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Monto financiado">
                  <Input
                    type="number"
                    min={0}
                    value={input.financedAmount || ''}
                    onChange={(e) =>
                      update('financedAmount', Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="¿Vehículo con multas?">
                  <select
                    value={input.vehicleHasFines ? 'yes' : 'no'}
                    onChange={(e) =>
                      update('vehicleHasFines', e.target.value === 'yes')
                    }
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </Field>
                <Field label="¿Vendedor con deuda de pensión?">
                  <select
                    value={input.sellerHasPensionDebt ? 'yes' : 'no'}
                    onChange={(e) =>
                      update('sellerHasPensionDebt', e.target.value === 'yes')
                    }
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </Field>
                <Field label="¿Comprador con deuda de pensión?">
                  <select
                    value={input.buyerHasPensionDebt ? 'yes' : 'no'}
                    onChange={(e) =>
                      update('buyerHasPensionDebt', e.target.value === 'yes')
                    }
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    <option value="no">No</option>
                    <option value="yes">Sí</option>
                  </select>
                </Field>
              </div>
            )}
            <div className="border-border mt-6 grid gap-4 border-t pt-6 sm:grid-cols-2">
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
              <Field label="Notas internas">
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
            templateKey={templateKey}
            input={input}
            company={options.company}
          />
        ) : null}
      </div>
      <div className="border-border bg-background/95 fixed right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 z-20 border-t p-4 shadow-2xl backdrop-blur md:bottom-0 lg:left-[304px]">
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
