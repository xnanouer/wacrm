'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileCheck2,
  FileDown,
  History,
  Loader2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContractDocument } from './contract-document';
import { Button, buttonVariants } from '@/components/ui/button';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';
import type {
  ContractEvent,
  ContractRecord,
  ContractVersion,
  ContractDocumentData,
} from '@/lib/contracts/types';

function date(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ContractDetail({
  contract: initialContract,
  versions: initialVersions,
  events,
  preview,
  currentUserId,
  currentRole,
}: {
  contract: ContractRecord;
  versions: ContractVersion[];
  events: ContractEvent[];
  preview: ContractDocumentData;
  currentUserId: string;
  currentRole: AccountRole;
}) {
  const router = useRouter();
  const [contract, setContract] = useState(initialContract);
  const [versions, setVersions] = useState(initialVersions);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function generate() {
    setGenerating(true);
    toast.info('Generando PDF del contrato…');
    try {
      const response = await fetch(`/api/contracts/${contract.id}/generate`, {
        method: 'POST',
      });
      const payload = (await response.json()) as {
        error?: string;
        version?: number;
        pdfUrl?: string;
      };
      if (!response.ok || !payload.version)
        throw new Error(payload.error || 'No se pudo generar el PDF.');
      setContract((current) => ({
        ...current,
        status: current.status === 'draft' ? 'generated' : current.status,
        currentVersion: payload.version!,
      }));
      setVersions((current) => [
        {
          id: `generated-${payload.version}`,
          contractId: contract.id,
          versionNumber: payload.version!,
          snapshot: preview,
          generationStatus: 'ready',
          generationError: null,
          pdfStoragePath: payload.pdfUrl ?? null,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      toast.success(`Versión ${payload.version} lista para descargar.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo generar.'
      );
    } finally {
      setGenerating(false);
    }
  }

  const latest = versions.find(
    (version) => version.generationStatus === 'ready'
  );
  const canDelete =
    hasMinRole(currentRole, 'admin') ||
    contract.createdByUserId === currentUserId;

  async function deleteContract() {
    if (
      !window.confirm(
        `¿Eliminar ${contract.contractNumber}?\n\nSe borrarán el contrato, su historial y todos sus PDF. Esta acción no se puede deshacer.`
      )
    )
      return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || 'No se pudo eliminar el contrato.');
      toast.success(`${contract.contractNumber} fue eliminado.`);
      router.push('/contracts');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo eliminar.'
      );
      setDeleting(false);
    }
  }

  return (
    <div className="nexora-page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/contracts"
            className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" /> Contratos
          </Link>
          <p className="nexora-kicker">{contract.contractNumber}</p>
          <h1 className="nexora-title mt-2">{contract.consignorName}</h1>
          <p className="nexora-description mt-2">{contract.vehicleLabel}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-700 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <div>
          <strong>Revisión recomendada antes de firmar.</strong>
          <p className="mt-1 text-xs leading-5 opacity-85">
            Verifica RUT, dirección, VIN, número de motor, valor y condiciones.
            El PDF conserva una copia exacta de estos datos.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
        <div className="border-border bg-muted/30 overflow-auto rounded-3xl border p-4 shadow-inner sm:p-7">
          <div className="border-border bg-card mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-sm sm:px-4">
            <div>
              <p className="text-sm font-semibold">Documento del contrato</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Genera el PDF desde esta vista previa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void deleteContract()}
                  disabled={deleting || generating}
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </Button>
              ) : null}
              {latest ? (
                <a
                  href={`/api/contracts/${contract.id}/artifact?version=${latest.versionNumber}`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Download className="size-4" /> Descargar PDF
                </a>
              ) : null}
              <Button onClick={() => void generate()} disabled={generating}>
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
                {latest ? 'Generar nueva versión' : 'Generar PDF'}
              </Button>
            </div>
          </div>
          <div className="mx-auto w-fit overflow-hidden rounded-md shadow-2xl">
            <ContractDocument data={preview} />
          </div>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-6">
          <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileCheck2 className="text-primary size-5" />
              <h2 className="font-semibold">Versiones</h2>
            </div>
            {versions.length ? (
              <div className="mt-4 space-y-3">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="border-border rounded-xl border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong>Versión {version.versionNumber}</strong>
                      <span className="text-xs font-semibold text-emerald-600">
                        {version.generationStatus === 'ready'
                          ? 'Lista'
                          : version.generationStatus}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {date(version.createdAt)}
                    </p>
                    {version.generationStatus === 'ready' ? (
                      <a
                        className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-semibold"
                        href={`/api/contracts/${contract.id}/artifact?version=${version.versionNumber}`}
                      >
                        <Download className="size-3" /> Descargar
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                Aún no se ha generado un PDF.
              </p>
            )}
          </section>

          <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="text-primary size-5" />
              <h2 className="font-semibold">Historial</h2>
            </div>
            <div className="mt-4 space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border-border relative border-l pl-4 text-sm"
                >
                  <span className="bg-primary absolute top-1 -left-1 size-2 rounded-full" />
                  <strong className="capitalize">
                    {event.eventType === 'created'
                      ? 'Contrato creado'
                      : event.eventType}
                  </strong>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {date(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
