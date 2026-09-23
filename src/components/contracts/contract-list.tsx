'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CarFront,
  HandCoins,
  FileCheck2,
  FilePlus2,
  FileSignature,
  Loader2,
  KeyRound,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMinRole } from '@/lib/auth/roles';
import {
  CONTRACT_STATUS_LABELS,
  PAYMENT_COMMITMENT_TEMPLATE,
  VEHICLE_CONSIGNMENT_TEMPLATE,
  VEHICLE_LEGAL_TEMPLATES,
  VEHICLE_TRANSACTION_TEMPLATES,
  type ContractCreatorOption,
  type ContractRecord,
} from '@/lib/contracts/types';
import { cn } from '@/lib/utils';

const TRANSACTION_ICONS = [
  FileSignature,
  UserRound,
  CarFront,
  FileCheck2,
  HandCoins,
  FilePlus2,
];

const CONTRACT_TEMPLATES = [
  {
    ...VEHICLE_CONSIGNMENT_TEMPLATE,
    shortName: 'Consignación',
    icon: CarFront,
  },
  {
    ...PAYMENT_COMMITMENT_TEMPLATE,
    shortName: 'Compromiso de pago',
    icon: HandCoins,
  },
  ...VEHICLE_TRANSACTION_TEMPLATES.map((template, index) => ({
    ...template,
    icon: TRANSACTION_ICONS[index],
  })),
  { ...VEHICLE_LEGAL_TEMPLATES[0], icon: KeyRound },
  { ...VEHICLE_LEGAL_TEMPLATES[1], icon: ShieldAlert },
];

function templateLabel(templateKey: ContractRecord['templateKey']): string {
  return (
    CONTRACT_TEMPLATES.find((template) => template.key === templateKey)
      ?.shortName ?? 'Contrato'
  );
}

function date(value: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(
    new Date(value)
  );
}

export function ContractList({
  contracts,
  total,
  creators,
  currentUserId,
  currentRole,
  filters,
}: {
  contracts: ContractRecord[];
  total: number;
  creators: ContractCreatorOption[];
  currentUserId: string;
  currentRole: AccountRole;
  filters: { query: string; status: string; creator: string };
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasFilters = Boolean(
    filters.query || filters.status || filters.creator
  );

  async function deleteContract(contract: ContractRecord) {
    const confirmed = window.confirm(
      `¿Eliminar ${contract.contractNumber}?\n\nSe borrarán el contrato, su historial y todos sus PDF. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    setDeletingId(contract.id);
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || 'No se pudo eliminar el contrato.');
      toast.success(`${contract.contractNumber} fue eliminado.`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo eliminar.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="nexora-page-stack">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nexora-kicker">Documentos comerciales</p>
          <h1 className="nexora-title mt-2">Contratos</h1>
          <p className="nexora-description mt-3">
            Cada agente puede crear y administrar sus contratos. Los
            administradores conservan la visión completa de la empresa.
          </p>
        </div>
        <Link href="/contracts/new" className={buttonVariants()}>
          <Plus className="size-4" /> Nuevo contrato
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {CONTRACT_TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <article
              key={template.key}
              className="border-primary/20 from-primary/8 via-card to-card rounded-3xl border bg-gradient-to-br p-5 shadow-sm sm:p-7"
            >
              <div className="flex items-start gap-4">
                <span className="bg-primary text-primary-foreground shadow-primary/20 flex size-13 shrink-0 items-center justify-center rounded-2xl shadow-lg">
                  <Icon className="size-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{template.name}</h2>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-300">
                      Disponible
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {template.description}
                  </p>
                  <Link
                    href={`/contracts/new?template=${template.key}`}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'mt-5'
                    )}
                  >
                    Usar modelo
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Documentos de tu empresa</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {total} contrato{total === 1 ? '' : 's'} encontrado
              {total === 1 ? '' : 's'}.
            </p>
          </div>
        </div>

        <form
          className="border-border bg-card mt-5 grid gap-3 rounded-2xl border p-4 shadow-sm lg:grid-cols-[minmax(220px,1fr)_220px_190px_auto]"
          method="get"
        >
          <label className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input
              name="q"
              defaultValue={filters.query}
              placeholder="Buscar contrato, cliente o vehículo"
              className="border-input bg-background focus:border-primary h-11 w-full rounded-xl border pr-3 pl-10 text-sm outline-none"
            />
          </label>
          <label className="relative">
            <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <select
              name="creator"
              defaultValue={filters.creator}
              className="border-input bg-background focus:border-primary h-11 w-full rounded-xl border pr-3 pl-10 text-sm outline-none"
            >
              <option value="">Todos los agentes</option>
              {creators.map((creator) => (
                <option key={creator.userId} value={creator.userId}>
                  {creator.name}
                </option>
              ))}
            </select>
          </label>
          <label className="relative">
            <SlidersHorizontal className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <select
              name="status"
              defaultValue={filters.status}
              className="border-input bg-background focus:border-primary h-11 w-full rounded-xl border pr-3 pl-10 text-sm outline-none"
            >
              <option value="">Todos los estados</option>
              {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Filtrar
            </Button>
            {hasFilters ? (
              <Link
                href="/contracts"
                className={buttonVariants({ variant: 'outline' })}
              >
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>

        {contracts.length === 0 ? (
          <div className="border-border bg-card mt-5 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center">
            <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
              <FilePlus2 className="size-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">
              {hasFilters ? 'No hay resultados' : 'Aún no hay contratos'}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              {hasFilters
                ? 'Prueba cambiando o limpiando los filtros.'
                : 'Crea el primer anexo de consignación y Nexora completará los datos disponibles.'}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {contracts.map((contract) => {
              const canDelete =
                hasMinRole(currentRole, 'admin') ||
                contract.createdByUserId === currentUserId;
              return (
                <article
                  key={contract.id}
                  className="border-border bg-card hover:border-primary/35 group grid gap-4 rounded-2xl border p-4 shadow-sm transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                    {contract.status === 'generated' ||
                    contract.status === 'signed' ? (
                      <FileCheck2 className="size-5" />
                    ) : (
                      <FileSignature className="size-5" />
                    )}
                  </span>
                  <Link href={`/contracts/${contract.id}`} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{contract.contractNumber}</strong>
                      <span className="text-primary text-xs font-semibold">
                        {templateLabel(contract.templateKey)}
                      </span>
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                        {CONTRACT_STATUS_LABELS[contract.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm">
                      {contract.consignorName}
                    </p>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {contract.vehicleLabel}
                    </p>
                    <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
                      <UserRound className="size-3.5" /> Creado por{' '}
                      {contract.createdByName}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      Ver contrato
                    </Link>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        aria-label={`Eliminar ${contract.contractNumber}`}
                        title="Eliminar contrato"
                        disabled={deletingId === contract.id}
                        onClick={() => void deleteContract(contract)}
                      >
                        {deletingId === contract.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    ) : null}
                    <span className="text-muted-foreground hidden text-xs xl:block">
                      {date(contract.updatedAt)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
