'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileDown,
  Loader2,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Send,
  ShieldOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';

import { QuotationDocument } from './quotation-document';
import { QuotationRecipientDialog } from './quotation-recipient-dialog';
import { QuotationStatusBadge } from './quotation-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type {
  QuotationDocumentData,
  QuotationActivity,
  QuotationRecord,
  QuotationSendSummary,
  QuotationStatus,
  QuotationVersion,
} from '@/lib/quotes/types';
import { QUOTATION_STATUS_LABELS } from '@/lib/quotes/types';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';

interface QuotationDetailProps {
  quotation: QuotationRecord;
  versions: QuotationVersion[];
  sends: QuotationSendSummary[];
  events: QuotationActivity[];
  currentDocument: QuotationDocumentData;
  role: AccountRole;
}

const ACTIVITY_LABELS: Record<QuotationActivity['eventType'], string> = {
  created: 'Cotización creada',
  updated: 'Datos actualizados',
  generated: 'Primera versión generada',
  versioned: 'Nueva versión generada',
  sent: 'Enviada por WhatsApp',
  resent: 'Reenviada por WhatsApp',
  status_changed: 'Estado comercial actualizado',
  duplicated: 'Cotización duplicada',
  hold_enabled: 'Protección contra eliminación activada',
  hold_disabled: 'Protección contra eliminación retirada',
  retention_warning: 'Advertencia de retención registrada',
};

function activityLabel(event: QuotationActivity): string {
  if (event.eventType === 'status_changed' && event.toStatus) {
    return `Estado cambiado a ${QUOTATION_STATUS_LABELS[event.toStatus]}`;
  }
  const version = event.metadata.version;
  if (
    (event.eventType === 'generated' || event.eventType === 'versioned') &&
    typeof version === 'number'
  ) {
    return `Versión ${version} generada`;
  }
  return ACTIVITY_LABELS[event.eventType];
}

function sendStatusLabel(status: QuotationSendSummary['status']): string {
  return {
    pending: 'Pendiente',
    sending: 'Enviando',
    sent: 'Enviado',
    partial: 'Parcial',
    failed: 'Fallido',
  }[status];
}

function sendStatusClass(status: QuotationSendSummary['status']): string {
  if (status === 'sent') return 'text-emerald-600';
  if (status === 'partial' || status === 'sending') return 'text-amber-600';
  if (status === 'failed') return 'text-red-500';
  return 'text-muted-foreground';
}

