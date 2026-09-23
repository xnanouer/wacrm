'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Download,
  Eye,
  FileDown,
  FilePlus2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { QuotationStatusBadge } from './quotation-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { formatClp } from '@/lib/quotes/calculations';
import {
  QUOTATION_STATUS_LABELS,
  type QuotationRecord,
  type QuotationStatus,
} from '@/lib/quotes/types';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';

interface QuotationListProps {
  initialQuotations: QuotationRecord[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
  initialQuery: string;
  initialStatus?: QuotationStatus;
  contactId?: string;
  role: AccountRole;
}

export function QuotationList({
  initialQuotations,
  initialTotal,
  initialPage,
  pageSize,
  initialQuery,
  initialStatus,
  contactId,
  role,
}: QuotationListProps) {
  const canEdit = hasMinRole(role, 'agent');
  const router = useRouter();
  const [quotations, setQuotations] = useState(initialQuotations);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<QuotationStatus | 'all'>(
    initialStatus ?? 'all'
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const filtered = useMemo(() => quotations, [quotations]);

  useEffect(() => {
    setQuotations(initialQuotations);
  }, [initialQuotations]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (status !== 'all') params.set('status', status);
      if (contactId) params.set('contactId', contactId);
      const next = params.toString();
      if (next !== window.location.search.slice(1)) {
        router.replace(next ? `/quotes?${next}` : '/quotes');
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [contactId, query, router, status]);

  const duplicate = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/quotes/${id}/duplicate`, {
        method: 'POST',
      });
      const payload = (await response.json()) as {
        error?: string;
        quotation?: QuotationRecord;
      };
      if (!response.ok || !payload.quotation)
        throw new Error(payload.error || 'No se pudo duplicar.');
      setQuotations((current) => [payload.quotation!, ...current]);
      toast.success(`Se creó ${payload.quotation.quoteNumber}.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo duplicar.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const generate = async (id: string) => {
    setBusyId(id);
    toast.info('Generando PDF y PNG...');
    try {
      const response = await fetch(`/api/quotes/${id}/generate`, {
        method: 'POST',
      });
      const payload = (await response.json()) as {
        error?: string;
        version?: number;
      };
      if (!response.ok) throw new Error(payload.error || 'No se pudo generar.');
      setQuotations((current) =>
        current.map((quotation) =>
          quotation.id === id
            ? {
                ...quotation,
                currentVersion: payload.version ?? quotation.currentVersion + 1,
                status:
                  quotation.status === 'draft' ? 'generated' : quotation.status,
              }
            : quotation
        )
      );
      toast.success(`Versión ${payload.version} generada.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo generar.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (quotation: QuotationRecord) => {
    if (
      !window.confirm(
        `¿Eliminar ${quotation.quoteNumber}? Esta acción no se puede deshacer.`
      )
    )
      return;
    setBusyId(quotation.id);
    try {
      const response = await fetch(`/api/quotes/${quotation.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'No se pudo eliminar.');
      setQuotations((current) =>
        current.filter((item) => item.id !== quotation.id)
      );
      if (payload.warning) toast.warning(payload.warning);
      else toast.success('Cotización eliminada.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo eliminar.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (id: string) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/quotes/${id}`
    );
    toast.success('Enlace interno copiado.');
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Ventas
          </p>
          <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight">
            Cotizaciones
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Crea, versiona y envía propuestas vehiculares sin salir de Nexora.
          </p>
        </div>
        <div className="flex gap-2">
          {hasMinRole(role, 'admin') && (
            <Link
              href="/quotes/settings"
              className={buttonVariants({ variant: 'outline' })}
            >
              <Settings2 className="size-4" />
              Configurar
            </Link>
          )}
          {canEdit && (
            <Link href="/quotes/new" className={buttonVariants()}>
              <Plus className="size-4" />
              Nueva cotización
            </Link>
          )}
        </div>
      </div>

      <div className="border-border bg-card mt-6 rounded-2xl border p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_230px]">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por número, cliente, teléfono o vehículo"
              className="pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as QuotationStatus | 'all')
            }
            className="border-input bg-background h-10 rounded-lg border px-3 text-sm"
          >
            <option value="all">Todos los estados</option>
            {Object.entries(QUOTATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border-border bg-card mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <FilePlus2 className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            No hay cotizaciones para mostrar
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">
            Crea la primera o cambia los filtros de búsqueda.
          </p>
          {canEdit && (
            <Link
              href="/quotes/new"
              className={buttonVariants({ className: 'mt-5' })}
            >
              <Plus className="size-4" />
              Nueva cotización
            </Link>
          )}
        </div>
      ) : (
        <div className="border-border bg-card mt-5 overflow-hidden rounded-2xl border shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-5 py-3">Cotización</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Vehículo</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Vigencia</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {filtered.map((quotation) => (
                  <tr
                    key={quotation.id}
                    className="hover:bg-muted/35 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/quotes/${quotation.id}`}
                        className="text-primary font-semibold hover:underline"
                      >
                        {quotation.quoteNumber}
                      </Link>
                      <p className="text-muted-foreground mt-1 text-xs">
                        v{quotation.currentVersion || 0}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">{quotation.clientName}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {quotation.clientPhone}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">
                        {quotation.vehicleMake} {quotation.vehicleModel}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {quotation.vehicleVersion} {quotation.vehicleYear ?? ''}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {formatClp(quotation.finalPrice)}
                    </td>
                    <td className="px-5 py-4">
                      <QuotationStatusBadge status={quotation.status} />
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {quotation.validUntil}
                    </td>
                    <td className="px-3 py-4">
                      <Actions
                        quotation={quotation}
                        canEdit={canEdit}
                        busy={busyId === quotation.id}
                        onDuplicate={duplicate}
                        onGenerate={generate}
                        onCopy={copyLink}
                        onDelete={remove}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-border divide-y md:hidden">
            {filtered.map((quotation) => (
              <div key={quotation.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/quotes/${quotation.id}`}
                      className="text-primary font-semibold"
                    >
                      {quotation.quoteNumber}
                    </Link>
                    <h3 className="mt-2 font-semibold">
                      {quotation.clientName}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {quotation.vehicleMake} {quotation.vehicleModel}
                    </p>
                  </div>
                  <Actions
                    quotation={quotation}
                    canEdit={canEdit}
                    busy={busyId === quotation.id}
                    onDuplicate={duplicate}
                    onGenerate={generate}
                    onCopy={copyLink}
                    onDelete={remove}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <QuotationStatusBadge status={quotation.status} />
                  <strong>{formatClp(quotation.finalPrice)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {initialTotal > pageSize && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {initialPage} de {Math.ceil(initialTotal / pageSize)}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={initialPage <= 1}
              onClick={() =>
                router.push(pageHref(initialPage - 1, query, status, contactId))
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={initialPage * pageSize >= initialTotal}
              onClick={() =>
                router.push(pageHref(initialPage + 1, query, status, contactId))
              }
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function pageHref(
  page: number,
  query: string,
  status: QuotationStatus | 'all',
  contactId?: string
): string {
  const params = new URLSearchParams({ page: String(page) });
  if (query.trim()) params.set('q', query.trim());
  if (status !== 'all') params.set('status', status);
  if (contactId) params.set('contactId', contactId);
  return `/quotes?${params.toString()}`;
}

function Actions({
  quotation,
  canEdit,
  busy,
  onDuplicate,
  onGenerate,
  onCopy,
  onDelete,
}: {
  quotation: QuotationRecord;
  canEdit: boolean;
  busy: boolean;
  onDuplicate: (id: string) => void;
  onGenerate: (id: string) => void;
  onCopy: (id: string) => void;
  onDelete: (quotation: QuotationRecord) => void;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        aria-label="Acciones"
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => router.push(`/quotes/${quotation.id}`)}
        >
          <Eye className="size-4" />
          Ver detalle
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuItem
              onClick={() => router.push(`/quotes/${quotation.id}/edit`)}
            >
              <Pencil className="size-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onGenerate(quotation.id)}>
              <FileDown className="size-4" />
              Generar nueva versión
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(quotation.id)}>
              <Copy className="size-4" />
              Duplicar
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => onCopy(quotation.id)}>
          <Copy className="size-4" />
          Copiar enlace interno
        </DropdownMenuItem>
        {quotation.currentVersion > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                // A document download intentionally uses browser navigation.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign(
                  `/api/quotes/${quotation.id}/artifact?format=pdf`
                );
              }}
            >
              <Download className="size-4" />
              Descargar PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // A document download intentionally uses browser navigation.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign(
                  `/api/quotes/${quotation.id}/artifact?format=png`
                );
              }}
            >
              <Download className="size-4" />
              Descargar PNG
            </DropdownMenuItem>
          </>
        )}
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(quotation)}
              className="text-red-500"
            >
              <Trash2 className="size-4" />
              Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
