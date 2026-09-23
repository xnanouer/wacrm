'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CarFront,
  FileDown,
  Loader2,
  Plus,
  Scale,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContractLivePreview } from '@/components/contracts/contract-live-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';
import {
  VEHICLE_LEGAL_TEMPLATES,
  type CompanyContractSnapshot,
  type ContractRecord,
  type VehicleLegalInput,
  type VehicleLegalTemplateKey,
  type VehicleLegalVehicle,
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

const today = () => new Date().toISOString().slice(0, 10);

function emptyVehicle(index = 0): VehicleLegalVehicle {
  return {
    id: `vehicle-${Date.now()}-${index}`,
    type: 'Automóvil',
    make: '',
    model: '',
    year: null,
    color: '',
    fuel: '',
    engineNumber: '',
    chassisNumber: '',
    serialNumber: '',
    plate: '',
    grossWeightKg: null,
    vin: '',
    entryDate: today(),
  };
}

function blank(): VehicleLegalInput {
  return {
    contactId: null,
    conversationId: null,
    executiveUserId: null,
    executiveName: '',
    executivePhone: '',
    executiveEmail: '',
    issueDate: today(),
    issuePlace: '',
    declarantName: '',
    declarantRut: '',
    declarantAddress: '',
    declarantCity: '',
    declarantPhone: '',
    representativeName: '',
    representativeRut: '',
    representativeAddress: '',
    representativeCity: '',
    powerValidityMonths: 12,
    vehicles: [emptyVehicle()],
    internalNotes: '',
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

export function VehicleLegalEditor({
  templateKey,
}: {
  templateKey: VehicleLegalTemplateKey;
}) {
  const router = useRouter();
  const template = VEHICLE_LEGAL_TEMPLATES.find(
    (item) => item.key === templateKey
  )!;
  const isPower = templateKey === 'vehicle_sale_power_v1';
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [input, setInput] = useState<VehicleLegalInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof VehicleLegalInput>(
    key: K,
    value: VehicleLegalInput[K]
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
          issuePlace: payload.company.city,
          declarantCity: payload.company.city,
          representativeCity: payload.company.city,
          executiveUserId: current?.user_id ?? null,
          executiveName: current?.full_name ?? '',
          executiveEmail: current?.email ?? '',
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
      declarantName: contact?.name ?? '',
      declarantRut: contact?.rut ?? '',
      declarantPhone: contact?.phone ?? '',
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

  function updateVehicle<K extends keyof VehicleLegalVehicle>(
    index: number,
    key: K,
    value: VehicleLegalVehicle[K]
  ) {
    setInput((current) => ({
      ...current,
      vehicles: current.vehicles.map((vehicle, vehicleIndex) =>
        vehicleIndex === index ? { ...vehicle, [key]: value } : vehicle
      ),
    }));
  }

  function addVehicle() {
    setInput((current) => ({
      ...current,
      vehicles: [...current.vehicles, emptyVehicle(current.vehicles.length)],
    }));
  }

  function removeVehicle(index: number) {
    setInput((current) => ({
      ...current,
      vehicles: current.vehicles.filter(
        (_, vehicleIndex) => vehicleIndex !== index
      ),
    }));
  }

  async function generatePdf() {
    setSaving(true);
    setErrors({});
    try {
      const response = await fetch('/api/contracts/vehicle-legal', {
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
          Revisa cuidadosamente nombres, RUT, patente, VIN y fechas. Nexora
          recomienda revisión jurídica o notarial antes de firmar.
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="space-y-6">
          <Section
            icon={Building2}
            title="Documento y empresa"
            description="La marca y los datos de la empresa provienen de Configuración."
          >
            <div className={grid}>
              <Field label="Empresa">
                <Input value={options?.company.displayName ?? ''} disabled />
              </Field>
              <Field label="RUT empresa">
                <Input value={options?.company.taxId ?? ''} disabled />
              </Field>
              <Field label="Ciudad de otorgamiento" error={errors.issuePlace}>
                <Input
                  value={input.issuePlace}
                  onChange={(event) => update('issuePlace', event.target.value)}
                />
              </Field>
              <Field label="Fecha" error={errors.issueDate}>
                <Input
                  type="date"
                  value={input.issueDate}
                  onChange={(event) => update('issueDate', event.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section
            icon={UserRound}
            title={isPower ? 'Persona mandante' : 'Persona declarante'}
            description={
              isPower
                ? 'Propietario que entrega el poder para vender el vehículo.'
                : 'Parte vendedora que asume la responsabilidad declarada.'
            }
          >
            <div className={grid}>
              <Field label="Autocompletar desde contacto">
                <select
                  onChange={(event) => chooseContact(event.target.value)}
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
              <Field label="Nombre completo" error={errors.declarantName}>
                <Input
                  value={input.declarantName}
                  onChange={(event) =>
                    update('declarantName', event.target.value)
                  }
                />
              </Field>
              <Field label="RUT" error={errors.declarantRut}>
                <Input
                  value={input.declarantRut}
                  onChange={(event) =>
                    update('declarantRut', event.target.value)
                  }
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={input.declarantPhone}
                  onChange={(event) =>
                    update('declarantPhone', event.target.value)
                  }
                />
              </Field>
              <Field label="Domicilio" error={errors.declarantAddress}>
                <Input
                  value={input.declarantAddress}
                  onChange={(event) =>
                    update('declarantAddress', event.target.value)
                  }
                />
              </Field>
              <Field label="Ciudad / comuna">
                <Input
                  value={input.declarantCity}
                  onChange={(event) =>
                    update('declarantCity', event.target.value)
                  }
                />
              </Field>
            </div>
          </Section>

          {isPower ? (
            <Section
              icon={Scale}
              title="Persona mandataria"
              description="Persona autorizada para celebrar y gestionar la venta."
            >
              <div className={grid}>
                <Field
                  label="Nombre completo"
                  error={errors.representativeName}
                >
                  <Input
                    value={input.representativeName}
                    onChange={(event) =>
                      update('representativeName', event.target.value)
                    }
                  />
                </Field>
                <Field label="RUT" error={errors.representativeRut}>
                  <Input
                    value={input.representativeRut}
                    onChange={(event) =>
                      update('representativeRut', event.target.value)
                    }
                  />
                </Field>
                <Field label="Domicilio">
                  <Input
                    value={input.representativeAddress}
                    onChange={(event) =>
                      update('representativeAddress', event.target.value)
                    }
                  />
                </Field>
                <Field label="Ciudad / comuna">
                  <Input
                    value={input.representativeCity}
                    onChange={(event) =>
                      update('representativeCity', event.target.value)
                    }
                  />
                </Field>
                <Field label="Vigencia del poder (meses)">
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={input.powerValidityMonths}
                    onChange={(event) =>
                      update('powerValidityMonths', Number(event.target.value))
                    }
                  />
                </Field>
              </div>
            </Section>
          ) : null}

          <Section
            icon={CarFront}
            title={isPower ? 'Vehículo autorizado' : 'Vehículos declarados'}
            description={
              isPower
                ? 'Completa manualmente la unidad individualizada en el poder.'
                : 'Agrega cada unidad y su fecha de ingreso. No se exige que ya exista en el catálogo.'
            }
          >
            <div className="space-y-5">
              {input.vehicles.map((vehicle, index) => {
                const key = (field: keyof VehicleLegalVehicle) =>
                  errors[`vehicles.${index}.${field}`];
                return (
                  <article
                    key={vehicle.id}
                    className="border-border bg-muted/20 rounded-2xl border p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <strong className="text-sm">Vehículo {index + 1}</strong>
                      {!isPower && input.vehicles.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Eliminar vehículo ${index + 1}`}
                          onClick={() => removeVehicle(index)}
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      ) : null}
                    </div>
                    <div className={grid}>
                      <Field label="Tipo">
                        <Input
                          value={vehicle.type}
                          onChange={(event) =>
                            updateVehicle(index, 'type', event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Marca" error={key('make')}>
                        <Input
                          value={vehicle.make}
                          onChange={(event) =>
                            updateVehicle(index, 'make', event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Modelo" error={key('model')}>
                        <Input
                          value={vehicle.model}
                          onChange={(event) =>
                            updateVehicle(index, 'model', event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Año" error={key('year')}>
                        <Input
                          type="number"
                          value={vehicle.year ?? ''}
                          onChange={(event) =>
                            updateVehicle(
                              index,
                              'year',
                              event.target.value
                                ? Number(event.target.value)
                                : null
                            )
                          }
                        />
                      </Field>
                      <Field label="Patente" error={key('plate')}>
                        <Input
                          value={vehicle.plate}
                          onChange={(event) =>
                            updateVehicle(
                              index,
                              'plate',
                              event.target.value.toUpperCase()
                            )
                          }
                        />
                      </Field>
                      <Field label="Color">
                        <Input
                          value={vehicle.color}
                          onChange={(event) =>
                            updateVehicle(index, 'color', event.target.value)
                          }
                        />
                      </Field>
                      {!isPower ? (
                        <Field
                          label="Fecha de ingreso"
                          error={key('entryDate')}
                        >
                          <Input
                            type="date"
                            value={vehicle.entryDate}
                            onChange={(event) =>
                              updateVehicle(
                                index,
                                'entryDate',
                                event.target.value
                              )
                            }
                          />
                        </Field>
                      ) : (
                        <>
                          <Field label="N.º motor">
                            <Input
                              value={vehicle.engineNumber}
                              onChange={(event) =>
                                updateVehicle(
                                  index,
                                  'engineNumber',
                                  event.target.value
                                )
                              }
                            />
                          </Field>
                          <Field label="N.º chasis">
                            <Input
                              value={vehicle.chassisNumber}
                              onChange={(event) =>
                                updateVehicle(
                                  index,
                                  'chassisNumber',
                                  event.target.value
                                )
                              }
                            />
                          </Field>
                          <Field label="N.º serie">
                            <Input
                              value={vehicle.serialNumber}
                              onChange={(event) =>
                                updateVehicle(
                                  index,
                                  'serialNumber',
                                  event.target.value
                                )
                              }
                            />
                          </Field>
                          <Field label="VIN">
                            <Input
                              value={vehicle.vin}
                              onChange={(event) =>
                                updateVehicle(index, 'vin', event.target.value)
                              }
                            />
                          </Field>
                          <Field label="Combustible">
                            <Input
                              value={vehicle.fuel}
                              onChange={(event) =>
                                updateVehicle(index, 'fuel', event.target.value)
                              }
                            />
                          </Field>
                          <Field label="Peso bruto (kg)">
                            <Input
                              type="number"
                              value={vehicle.grossWeightKg ?? ''}
                              onChange={(event) =>
                                updateVehicle(
                                  index,
                                  'grossWeightKg',
                                  event.target.value
                                    ? Number(event.target.value)
                                    : null
                                )
                              }
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
              {errors.vehicles ? (
                <p className="text-xs text-red-500">{errors.vehicles}</p>
              ) : null}
              {!isPower ? (
                <Button type="button" variant="outline" onClick={addVehicle}>
                  <Plus className="size-4" /> Agregar otro vehículo
                </Button>
              ) : null}
            </div>
          </Section>

          <Section
            icon={Scale}
            title="Responsable interno"
            description="El agente crea sus propios documentos; un administrador puede elegir otro ejecutivo."
          >
            <div className={grid}>
              <Field label="Ejecutivo" error={errors.executiveName}>
                <select
                  value={input.executiveUserId ?? ''}
                  onChange={(event) => chooseExecutive(event.target.value)}
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
              <Field label="Notas internas (no aparecen en el PDF)">
                <Textarea
                  value={input.internalNotes}
                  onChange={(event) =>
                    update('internalNotes', event.target.value)
                  }
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