export function QuotationDetail({
  quotation,
  versions,
  sends,
  events,
  currentDocument,
  role,
}: QuotationDetailProps) {
  const router = useRouter();
  const canEdit = hasMinRole(role, 'agent');
  const [busy, setBusy] = useState<'generate' | 'send' | 'status' | null>(null);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [zoom, setZoom] = useState(0.72);
  const [selectedVersion, setSelectedVersion] = useState<number | 'current'>(
    versions.find((item) => item.generationStatus === 'ready')?.versionNumber ??
      'current'
  );
  const selected = useMemo(
    () =>
      selectedVersion === 'current'
        ? null
        : (versions.find((item) => item.versionNumber === selectedVersion) ??
          null),
    [selectedVersion, versions]
  );
  const generate = async () => {
    setBusy('generate');
    try {
      const response = await fetch(`/api/quotes/${quotation.id}/generate`, {
        method: 'POST',
      });
      const payload = (await response.json()) as {
        error?: string;
        version?: number;
      };
      if (!response.ok) throw new Error(payload.error || 'No se pudo generar.');
      toast.success(`Versión ${payload.version} generada en PDF y PNG.`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo generar.'
      );
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (status: QuotationStatus) => {
    setBusy('status');
    try {
      const response = await fetch(`/api/quotes/${quotation.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || 'No se pudo cambiar el estado.');
      toast.success('Estado actualizado.');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cambiar el estado.'
      );
    } finally {
      setBusy(null);
    }
  };

  const openRecipientPicker = () => {
    if (!versions.some((item) => item.generationStatus === 'ready')) {
      toast.error('Primero genera una versión PDF/PNG.');
      return;
    }
    setRecipientOpen(true);
  };

  const send = async (recipientContactId: string) => {
    const format = currentDocument.settings.defaultAttachmentFormat;
    setBusy('send');
    try {
      const response = await fetch(`/api/quotes/${quotation.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          idempotencyKey: crypto.randomUUID(),
          recipientContactId,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok || payload.status === 'failed') {
        throw new Error(payload.error || 'No se pudo enviar.');
      }
      toast.success(
        payload.status === 'partial'
          ? 'Envío parcial registrado. Revisa el detalle.'
          : 'Cotización enviada por WhatsApp.'
      );
      setRecipientOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo enviar.'
      );
    } finally {
      setBusy(null);
    }
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(quotation.messageText);
    toast.success('Mensaje de WhatsApp copiado.');
  };

  const toggleHold = async () => {
    const enabling = !quotation.deletionHold;
    const reason = enabling
      ? window.prompt('Motivo de la protección de esta cotización:')?.trim()
      : '';
    if (enabling && !reason) return;
    try {
      const response = await fetch(`/api/quotes/${quotation.id}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabling, reason }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || 'No se pudo actualizar.');
      toast.success(
        enabling
          ? 'Cotización protegida contra eliminación.'
          : 'Protección retirada.'
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar.'
      );
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/quotes"
            className={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{quotation.quoteNumber}</h1>
              <QuotationStatusBadge status={quotation.status} />
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {quotation.clientName} · {quotation.vehicleMake}{' '}
              {quotation.vehicleModel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Link
                href={`/quotes/${quotation.id}/edit`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <Pencil className="size-4" />
                Editar
              </Link>
              <Button
                variant="outline"
                onClick={() => void generate()}
                disabled={busy !== null}
              >
                {busy === 'generate' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
                Nueva versión
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => void copyMessage()}>
            <Copy className="size-4" />
            Copiar mensaje
          </Button>
          {canEdit && (
            <Button onClick={openRecipientPicker} disabled={busy !== null}>
              {busy === 'send' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar por WhatsApp
            </Button>
          )}
        </div>
      </div>
      <QuotationRecipientDialog
        open={recipientOpen}
        onOpenChange={setRecipientOpen}
        currentContactId={quotation.contactId}
        sending={busy === 'send'}
        onSend={(contactId) => void send(contactId)}
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="border-border bg-muted/35 overflow-hidden rounded-2xl border">
          <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <div className="flex items-center gap-2">
              <select
                value={selectedVersion}
                onChange={(event) =>
                  setSelectedVersion(
                    event.target.value === 'current'
                      ? 'current'
                      : Number(event.target.value)
                  )
                }
                className="border-input bg-background h-9 rounded-lg border px-3 text-sm"
              >
                <option value="current">Borrador actual</option>
                {versions.map((version) => (
                  <option
                    key={version.id}
                    value={version.versionNumber}
                    disabled={version.generationStatus !== 'ready'}
                  >
                    Versión {version.versionNumber}{' '}
                    {version.generationStatus === 'failed'
                      ? '(fallida)'
                      : version.generationStatus === 'pending'
                        ? '(procesando)'
                        : ''}
                  </option>
                ))}
              </select>
              {selected && (
                <>
                  <a
                    href={`/api/quotes/${quotation.id}/artifact?format=pdf&version=${selected.versionNumber}`}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                    })}
                  >
                    <Download className="size-4" />
                    PDF
                  </a>
                  <a
                    href={`/api/quotes/${quotation.id}/artifact?format=png&version=${selected.versionNumber}`}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                    })}
                  >
                    <Download className="size-4" />
                    PNG
                  </a>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((value) => Math.max(0.45, value - 0.08))}
              >
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-muted-foreground w-12 text-center text-xs">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoom((value) => Math.min(1.1, value + 0.08))}
              >
                <ZoomIn className="size-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-190px)] overflow-auto bg-slate-200 p-4">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                width: `${100 / zoom}%`,
                marginBottom: `${-100 * (1 - zoom)}%`,
              }}
            >
              {selected ? (
                // Authenticated artifact URLs bypass the public image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/quotes/${quotation.id}/artifact?format=png&version=${selected.versionNumber}&inline=1`}
                  alt={`Vista previa de ${quotation.quoteNumber}, versión ${selected.versionNumber}`}
                  className="mx-auto block w-[210mm] bg-white shadow-xl"
                />
              ) : (
                <QuotationDocument data={currentDocument} />
              )}
            </div>
          </div>
        </section>
        <aside className="space-y-5">
          <div className="border-border bg-card rounded-2xl border p-5">
            <h2 className="font-semibold">Estado comercial</h2>
            <select
              value={quotation.status}
              onChange={(event) =>
                void changeStatus(event.target.value as QuotationStatus)
              }
              disabled={busy !== null || !canEdit}
              className="border-input bg-background mt-4 h-10 w-full rounded-lg border px-3 text-sm"
            >
              {Object.entries(QUOTATION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="bg-muted/60 mt-4 flex gap-2 rounded-xl p-3 text-xs">
              <CalendarClock className="text-primary mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground leading-relaxed">
                {quotation.scheduledDeletionAt
                  ? `Eliminación programada: ${new Date(quotation.scheduledDeletionAt).toLocaleString('es-CL')}.`
                  : 'Sin eliminación programada mientras este estado o una protección la suspendan.'}
              </p>
            </div>
          </div>
          <div className="border-border bg-card rounded-2xl border p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock3 className="text-primary size-4" /> Historial
            </h2>
            <div className="mt-4 max-h-72 space-y-4 overflow-auto pr-1">
              {events.length ? (
                events.map((event) => (
                  <div key={event.id} className="flex gap-3 text-sm">
                    <span className="bg-primary/10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full">
                      <CheckCircle2 className="text-primary size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{activityLabel(event)}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {new Date(event.createdAt).toLocaleString('es-CL')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Sin actividad registrada.
                </p>
              )}
            </div>
          </div>
          {sends.length > 0 && (
            <div className="border-border bg-card rounded-2xl border p-5">
              <h2 className="font-semibold">Envíos por WhatsApp</h2>
              <div className="mt-4 space-y-3">
                {sends.slice(0, 5).map((sendItem) => (
                  <div
                    key={sendItem.id}
                    className="border-border rounded-xl border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium uppercase">
                        {sendItem.format}
                      </span>
                      <span className={sendStatusClass(sendItem.status)}>
                        {sendStatusLabel(sendItem.status)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {new Date(sendItem.createdAt).toLocaleString('es-CL')}
                    </p>
                    {sendItem.errorMessage && (
                      <p className="mt-2 text-xs text-red-500">
                        {sendItem.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="border-border bg-card rounded-2xl border p-5">
            <h2 className="font-semibold">Versiones</h2>
            <div className="mt-4 space-y-3">
              {versions.length ? (
                versions.map((version) => (
                  <button
                    type="button"
                    key={version.id}
                    onClick={() =>
                      version.generationStatus === 'ready' &&
                      setSelectedVersion(version.versionNumber)
                    }
                    className="border-border hover:border-primary/40 flex w-full items-center justify-between rounded-xl border p-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        Versión {version.versionNumber}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {new Date(version.createdAt).toLocaleString('es-CL')}
                      </p>
                    </div>
                    <span
                      className={
                        version.generationStatus === 'ready'
                          ? 'text-emerald-500'
                          : version.generationStatus === 'failed'
                            ? 'text-red-500'
                            : 'text-amber-500'
                      }
                    >
                      {version.generationStatus === 'ready'
                        ? 'Lista'
                        : version.generationStatus === 'failed'
                          ? 'Fallida'
                          : 'Procesando'}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Aún no hay versiones generadas.
                </p>
              )}
            </div>
          </div>
          {hasMinRole(role, 'admin') && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void toggleHold()}
            >
              {quotation.deletionHold ? (
                <ShieldOff className="size-4" />
              ) : (
                <LockKeyhole className="size-4" />
              )}
              {quotation.deletionHold
                ? 'Quitar protección'
                : 'Proteger eliminación'}
            </Button>
          )}
          {quotation.conversationId && (
            <Link
              href={`/inbox?conversationId=${quotation.conversationId}`}
              className={buttonVariants({
                variant: 'outline',
                className: 'w-full',
              })}
            >
              <MessageCircle className="size-4" />
              Ver conversación
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
