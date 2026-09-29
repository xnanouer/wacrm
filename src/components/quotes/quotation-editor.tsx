'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  FileDown,
  FileText,
  Loader2,
  MessageSquareText,
  Plus,
  Save,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { QuotationDocument } from './quotation-document';
import { QuotationRecipientDialog } from './quotation-recipient-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CatalogVehicle } from '@/lib/catalog/types';
import {
  addDaysToIsoDate,
  calculateQuotationAmounts,
  formatClp,
} from '@/lib/quotes/calculations';
import type {
  QuotationDocumentData,
  QuotationInput,
  QuotationRecord,
  QuotationSettings,
} from '@/lib/quotes/types';
import { QUOTATION_INSTALLMENT_PRESETS } from '@/lib/quotes/types';
import { renderQuotationMessage } from '@/lib/quotes/validation';
import { cn } from '@/lib/utils';

interface ContactOption {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  rut: string | null;
  company: string | null;
}

interface MemberOption {
  user_id: string;
  full_name: string;
  email: string;
  account_role: string;
}

interface OptionsPayload {
  settings: QuotationSettings;
  catalog: CatalogVehicle[];
  contacts: ContactOption[];
  members: MemberOption[];
  conversation: {
    id: string;
    contact_id: string;
    assigned_agent_id: string | null;
    contact: ContactOption | ContactOption[] | null;
  } | null;
  currentUserId: string;
}

interface QuotationEditorProps {
  initialQuotation?: QuotationRecord | null;
  conversationId?: string | null;
  embedded?: boolean;
  onSaved?: (quotation: QuotationRecord) => void;
  onCancel?: () => void;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function blankInput(conversationId?: string | null): QuotationInput {
  const issueDate = isoDate(new Date());
  return {
    contactId: null,
    conversationId: conversationId ?? null,
    catalogItemId: null,
    executiveUserId: null,
    executiveName: '',
    executivePhone: '',
    executiveEmail: '',
    clientName: '',
    clientRut: '',
    clientPhone: '',
    clientEmail: '',
    clientCity: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleVersion: '',
    vehicleYear: null,
    vehicleColor: '',
    vehicleFuel: '',
    vehicleTransmission: '',
    vehicleDrivetrain: '',
    vehicleMileageKm: 0,
    vehiclePlate: '',
    vehicleImageUrl: '',
    purchaseType: 'financed',
    listPrice: 0,
    discountAmount: 0,
    downPayment: 0,
    financedExpenses: 0,
    issueDate,
    validUntil: addDaysToIsoDate(issueDate, 30),
    documentNotes: '',
    internalNotes: '',
    termsText: '',
    messageText: '',
    installments: [],
  };
}

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function FormSection({
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
    <section className="border-border bg-card rounded-2xl border p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-foreground text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
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
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function QuotationEditor({
  initialQuotation = null,
  conversationId,
  embedded = false,
  onSaved,
  onCancel,
}: QuotationEditorProps) {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [input, setInput] = useState<QuotationInput>(
    () => initialQuotation ?? blankInput(conversationId)
  );
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState<
    'save' | 'generate' | 'send' | null
  >(null);
  const [persistedQuotation, setPersistedQuotation] =
    useState<QuotationRecord | null>(initialQuotation);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const savingRef = useRef(false);
  const quotationRef = useRef<QuotationRecord | null>(initialQuotation);

  useEffect(() => {
    quotationRef.current = initialQuotation;
    setPersistedQuotation(initialQuotation);
  }, [initialQuotation]);

  useEffect(() => {
    const query = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}`
      : '';
    let cancelled = false;
    fetch(`/api/quotes/options${query}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('options_failed');
        return (await response.json()) as OptionsPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        setOptions(payload);
        if (initialQuotation) return;
        const conversationContact = relationOne(
          payload.conversation?.contact ?? null
        );
        const executive =
          payload.members.find(
            (member) =>
              member.user_id === payload.conversation?.assigned_agent_id
          ) ??
          payload.members.find(
            (member) => member.user_id === payload.currentUserId
          );
        setInput((current) => {
          const next = {
            ...current,
            validUntil: addDaysToIsoDate(
              current.issueDate,
              payload.settings.defaultValidityDays
            ),
            termsText: payload.settings.defaultTerms,
            executiveUserId: executive?.user_id ?? null,
            executiveName: executive?.full_name ?? '',
            executiveEmail: executive?.email ?? '',
          };
          if (!conversationContact) return next;
          return {
            ...next,
            contactId: conversationContact.id,
            conversationId: payload.conversation?.id ?? current.conversationId,
            clientName: conversationContact.name || conversationContact.phone,
            clientPhone: conversationContact.phone,
            clientEmail: conversationContact.email ?? '',
            clientRut: conversationContact.rut ?? '',
          };
        });
      })
      .catch(() => toast.error('No fue posible cargar los datos para cotizar.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, initialQuotation]);

  const amounts = useMemo(() => calculateQuotationAmounts(input), [input]);

  useEffect(() => {
    if (!options || initialQuotation || input.messageText) return;
    const vehicle = [
      input.vehicleMake,
      input.vehicleModel,
      input.vehicleVersion,
    ]
      .filter(Boolean)
      .join(' ');
    const rendered = renderQuotationMessage(options.settings.messageTemplate, {
      cliente: input.clientName || 'cliente',
      numero: 'por asignar',
      vehiculo: vehicle || 'vehículo seleccionado',
      precio: formatClp(amounts.finalPrice),
      vigencia: input.validUntil || 'por definir',
      ejecutivo: input.executiveName || 'tu ejecutivo',
    });
    setInput((current) => ({ ...current, messageText: rendered.text }));
  }, [
    amounts.finalPrice,
    initialQuotation,
    input.clientName,
    input.executiveName,
    input.messageText,
    input.validUntil,
    input.vehicleMake,
    input.vehicleModel,
    input.vehicleVersion,
    options,
  ]);

  const update = <K extends keyof QuotationInput>(
    key: K,
    value: QuotationInput[K]
  ) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const selectContact = (contactId: string) => {
    const contact = options?.contacts.find((item) => item.id === contactId);
    if (!contact) {
      update('contactId', null);
      return;
    }
    setInput((current) => ({
      ...current,
      contactId: contact.id,
      clientName: contact.name || contact.phone,
      clientPhone: contact.phone,
      clientEmail: contact.email ?? '',
      clientRut: contact.rut ?? '',
    }));
  };

  const selectVehicle = (vehicleId: string) => {
    const vehicle = options?.catalog.find((item) => item.id === vehicleId);
    if (!vehicle) {
      update('catalogItemId', null);
      return;
    }
    setInput((current) => ({
      ...current,
      catalogItemId: vehicle.id,
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      vehicleVersion: vehicle.version,
      vehicleYear: vehicle.year,
      vehicleColor: vehicle.color,
      vehicleFuel: vehicle.fuel,
      vehicleTransmission: vehicle.transmission,
      vehicleDrivetrain: vehicle.drivetrain,
      vehicleMileageKm: vehicle.mileage,
      vehiclePlate: vehicle.licensePlate,
      vehicleImageUrl: vehicle.photoUrl ?? '',
      listPrice: vehicle.listPrice,
      discountAmount: vehicle.offerPrice
        ? Math.max(0, vehicle.listPrice - vehicle.offerPrice)
        : 0,
      downPayment: vehicle.minimumDownPayment ?? current.downPayment,
    }));
  };

  const selectExecutive = (userId: string) => {
    const member = options?.members.find((item) => item.user_id === userId);
    setInput((current) => ({
      ...current,
      executiveUserId: member?.user_id ?? null,
      executiveName: member?.full_name ?? '',
      executiveEmail: member?.email ?? '',
    }));
  };

  const addInstallment = (termMonths: number) => {
    if (input.installments.some((item) => item.termMonths === termMonths))
      return;
    update('installments', [
      ...input.installments,
      {
        termMonths,
        monthlyPayment: Math.ceil(amounts.amountToFinance / termMonths),
        observation: 'Referencial',
        sortOrder: input.installments.length,
      },
    ]);
  };

  const save = async (
    action: 'save' | 'generate' | 'send' = 'save',
    recipientContactId?: string
  ) => {
    if (savingRef.current) return;
    if (action === 'send') {
      if (!recipientContactId) {
        toast.error('Selecciona el contacto que recibirá la cotización.');
        return;
      }
    }
    savingRef.current = true;
    setSavingAction(action);
    setErrors({});
    let savedQuotation: QuotationRecord | null = null;
    try {
      const existingQuotation = quotationRef.current;
      const response = await fetch(
        existingQuotation
          ? `/api/quotes/${existingQuotation.id}`
          : '/api/quotes',
        {
          method: existingQuotation ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        errors?: Record<string, string>;
        quotation?: QuotationRecord;
      };
      if (!response.ok || !payload.quotation) {
        setErrors(payload.errors ?? {});
        throw new Error(payload.error || 'No fue posible guardar.');
      }
      const quotation = payload.quotation;
      savedQuotation = quotation;
      quotationRef.current = quotation;
      setPersistedQuotation(quotation);
      if (action === 'generate' || action === 'send') {
        toast.info('Generando PDF y PNG...');
        const generateResponse = await fetch(
          `/api/quotes/${quotation.id}/generate`,
          { method: 'POST' }
        );
        const generatePayload = (await generateResponse
          .json()
          .catch(() => ({}))) as { error?: string; version?: number };
        if (!generateResponse.ok) {
          throw new Error(
            generatePayload.error || 'No fue posible generar el documento.'
          );
        }
        if (action === 'generate') {
          toast.success(
            `PDF y PNG generados${generatePayload.version ? ` · versión ${generatePayload.version}` : ''}.`
          );
        }
      }
      if (action === 'send') {
        const sendResponse = await fetch(`/api/quotes/${quotation.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: options?.settings.defaultAttachmentFormat ?? 'pdf',
            idempotencyKey: crypto.randomUUID(),
            recipientContactId,
          }),
        });
        const sendPayload = (await sendResponse.json().catch(() => ({}))) as {
          error?: string;
          status?: string;
          errors?: Array<{ message: string }>;
        };
        if (!sendResponse.ok || sendPayload.status === 'failed') {
          throw new Error(
            sendPayload.error ||
              sendPayload.errors?.[0]?.message ||
              'No fue posible enviar la cotización.'
          );
        }
        toast.success(
          sendPayload.status === 'partial'
            ? 'La cotización se envió parcialmente. Revisa el historial.'
            : 'Cotización enviada al cliente por WhatsApp.'
        );
        setRecipientOpen(false);
      }
      if (action === 'save') {
        toast.success(
          existingQuotation ? 'Cotización actualizada.' : 'Cotización creada.'
        );
      }
      try {
        onSaved?.(quotation);
      } catch (error) {
        console.error('[quotes] quotation saved but callback failed:', error);
        toast.warning('La cotización se guardó correctamente.', {
          description: 'Recarga la lista si aún no aparece.',
        });
      }
      if (!embedded) router.push(`/quotes/${quotation.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No fue posible guardar.';
      toast.error(
        savedQuotation && action !== 'save'
          ? `La cotización ${savedQuotation.quoteNumber} quedó guardada, pero no se completó la generación. ${message}`
          : message
      );
    } finally {
      savingRef.current = false;
      setSavingAction(null);
    }
  };

  const settings = options?.settings;
  const previewRecord: QuotationRecord | null = settings
    ? {
        ...input,
        id: persistedQuotation?.id ?? 'preview',
        accountId: settings.accountId,
        quoteNumber: persistedQuotation?.quoteNumber ?? 'NX-PREVIA',
        sequenceNumber: persistedQuotation?.sequenceNumber ?? 0,
        currentVersion: persistedQuotation?.currentVersion ?? 0,
        status: persistedQuotation?.status ?? 'draft',
        finalPrice: amounts.finalPrice,
        amountToFinance: amounts.amountToFinance,
        generatedAt: persistedQuotation?.generatedAt ?? null,
        lastSentAt: persistedQuotation?.lastSentAt ?? null,
        deletionHold: persistedQuotation?.deletionHold ?? false,
        deletionHoldReason: persistedQuotation?.deletionHoldReason ?? null,
        scheduledDeletionAt: persistedQuotation?.scheduledDeletionAt ?? null,
        createdByUserId:
          persistedQuotation?.createdByUserId ?? options.currentUserId,
        updatedByUserId:
          persistedQuotation?.updatedByUserId ?? options.currentUserId,
        createdAt: persistedQuotation?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : null;
  const documentData: QuotationDocumentData | null =
    settings && previewRecord
      ? {
          quotation: previewRecord,
          settings,
          executive: {
            name: input.executiveName,
            phone: input.executivePhone,
            email: input.executiveEmail,
          },
          installments: input.installments,
          generatedAt: new Date().toISOString(),
        }
      : null;

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-80 items-center justify-center gap-3 text-sm">
        <Loader2 className="text-primary size-5 animate-spin" /> Preparando la
        cotización...
      </div>
    );
  }

  return (
    <div className={cn('min-w-0', embedded && 'pb-20')}>
      {!embedded && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.back()}
              aria-label="Volver"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
                Cotizaciones
              </p>
              <h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight">
                {persistedQuotation
                  ? `Editar ${persistedQuotation.quoteNumber}`
                  : 'Nueva cotización vehicular'}
              </h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPreviewOpen((value) => !value)}
            >
              <Eye className="size-4" /> Vista previa
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'grid gap-6',
          previewOpen && !embedded
            ? 'xl:grid-cols-[minmax(0,1fr)_600px]'
            : 'grid-cols-1'
        )}
      >
        <div className="space-y-5">
          <FormSection
            icon={UserRound}
            title="Cliente"
            description="Los datos quedan guardados como una foto histórica; no modifican el contacto."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contacto existente">
                <select
                  value={input.contactId ?? ''}
                  onChange={(event) => selectContact(event.target.value)}
                  className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="">Ingreso manual</option>
                  {options?.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name || contact.phone} · {contact.phone}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre completo" error={errors.clientName}>
                <Input
                  value={input.clientName}
                  onChange={(event) => update('clientName', event.target.value)}
                />
              </Field>
              <Field label="RUT (opcional)" error={errors.clientRut}>
                <Input
                  value={input.clientRut}
                  onChange={(event) => update('clientRut', event.target.value)}
                  placeholder="12.345.678-5"
                />
              </Field>
              <Field label="Teléfono" error={errors.clientPhone}>
                <Input
                  value={input.clientPhone}
                  onChange={(event) =>
                    update('clientPhone', event.target.value)
                  }
                />
              </Field>
              <Field label="Correo" error={errors.clientEmail}>
                <Input
                  type="email"
                  value={input.clientEmail}
                  onChange={(event) =>
                    update('clientEmail', event.target.value)
                  }
                />
              </Field>
              <Field label="Ciudad o comuna">
                <Input
                  value={input.clientCity}
                  onChange={(event) => update('clientCity', event.target.value)}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={CarFront}
            title="Vehículo"
            description="Selecciona una unidad aprobada del catálogo o completa los datos manualmente."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unidad del catálogo">
                <select
                  value={input.catalogItemId ?? ''}
                  onChange={(event) => selectVehicle(event.target.value)}
                  className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm sm:col-span-2"
                >
                  <option value="">Vehículo manual</option>
                  {options?.catalog.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.make} {vehicle.model} {vehicle.version} ·{' '}
                      {vehicle.year} ·{' '}
                      {formatClp(vehicle.offerPrice ?? vehicle.listPrice)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Marca" error={errors.vehicleMake}>
                <Input
                  value={input.vehicleMake}
                  onChange={(event) =>
                    update('vehicleMake', event.target.value)
                  }
                />
              </Field>
              <Field label="Modelo" error={errors.vehicleModel}>
                <Input
                  value={input.vehicleModel}
                  onChange={(event) =>
                    update('vehicleModel', event.target.value)
                  }
                />
              </Field>
              <Field label="Versión">
                <Input
                  value={input.vehicleVersion}
                  onChange={(event) =>
                    update('vehicleVersion', event.target.value)
                  }
                />
              </Field>
              <Field label="Año" error={errors.vehicleYear}>
                <Input
                  type="number"
                  value={input.vehicleYear ?? ''}
                  onChange={(event) =>
                    update(
                      'vehicleYear',
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                />
              </Field>
              <Field label="Kilometraje">
                <Input
                  type="number"
                  min={0}
                  value={input.vehicleMileageKm}
                  onChange={(event) =>
                    update('vehicleMileageKm', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="Color">
                <Input
                  value={input.vehicleColor}
                  onChange={(event) =>
                    update('vehicleColor', event.target.value)
                  }
                />
              </Field>
              <Field label="Combustible">
                <Input
                  value={input.vehicleFuel}
                  onChange={(event) =>
                    update('vehicleFuel', event.target.value)
                  }
                />
              </Field>
              <Field label="Transmisión">
                <Input
                  value={input.vehicleTransmission}
                  onChange={(event) =>
                    update('vehicleTransmission', event.target.value)
                  }
                />
              </Field>
              <Field label="Tracción">
                <Input
                  value={input.vehicleDrivetrain}
                  onChange={(event) =>
                    update('vehicleDrivetrain', event.target.value)
                  }
                />
              </Field>
              <Field label="Patente">
                <Input
                  value={input.vehiclePlate}
                  onChange={(event) =>
                    update('vehiclePlate', event.target.value)
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            icon={CircleDollarSign}
            title="Precio y financiamiento"
            description="Todos los montos se guardan como pesos chilenos enteros."
          >
            <div className="bg-muted mb-5 grid grid-cols-2 gap-2 rounded-xl p-1">
              {(['financed', 'cash'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('purchaseType', type)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    input.purchaseType === type
                      ? 'bg-background text-primary shadow-sm'
                      : 'text-muted-foreground'
                  )}
                >
                  {type === 'financed' ? 'Financiado' : 'Contado'}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Precio de lista" error={errors.listPrice}>
                <Input
                  type="number"
                  min={0}
                  value={input.listPrice || ''}
                  onChange={(event) =>
                    update('listPrice', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="Bono o descuento" error={errors.discountAmount}>
                <Input
                  type="number"
                  min={0}
                  value={input.discountAmount || ''}
                  onChange={(event) =>
                    update('discountAmount', Number(event.target.value))
                  }
                />
              </Field>
              {input.purchaseType === 'financed' && (
                <>
                  <Field label="Pie" error={errors.downPayment}>
                    <Input
                      type="number"
                      min={0}
                      value={input.downPayment || ''}
                      onChange={(event) =>
                        update('downPayment', Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field label="Gastos financiados">
                    <Input
                      type="number"
                      min={0}
                      value={input.financedExpenses || ''}
                      onChange={(event) =>
                        update('financedExpenses', Number(event.target.value))
                      }
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="border-primary/20 bg-primary/5 mt-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">Precio final</p>
                <p className="mt-1 font-bold">
                  {formatClp(amounts.finalPrice)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Pie</p>
                <p className="mt-1 font-bold">
                  {formatClp(amounts.downPayment)} ·{' '}
                  {amounts.downPaymentPercentage}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  Monto a financiar
                </p>
                <p className="text-primary mt-1 font-bold">
                  {formatClp(amounts.amountToFinance)}
                </p>
              </div>
            </div>
          </FormSection>

          {input.purchaseType === 'financed' && (
            <FormSection
              icon={CalendarDays}
              title="Opciones de cuotas"
              description="Puedes usar plazos rápidos y ajustar manualmente cada valor."
            >
              <div className="mb-4 flex flex-wrap gap-2">
                {QUOTATION_INSTALLMENT_PRESETS.map((term) => (
                  <Button
                    key={term}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addInstallment(term)}
                    disabled={input.installments.some(
                      (item) => item.termMonths === term
                    )}
                  >
                    <Plus className="size-3.5" />
                    {term} cuotas
                  </Button>
                ))}
              </div>
              <div className="space-y-3">
                {input.installments.map((option, index) => (
                  <div
                    key={`${option.termMonths}-${index}`}
                    className="border-border grid gap-3 rounded-xl border p-3 sm:grid-cols-[120px_1fr_1fr_40px]"
                  >
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={option.termMonths}
                      onChange={(event) =>
                        update(
                          'installments',
                          input.installments.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  termMonths: Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      value={option.monthlyPayment}
                      onChange={(event) =>
                        update(
                          'installments',
                          input.installments.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  monthlyPayment: Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    />
                    <Input
                      value={option.observation}
                      onChange={(event) =>
                        update(
                          'installments',
                          input.installments.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, observation: event.target.value }
                              : item
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        update(
                          'installments',
                          input.installments.filter(
                            (_, itemIndex) => itemIndex !== index
                          )
                        )
                      }
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              {errors.installments && (
                <p className="mt-2 text-xs text-red-500">
                  {errors.installments}
                </p>
              )}
            </FormSection>
          )}

          <FormSection
            icon={FileText}
            title="Documento"
            description="Define la vigencia, el ejecutivo y las notas visibles para el cliente."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha de emisión" error={errors.issueDate}>
                <Input
                  type="date"
                  value={input.issueDate}
                  onChange={(event) => update('issueDate', event.target.value)}
                />
              </Field>
              <Field label="Válida hasta" error={errors.validUntil}>
                <Input
                  type="date"
                  value={input.validUntil}
                  onChange={(event) => update('validUntil', event.target.value)}
                />
              </Field>
              <Field label="Ejecutivo" error={errors.executiveName}>
                <select
                  value={input.executiveUserId ?? ''}
                  onChange={(event) => selectExecutive(event.target.value)}
                  className="border-input bg-background h-10 w-full rounded-lg border px-3 text-sm"
                >
                  <option value="">Seleccionar</option>
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
                  onChange={(event) =>
                    update('executivePhone', event.target.value)
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Observaciones visibles">
                  <Textarea
                    value={input.documentNotes}
                    onChange={(event) =>
                      update('documentNotes', event.target.value)
                    }
                    rows={3}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Condiciones y aviso legal">
                  <Textarea
                    value={input.termsText}
                    onChange={(event) =>
                      update('termsText', event.target.value)
                    }
                    rows={4}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Nota interna (no aparece en el PDF)">
                  <Textarea
                    value={input.internalNotes}
                    onChange={(event) =>
                      update('internalNotes', event.target.value)
                    }
                    rows={3}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection
            icon={MessageSquareText}
            title="Mensaje de WhatsApp"
            description="Mensaje determinista que acompañará el documento al enviarlo."
          >
            <Textarea
              value={input.messageText}
              onChange={(event) => update('messageText', event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </FormSection>
        </div>

        {previewOpen && !embedded && documentData && (
          <aside className="hidden xl:block">
            <div className="border-border bg-muted/40 sticky top-0 overflow-hidden rounded-2xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Vista previa A4</p>
                  <p className="text-muted-foreground text-xs">
                    Se generará desde esta misma plantilla.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="size-3.5" /> Dinámica
                </span>
              </div>
              <div className="max-h-[calc(100vh-190px)] overflow-auto rounded-xl bg-slate-200 p-3">
                <div
                  style={{
                    transform: 'scale(.66)',
                    transformOrigin: 'top left',
                    width: '151.5%',
                    marginBottom: '-51%',
                  }}
                >
                  <QuotationDocument data={documentData} />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <div
        className={cn(
          'border-border bg-background/95 sticky bottom-0 z-20 mt-6 border-t p-4 shadow-[0_-14px_34px_rgba(0,0,0,0.12)] backdrop-blur',
          !embedded && 'rounded-2xl border'
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-semibold">Finalizar cotización</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Puedes guardarla, generar el documento o enviarlo directamente al
              cliente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {embedded && (
              <Button
                variant="ghost"
                onClick={onCancel}
                disabled={savingAction !== null}
              >
                Cancelar
              </Button>
            )}
            {embedded && (
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={savingAction !== null}
              >
                <Eye className="size-4" />
                Previsualizar
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => void save('save')}
              disabled={savingAction !== null}
            >
              {savingAction === 'save' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar
            </Button>
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => void save('generate')}
              disabled={savingAction !== null}
            >
              {savingAction === 'generate' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              Generar PDF
            </Button>
            <Button
              className="shadow-primary/25 min-w-44 shadow-lg"
              onClick={() => setRecipientOpen(true)}
              disabled={savingAction !== null}
              title="Seleccionar contacto y enviar por WhatsApp"
            >
              {savingAction === 'send' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar al cliente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <QuotationRecipientDialog
        open={recipientOpen}
        onOpenChange={setRecipientOpen}
        currentContactId={input.contactId}
        sending={savingAction === 'send'}
        onSend={(contactId) => void save('send', contactId)}
      />

      {embedded && previewOpen && documentData && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-auto bg-black/70 p-4 sm:p-8">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Cerrar vista previa"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="relative z-10">
            <QuotationDocument data={documentData} />
            <Button
              className="fixed top-6 right-6"
              onClick={() => setPreviewOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
