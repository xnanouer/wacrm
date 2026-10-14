'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Copy,
  Filter,
  FolderUp,
  Grid2X2,
  List,
  Loader2,
  MapPin,
  MoreHorizontal,
  PackagePlus,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { CatalogVehicleVisual } from '@/components/catalog/catalog-vehicle-visual';
import { CatalogImportDialog } from '@/components/catalog/catalog-import-dialog';
import { CatalogPhotoFolderDialog } from '@/components/catalog/catalog-photo-folder-dialog';
import { CatalogSendDialog } from '@/components/catalog/catalog-send-dialog';
import { VehicleFormDialog } from '@/components/catalog/vehicle-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CATALOG_ADDON,
  CATALOG_STATUSES,
  CATALOG_STATUS_META,
  catalogStatusConsumesQuota,
  formatCatalogClp,
  type CatalogStatus,
} from '@/lib/catalog/config';
import type {
  CatalogUsage,
  CatalogVehicle,
  CatalogVehicleInput,
} from '@/lib/catalog/types';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/use-can';

type ViewMode = 'grid' | 'table';
type StatusFilter = 'all' | CatalogStatus;

const statusFilterLabels: Record<StatusFilter, string> = {
  all: 'Todos',
  ...Object.fromEntries(
    CATALOG_STATUSES.map((status) => [
      status,
      CATALOG_STATUS_META[status].label,
    ])
  ),
} as Record<StatusFilter, string>;

interface CatalogViewProps {
  initialVehicles: CatalogVehicle[];
  initialUsage: CatalogUsage;
  initialSelectedId?: string;
}

type ReviewDecision = 'approved' | 'rejected';

interface ReviewRequest {
  vehicle: CatalogVehicle;
  decision: ReviewDecision;
}

function vehicleToInput(vehicle: CatalogVehicle): CatalogVehicleInput {
  return {
    internalCode: vehicle.internalCode,
    licensePlate:
      vehicle.licensePlate === 'SIN PATENTE' ? '' : vehicle.licensePlate,
    licensePlateVisible: vehicle.licensePlateVisible,
    make: vehicle.make,
    model: vehicle.model,
    version: vehicle.version,
    year: vehicle.year,
    color: vehicle.color,
    engine: vehicle.engine,
    fuel: vehicle.fuel,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    mileage: vehicle.mileage,
    listPrice: vehicle.listPrice,
    offerPrice: vehicle.offerPrice,
    minimumDownPayment: vehicle.minimumDownPayment,
    financingText: vehicle.financingText,
    description: vehicle.description,
    location: vehicle.location,
  };
}

export function CatalogView({
  initialVehicles,
  initialUsage,
  initialSelectedId,
}: CatalogViewProps) {
  const canAdminister = useCan('edit-settings');
  const canCreate = useCan('send-messages');
  const [vehicles, setVehicles] = useState<CatalogVehicle[]>(initialVehicles);
  const [usage, setUsage] = useState(initialUsage);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [make, setMake] = useState('all');
  const [location, setLocation] = useState('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [photoFolderOpen, setPhotoFolderOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<CatalogVehicle | null>(
    null
  );
  const [selectedVehicle, setSelectedVehicle] = useState<CatalogVehicle | null>(
    () =>
      initialVehicles.find((vehicle) => vehicle.id === initialSelectedId) ??
      null
  );
  const [vehicleToSend, setVehicleToSend] = useState<CatalogVehicle | null>(
    null
  );
  const [submittingVehicleId, setSubmittingVehicleId] = useState<string | null>(
    null
  );
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(
    null
  );
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(
    null
  );
  const [reviewReason, setReviewReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const inventoryRef = useRef<HTMLElement>(null);
  const submittingVehiclesRef = useRef(new Set<string>());
  const deletingVehiclesRef = useRef(new Set<string>());

  const makes = useMemo(
    () => [...new Set(vehicles.map((vehicle) => vehicle.make))].sort(),
    [vehicles]
  );
  const locations = useMemo(
    () => [...new Set(vehicles.map((vehicle) => vehicle.location))].sort(),
    [vehicles]
  );
  const pendingVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === 'pending_approval'),
    [vehicles]
  );

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return vehicles.filter((vehicle) => {
      const matchesSearch =
        !term ||
        [
          vehicle.make,
          vehicle.model,
          vehicle.version,
          vehicle.internalCode,
          vehicle.licensePlate,
          String(vehicle.year),
        ].some((value) => value.toLocaleLowerCase('es').includes(term));
      return (
        matchesSearch &&
        (status === 'all' || vehicle.status === status) &&
        (make === 'all' || vehicle.make === make) &&
        (location === 'all' || vehicle.location === location)
      );
    });
  }, [location, make, search, status, vehicles]);

  const usagePercent =
    usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : 0;
  const remaining = Math.max(0, usage.remaining);

  const refreshCatalog = useCallback(async () => {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as {
      vehicles?: CatalogVehicle[];
      usage?: CatalogUsage;
      error?: string;
    } | null;
    if (!response.ok || !payload?.vehicles || !payload.usage) {
      throw new Error(
        payload?.error ?? 'No fue posible actualizar el catálogo.'
      );
    }
    setVehicles(payload.vehicles);
    setUsage(payload.usage);
    setStatus('all');
    setSearch('');
  }, []);

  async function handleDuplicate(vehicle: CatalogVehicle) {
    const copyNumber =
      vehicles.filter((candidate) =>
        candidate.internalCode.startsWith(`${vehicle.internalCode}-COPIA-`)
      ).length + 1;
    const input = {
      ...vehicleToInput(vehicle),
      internalCode: `${vehicle.internalCode}-COPIA-${copyNumber}`,
      licensePlate: '',
      licensePlateVisible: false,
    };
    const response = await fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? 'No fue posible duplicar el vehículo.');
      return;
    }
    await refreshCatalog();
    toast.success('Copia guardada como borrador.');
  }

  async function handleArchive(vehicle: CatalogVehicle) {
    const confirmed = window.confirm(
      `¿Archivar ${vehicle.make} ${vehicle.model} ${vehicle.year}?`
    );
    if (!confirmed) return;
    const response = await fetch(`/api/catalog/${vehicle.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? 'No fue posible archivar el vehículo.');
      return;
    }
    await refreshCatalog();
    setSelectedVehicle(null);
    toast.success('Vehículo archivado.');
  }

  async function handleDelete(vehicle: CatalogVehicle) {
    if (deletingVehiclesRef.current.has(vehicle.id)) return;

    const confirmed = window.confirm(
      `¿Eliminar definitivamente ${vehicle.make} ${vehicle.model} ${vehicle.year} (${vehicle.internalCode})?\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    deletingVehiclesRef.current.add(vehicle.id);
    setDeletingVehicleId(vehicle.id);
    try {
      const response = await fetch(`/api/catalog/${vehicle.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        warning?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? 'No fue posible eliminar el vehículo.'
        );
      }

      setSelectedVehicle(null);
      setVehicles((current) =>
        current.filter((candidate) => candidate.id !== vehicle.id)
      );
      if (catalogStatusConsumesQuota(vehicle.status)) {
        setUsage((current) => {
          const used = Math.max(0, current.used - 1);
          return {
            ...current,
            used,
            remaining: Math.max(0, current.limit - used),
          };
        });
      }

      toast.success('Vehículo eliminado definitivamente.');
      if (payload?.warning) toast.warning(payload.warning);

      try {
        await refreshCatalog();
      } catch (error) {
        console.error('[catalog] deleted but refresh failed:', error);
        toast.warning(
          'El vehículo fue eliminado, pero no se pudo actualizar el inventario.',
          { description: 'Recarga la página para sincronizar los datos.' }
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible eliminar el vehículo.'
      );
    } finally {
      deletingVehiclesRef.current.delete(vehicle.id);
      setDeletingVehicleId((current) =>
        current === vehicle.id ? null : current
      );
    }
  }

  async function handleSubmitForApproval(vehicle: CatalogVehicle) {
    if (submittingVehiclesRef.current.has(vehicle.id)) return;
    submittingVehiclesRef.current.add(vehicle.id);
    setSubmittingVehicleId(vehicle.id);
    try {
      const response = await fetch(`/api/catalog/${vehicle.id}/submit`, {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        alreadySubmitted?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? 'No fue posible enviar el vehículo a aprobación.'
        );
      }

      setSelectedVehicle(null);
      toast.success(
        payload?.alreadySubmitted
          ? 'El vehículo ya estaba enviado a aprobación.'
          : 'Vehículo enviado a aprobación.'
      );
      try {
        await refreshCatalog();
      } catch (error) {
        console.error(
          '[catalog] approval submitted but refresh failed:',
          error
        );
        toast.warning(
          'La solicitud quedó enviada, pero no fue posible actualizar la lista.',
          { description: 'Recarga la página para ver su estado.' }
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible enviar el vehículo a aprobación.'
      );
    } finally {
      submittingVehiclesRef.current.delete(vehicle.id);
      setSubmittingVehicleId((current) =>
        current === vehicle.id ? null : current
      );
    }
  }

  function openReview(vehicle: CatalogVehicle, decision: ReviewDecision) {
    setSelectedVehicle(null);
    setReviewReason('');
    setReviewRequest({ vehicle, decision });
  }

  async function handleReview() {
    if (!reviewRequest || reviewing) return;
    if (reviewRequest.decision === 'rejected' && !reviewReason.trim()) {
      toast.error('Escribe el motivo del rechazo.');
      return;
    }

    setReviewing(true);
    const response = await fetch(
      `/api/catalog/${reviewRequest.vehicle.id}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: reviewRequest.decision,
          reason: reviewReason,
        }),
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setReviewing(false);

    if (!response.ok) {
      toast.error(payload?.error ?? 'No fue posible guardar la revisión.');
      return;
    }

    await refreshCatalog();
    const approved = reviewRequest.decision === 'approved';
    setReviewRequest(null);
    setReviewReason('');
    toast.success(
      approved
        ? 'Vehículo aprobado y disponible.'
        : 'Vehículo devuelto a borrador.'
    );
  }

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setMake('all');
    setLocation('all');
  }

  const hasFilters =
    search.trim().length > 0 ||
    status !== 'all' ||
    make !== 'all' ||
    location !== 'all';

  return (
    <div className="space-y-6">
      <section className="border-primary/15 relative overflow-hidden rounded-[28px] border bg-[radial-gradient(circle_at_85%_10%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_36%),linear-gradient(135deg,color-mix(in_oklab,var(--card)_96%,transparent),color-mix(in_oklab,var(--primary)_5%,var(--card)))] p-5 shadow-sm sm:p-7">
        <div className="bg-primary/10 absolute -top-20 -right-20 size-64 rounded-full blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <div className="border-primary/20 bg-primary/8 text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.16em] uppercase">
              <Sparkles className="size-3.5" />
              Catálogo de tu empresa
            </div>
            <h1 className="text-foreground mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              Tu inventario, listo para cada conversación.
            </h1>
            <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6 sm:text-base">
              Organiza unidades, prepara aprobaciones y encuentra rápidamente el
              vehículo correcto para cada cliente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!canCreate || remaining === 0}
              onClick={() => setImportOpen(true)}
            >
              <PackagePlus className="size-4" />
              {remaining === 0 ? 'Límite alcanzado' : 'Importar'}
            </Button>
            <Button
              variant="outline"
              disabled={!canCreate || vehicles.length === 0}
              onClick={() => setPhotoFolderOpen(true)}
            >
              <FolderUp className="size-4" />
              Cargar fotos
            </Button>
            <Button
              size="lg"
              className="shadow-primary/20 h-10 rounded-xl px-4 shadow-lg"
              disabled={!canCreate || remaining === 0}
              onClick={() => {
                setEditingVehicle(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              {remaining === 0 ? 'Límite alcanzado' : 'Agregar vehículo'}
            </Button>
          </div>
        </div>
      </section>

      {canAdminister && pendingVehicles.length > 0 && (
        <CatalogApprovalQueue
          vehicles={pendingVehicles}
          onOpen={setSelectedVehicle}
          onReview={openReview}
          onShowAll={() => {
            setStatus('pending_approval');
            setSearch('');
            setMake('all');
            setLocation('all');
            requestAnimationFrame(() =>
              inventoryRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            );
          }}
        />
      )}

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-border/70 bg-card relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs font-bold tracking-[0.16em] uppercase">
                  Capacidad del catálogo
                </span>
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/8 text-primary"
                >
                  Plan {usage.planName}
                </Badge>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                {usage.used}{' '}
                <span className="text-muted-foreground text-base font-medium">
                  de {usage.limit} unidades utilizadas
                </span>
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {remaining} espacios disponibles para nuevas unidades activas.
              </p>
            </div>
            <div className="border-primary/15 bg-primary/8 text-primary flex size-16 shrink-0 items-center justify-center rounded-2xl border">
              <span className="text-lg font-bold">{usagePercent}%</span>
            </div>
          </div>

          <div className="bg-muted mt-6 h-2.5 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700',
                usagePercent >= 90
                  ? 'bg-amber-500'
                  : usagePercent >= 80
                    ? 'bg-primary'
                    : 'bg-emerald-500'
              )}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              Borradores, pendientes, disponibles y reservados consumen cupo.
            </span>
            <span className="font-semibold">
              {remaining > 0 ? `${remaining} libres` : 'Límite alcanzado'}
            </span>
          </div>
        </div>

        <div className="border-border/70 bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <PackagePlus className="size-5" />
            </div>
            <Badge variant="outline">Sin cobro real</Badge>
          </div>
          <h2 className="mt-4 text-base font-bold">
            ¿Necesitas más capacidad?
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Agrega {CATALOG_ADDON.units} unidades por{' '}
            <strong className="text-foreground">
              {formatCatalogClp(CATALOG_ADDON.monthlyPrice)}/mes
            </strong>
            .
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!canAdminister}
              onClick={() =>
                toast.info('La compra estará disponible al integrar pagos')
              }
            >
              {canAdminister ? 'Agregar bloque' : 'Solo administrador'}
            </Button>
            {canAdminister && (
              <Link
                href="/plans"
                className={cn(buttonVariants({ variant: 'ghost' }), 'gap-1.5')}
              >
                Ver planes
                <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section
        ref={inventoryRef}
        className="border-border/70 bg-card scroll-mt-6 rounded-3xl border shadow-sm"
      >
        <div className="border-border/70 border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 rounded-xl pl-10"
                placeholder="Buscar por marca, modelo, patente o código"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={make}
                onChange={setMake}
                label="Marca"
                options={makes}
              />
              <FilterSelect
                value={location}
                onChange={setLocation}
                label="Ubicación"
                options={locations}
              />
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  Limpiar
                </Button>
              )}
              <div className="border-border bg-muted/40 hidden rounded-xl border p-1 md:flex">
                <ViewButton
                  active={view === 'grid'}
                  label="Tarjetas"
                  onClick={() => setView('grid')}
                >
                  <Grid2X2 className="size-4" />
                </ViewButton>
                <ViewButton
                  active={view === 'table'}
                  label="Tabla"
                  onClick={() => setView('table')}
                >
                  <List className="size-4" />
                </ViewButton>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {(['all', ...CATALOG_STATUSES] as StatusFilter[]).map(
              (filterStatus) => {
                const count =
                  filterStatus === 'all'
                    ? vehicles.length
                    : vehicles.filter(
                        (vehicle) => vehicle.status === filterStatus
                      ).length;
                return (
                  <button
                    key={filterStatus}
                    type="button"
                    onClick={() => setStatus(filterStatus)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      status === filterStatus
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {statusFilterLabels[filterStatus]}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px]',
                        status === filterStatus
                          ? 'bg-primary-foreground/15'
                          : 'bg-muted'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              <strong className="text-foreground">
                {filteredVehicles.length}
              </strong>{' '}
              {filteredVehicles.length === 1
                ? 'unidad encontrada'
                : 'unidades encontradas'}
            </p>
            <div className="text-muted-foreground hidden items-center gap-2 text-xs sm:flex">
              <SlidersHorizontal className="size-3.5" />
              Inventario actualizado
            </div>
          </div>

          {filteredVehicles.length === 0 ? (
            <EmptyCatalog hasFilters={hasFilters} onClear={clearFilters} />
          ) : view === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  canAdminister={canAdminister}
                  onOpen={() => setSelectedVehicle(vehicle)}
                  onDuplicate={() => handleDuplicate(vehicle)}
                  onArchive={() => handleArchive(vehicle)}
                  onDelete={() => handleDelete(vehicle)}
                  onReview={(decision) => openReview(vehicle, decision)}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:hidden">
                {filteredVehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    canAdminister={canAdminister}
                    onOpen={() => setSelectedVehicle(vehicle)}
                    onDuplicate={() => handleDuplicate(vehicle)}
                    onArchive={() => handleArchive(vehicle)}
                    onDelete={() => handleDelete(vehicle)}
                    onReview={(decision) => openReview(vehicle, decision)}
                  />
                ))}
              </div>
              <div className="hidden md:block">
                <VehicleTable
                  vehicles={filteredVehicles}
                  canAdminister={canAdminister}
                  onOpen={setSelectedVehicle}
                  onReview={openReview}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <VehicleFormDialog
        key={editingVehicle?.id ?? 'new-catalog-vehicle'}
        open={formOpen}
        onOpenChange={setFormOpen}
        vehicle={editingVehicle}
        onSaved={refreshCatalog}
      />
      <CatalogImportDialog
        open={importOpen}
        remaining={remaining}
        onOpenChange={setImportOpen}
        onImported={refreshCatalog}
      />
      <CatalogPhotoFolderDialog
        open={photoFolderOpen}
        vehicles={vehicles}
        canAdminister={canAdminister}
        onOpenChange={setPhotoFolderOpen}
        onUploaded={refreshCatalog}
      />
      <VehicleDetailsDialog
        vehicle={selectedVehicle}
        canAdminister={canAdminister}
        canSend={canCreate}
        submitting={submittingVehicleId === selectedVehicle?.id}
        deleting={deletingVehicleId === selectedVehicle?.id}
        onSubmit={handleSubmitForApproval}
        onDelete={handleDelete}
        onReview={openReview}
        onEdit={(vehicle) => {
          setSelectedVehicle(null);
          setEditingVehicle(vehicle);
          setFormOpen(true);
        }}
        onSend={(vehicle) => {
          setSelectedVehicle(null);
          setVehicleToSend(vehicle);
        }}
        onOpenChange={(open) => {
          if (!open) setSelectedVehicle(null);
        }}
      />
      <CatalogSendDialog
        open={Boolean(vehicleToSend)}
        vehicle={vehicleToSend}
        onOpenChange={(open) => {
          if (!open) setVehicleToSend(null);
        }}
      />
      <CatalogReviewDialog
        request={reviewRequest}
        reason={reviewReason}
        reviewing={reviewing}
        onReasonChange={setReviewReason}
        onConfirm={handleReview}
        onOpenChange={(open) => {
          if (!open && !reviewing) {
            setReviewRequest(null);
            setReviewReason('');
          }
        }}
      />
    </div>
  );
}

function CatalogApprovalQueue({
  vehicles,
  onOpen,
  onReview,
  onShowAll,
}: {
  vehicles: CatalogVehicle[];
  onOpen: (vehicle: CatalogVehicle) => void;
  onReview: (vehicle: CatalogVehicle, decision: ReviewDecision) => void;
  onShowAll: () => void;
}) {
  const visibleVehicles = vehicles.slice(0, 6);
  const remainingCount = vehicles.length - visibleVehicles.length;

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-500/25 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_98%,transparent),color-mix(in_oklab,#f59e0b_7%,var(--card)))] shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-amber-500/20 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-300">
            <ClipboardCheck className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight">
                Pendientes de aprobación
              </h2>
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                {vehicles.length}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Revisa rápidamente las unidades enviadas por tu equipo.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onShowAll}>
          Ver todas las pendientes
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
        {visibleVehicles.map((vehicle) => (
          <article
            key={vehicle.id}
            className="border-border/70 bg-background/85 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center"
          >
            <button
              type="button"
              onClick={() => onOpen(vehicle)}
              className="shrink-0 overflow-hidden rounded-xl text-left"
              aria-label={`Ver ficha de ${vehicle.make} ${vehicle.model}`}
            >
              <CatalogVehicleVisual
                compact
                tone={vehicle.photoTone}
                label={`${vehicle.make} ${vehicle.model}`}
                imageUrl={vehicle.photoUrl}
              />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-bold">
                  {vehicle.make} {vehicle.model} {vehicle.year}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full',
                    CATALOG_STATUS_META.pending_approval.className
                  )}
                >
                  Por revisar
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {vehicle.internalCode} · {vehicle.location} ·{' '}
                {vehicle.imageCount}{' '}
                {vehicle.imageCount === 1 ? 'foto' : 'fotos'}
              </p>
              <p className="mt-2 text-sm font-bold">
                {formatCatalogClp(vehicle.offerPrice ?? vehicle.listPrice)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Enviado por {vehicle.createdBy}
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-44">
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onReview(vehicle, 'rejected')}
              >
                <XCircle className="size-4" />
                Rechazar
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => onReview(vehicle, 'approved')}
              >
                <CheckCircle2 className="size-4" />
                Aprobar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="col-span-2"
                onClick={() => onOpen(vehicle)}
              >
                Ver ficha completa
              </Button>
            </div>
          </article>
        ))}
      </div>

      {remainingCount > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="text-muted-foreground hover:text-foreground w-full border-t border-amber-500/15 px-5 py-3 text-center text-xs font-semibold transition-colors"
        >
          Hay {remainingCount} solicitudes adicionales. Ver inventario
          pendiente.
        </button>
      )}
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-background text-foreground focus:border-ring focus:ring-ring/50 h-10 min-w-32 appearance-none rounded-xl border pr-9 pl-3 text-sm outline-none focus:ring-3"
      >
        <option value="all">Todas: {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Filter className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2" />
    </label>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function VehicleCard({
  vehicle,
  canAdminister,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
  onReview,
}: {
  vehicle: CatalogVehicle;
  canAdminister: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReview: (decision: ReviewDecision) => void;
}) {
  const price = vehicle.offerPrice ?? vehicle.listPrice;
  const statusMeta = CATALOG_STATUS_META[vehicle.status];

  return (
    <article className="border-border/70 bg-background group overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <CatalogVehicleVisual
          tone={vehicle.photoTone}
          label={`${vehicle.make} ${vehicle.model}`}
          imageUrl={vehicle.photoUrl}
        />
      </button>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.15em] uppercase">
              {vehicle.internalCode}
            </p>
            <button
              type="button"
              onClick={onOpen}
              className="mt-1 block max-w-full text-left"
            >
              <h3 className="truncate text-base font-bold tracking-tight">
                {vehicle.make} {vehicle.model}{' '}
                <span className="text-muted-foreground font-medium">
                  {vehicle.year}
                </span>
              </h3>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {vehicle.version}
              </p>
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones de ${vehicle.make} ${vehicle.model}`}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>Ver ficha</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="size-4" />
                Duplicar como borrador
              </DropdownMenuItem>
              {canAdminister && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="size-4" />
                    Archivar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="size-4" />
                    Eliminar definitivamente
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className={cn('rounded-full', statusMeta.className)}
          >
            {statusMeta.label}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {vehicle.fuel}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {vehicle.transmission}
          </Badge>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-[10px] font-semibold uppercase">
              Precio
            </p>
            <p className="mt-0.5 text-lg font-bold tracking-tight">
              {formatCatalogClp(price)}
            </p>
            {vehicle.offerPrice && (
              <p className="text-muted-foreground text-[10px] line-through">
                {formatCatalogClp(vehicle.listPrice)}
              </p>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <MapPin className="size-3.5" />
            {vehicle.location}
          </div>
        </div>
      </div>
      <div className="border-border/70 bg-muted/20 flex items-center justify-between gap-2 border-t px-4 py-3">
        {vehicle.status === 'pending_approval' && canAdminister ? (
          <>
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">
              Requiere tu decisión
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onReview('rejected')}
              >
                <XCircle className="size-3.5" />
                Rechazar
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => onReview('approved')}
              >
                <CheckCircle2 className="size-3.5" />
                Aprobar
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-muted-foreground text-xs">
              {catalogStatusConsumesQuota(vehicle.status)
                ? 'Consume cupo'
                : 'No consume cupo'}
            </span>
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Ver detalles
              <ChevronRight className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function VehicleTable({
  vehicles,
  canAdminister,
  onOpen,
  onReview,
}: {
  vehicles: CatalogVehicle[];
  canAdminister: boolean;
  onOpen: (vehicle: CatalogVehicle) => void;
  onReview: (vehicle: CatalogVehicle, decision: ReviewDecision) => void;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
        <thead className="bg-muted/45 text-muted-foreground text-xs">
          <tr>
            <th className="px-4 py-3 font-semibold">Vehículo</th>
            <th className="px-4 py-3 font-semibold">Código</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 font-semibold">Kilometraje</th>
            <th className="px-4 py-3 font-semibold">Ubicación</th>
            <th className="px-4 py-3 font-semibold">Precio</th>
            <th className="w-56 px-4 py-3 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {vehicles.map((vehicle) => {
            const statusMeta = CATALOG_STATUS_META[vehicle.status];
            return (
              <tr key={vehicle.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CatalogVehicleVisual
                      compact
                      tone={vehicle.photoTone}
                      label={`${vehicle.make} ${vehicle.model}`}
                      imageUrl={vehicle.photoUrl}
                    />
                    <div>
                      <p className="font-semibold">
                        {vehicle.make} {vehicle.model} {vehicle.year}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {vehicle.version}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                  {vehicle.internalCode}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn('rounded-full', statusMeta.className)}
                  >
                    {statusMeta.label}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {vehicle.mileage.toLocaleString('es-CL')} km
                </td>
                <td className="px-4 py-3">{vehicle.location}</td>
                <td className="px-4 py-3 font-semibold">
                  {formatCatalogClp(vehicle.offerPrice ?? vehicle.listPrice)}
                </td>
                <td className="px-4 py-3">
                  {vehicle.status === 'pending_approval' && canAdminister ? (
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onReview(vehicle, 'rejected')}
                      >
                        <XCircle className="size-3.5" />
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => onReview(vehicle, 'approved')}
                      >
                        <CheckCircle2 className="size-3.5" />
                        Aprobar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpen(vehicle)}
                    >
                      Ver ficha
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyCatalog({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="border-border/70 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
        {hasFilters ? (
          <Search className="size-6" />
        ) : (
          <CarFront className="size-6" />
        )}
      </div>
      <h3 className="mt-4 text-base font-bold">
        {hasFilters
          ? 'No encontramos vehículos con estos filtros.'
          : 'Tu catálogo todavía está vacío.'}
      </h3>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        {hasFilters
          ? 'Prueba una búsqueda diferente o limpia los filtros seleccionados.'
          : 'Agrega tu primera unidad para comenzar a compartir vehículos con tus clientes.'}
      </p>
      {hasFilters && (
        <Button variant="outline" className="mt-5" onClick={onClear}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function VehicleDetailsDialog({
  vehicle,
  canAdminister,
  canSend,
  submitting,
  deleting,
  onSubmit,
  onDelete,
  onReview,
  onEdit,
  onSend,
  onOpenChange,
}: {
  vehicle: CatalogVehicle | null;
  canAdminister: boolean;
  canSend: boolean;
  submitting: boolean;
  deleting: boolean;
  onSubmit: (vehicle: CatalogVehicle) => void;
  onDelete: (vehicle: CatalogVehicle) => void;
  onReview: (vehicle: CatalogVehicle, decision: ReviewDecision) => void;
  onEdit: (vehicle: CatalogVehicle) => void;
  onSend: (vehicle: CatalogVehicle) => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!vehicle) return null;
  const statusMeta = CATALOG_STATUS_META[vehicle.status];
  const price = vehicle.offerPrice ?? vehicle.listPrice;
  const canSubmit =
    vehicle.status === 'draft' &&
    (canAdminister || vehicle.createdByCurrentUser);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="block max-h-[92vh] overflow-y-auto p-0 sm:max-w-3xl">
        <VehiclePhotoGallery key={vehicle.id} vehicle={vehicle} />
        <div className="px-5 pb-6 sm:px-7">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn('rounded-full', statusMeta.className)}
              >
                {statusMeta.label}
              </Badge>
              <Badge variant="outline">{vehicle.internalCode}</Badge>
            </div>
            <DialogTitle className="mt-3 text-2xl">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </DialogTitle>
            <DialogDescription>{vehicle.version}</DialogDescription>
          </DialogHeader>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailStat label="Motor" value={vehicle.engine} />
            <DetailStat label="Combustible" value={vehicle.fuel} />
            <DetailStat label="Transmisión" value={vehicle.transmission} />
            <DetailStat label="Tracción" value={vehicle.drivetrain} />
            <DetailStat
              label="Kilometraje"
              value={`${vehicle.mileage.toLocaleString('es-CL')} km`}
            />
            <DetailStat label="Color" value={vehicle.color} />
            <DetailStat label="Ubicación" value={vehicle.location} />
            <DetailStat
              label="Patente al cliente"
              value={
                vehicle.licensePlateVisible ? vehicle.licensePlate : 'Oculta'
              }
            />
          </div>

          <div className="border-border/70 bg-muted/25 mt-5 grid gap-4 rounded-2xl border p-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs font-semibold">
                Precio publicado
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatCatalogClp(price)}
              </p>
              {vehicle.offerPrice && (
                <p className="text-muted-foreground text-xs line-through">
                  Lista: {formatCatalogClp(vehicle.listPrice)}
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-semibold">
                Pie mínimo
              </p>
              <p className="mt-1 text-lg font-bold">
                {vehicle.minimumDownPayment
                  ? formatCatalogClp(vehicle.minimumDownPayment)
                  : 'Por consultar'}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {vehicle.financingText || 'Sin texto de financiamiento'}
              </p>
            </div>
          </div>

          <p className="text-muted-foreground mt-5 text-sm leading-6">
            {vehicle.description || 'Sin descripción comercial.'}
          </p>

          {vehicle.status === 'draft' && vehicle.imageCount === 0 && (
            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              Agrega una fotografía principal para poder enviar esta unidad a
              aprobación.
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Clock3 className="size-3.5" />
              Actualizado por {vehicle.createdBy} · {vehicle.imageCount}{' '}
              {vehicle.imageCount === 1 ? 'foto' : 'fotos'}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canAdminister && (
                <Button
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => onDelete(vehicle)}
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Eliminar
                </Button>
              )}
              <Button
                variant="outline"
                disabled={
                  deleting ||
                  (!canAdminister &&
                    !(
                      vehicle.status === 'draft' && vehicle.createdByCurrentUser
                    ))
                }
                onClick={() => onEdit(vehicle)}
              >
                Editar
              </Button>
              {canSubmit && (
                <Button
                  disabled={deleting || submitting || vehicle.imageCount === 0}
                  title={
                    vehicle.imageCount === 0
                      ? 'Primero agrega una fotografía principal'
                      : undefined
                  }
                  onClick={() => onSubmit(vehicle)}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Enviar a aprobación
                </Button>
              )}
              {vehicle.status === 'pending_approval' && canAdminister && (
                <>
                  <Button
                    variant="outline"
                    disabled={deleting}
                    onClick={() => onReview(vehicle, 'rejected')}
                  >
                    <XCircle className="size-4" />
                    Rechazar
                  </Button>
                  <Button
                    disabled={deleting}
                    onClick={() => onReview(vehicle, 'approved')}
                  >
                    <CheckCircle2 className="size-4" />
                    Aprobar
                  </Button>
                </>
              )}
              {vehicle.status === 'available' && canSend && (
                <Button disabled={deleting} onClick={() => onSend(vehicle)}>
                  <Send className="size-4" />
                  Enviar a cliente
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VehiclePhotoGallery({ vehicle }: { vehicle: CatalogVehicle }) {
  const photos = (vehicle.images ?? [])
    .filter(
      (image): image is typeof image & { url: string } =>
        typeof image.url === 'string' && image.url.length > 0
    )
    .map((image) => ({
      id: image.id,
      url: image.url,
      isPrimary: image.isPrimary,
    }));

  if (photos.length === 0 && vehicle.photoUrl) {
    photos.push({
      id: 'primary-fallback',
      url: vehicle.photoUrl,
      isPrimary: true,
    });
  }

  const [activeIndex, setActiveIndex] = useState(0);
  const activePhoto = photos[activeIndex] ?? null;
  const hasMultiplePhotos = photos.length > 1;
  const badgeLabel = activePhoto
    ? `${activeIndex + 1} de ${photos.length}${activePhoto.isPrimary ? ' · Principal' : ''}`
    : undefined;

  return (
    <div className="relative overflow-hidden rounded-t-2xl sm:rounded-t-3xl">
      <CatalogVehicleVisual
        tone={vehicle.photoTone}
        label={`${vehicle.make} ${vehicle.model}`}
        imageUrl={activePhoto?.url ?? vehicle.photoUrl}
        badgeLabel={badgeLabel}
      />

      {hasMultiplePhotos && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="bg-background/88 hover:bg-background absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full shadow-lg backdrop-blur"
            aria-label="Ver fotografía anterior"
            onClick={() =>
              setActiveIndex(
                (current) => (current - 1 + photos.length) % photos.length
              )
            }
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="bg-background/88 hover:bg-background absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full shadow-lg backdrop-blur"
            aria-label="Ver fotografía siguiente"
            onClick={() =>
              setActiveIndex((current) => (current + 1) % photos.length)
            }
          >
            <ChevronRight className="size-5" />
          </Button>
        </>
      )}
    </div>
  );
}

function CatalogReviewDialog({
  request,
  reason,
  reviewing,
  onReasonChange,
  onConfirm,
  onOpenChange,
}: {
  request: ReviewRequest | null;
  reason: string;
  reviewing: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  if (!request) return null;

  const rejecting = request.decision === 'rejected';
  const vehicle = request.vehicle;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div
            className={cn(
              'mb-2 flex size-12 items-center justify-center rounded-2xl',
              rejecting
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-600'
            )}
          >
            {rejecting ? (
              <XCircle className="size-6" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
          </div>
          <DialogTitle className="text-xl">
            {rejecting ? 'Rechazar vehículo' : 'Aprobar vehículo'}
          </DialogTitle>
          <DialogDescription>
            {vehicle.make} {vehicle.model} {vehicle.year} ·{' '}
            {vehicle.internalCode}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/70 bg-muted/25 rounded-2xl border p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <DetailStat label="Ubicación" value={vehicle.location} />
            <DetailStat
              label="Precio"
              value={formatCatalogClp(vehicle.offerPrice ?? vehicle.listPrice)}
            />
            <DetailStat
              label="Fotografías"
              value={String(vehicle.imageCount)}
            />
          </div>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-semibold">
            {rejecting ? 'Motivo del rechazo' : 'Comentario interno (opcional)'}
          </span>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            maxLength={3000}
            rows={6}
            className="min-h-32 resize-y"
            placeholder={
              rejecting
                ? 'Explica claramente qué debe corregirse antes de volver a enviarlo.'
                : 'Puedes dejar una observación para el equipo.'
            }
            disabled={reviewing}
          />
          <span className="text-muted-foreground block text-right text-xs">
            {reason.length} / 3.000
          </span>
        </label>

        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            rejecting
              ? 'border-destructive/20 bg-destructive/5 text-destructive'
              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          )}
        >
          {rejecting
            ? 'La unidad volverá a borrador y su creador recibirá una notificación.'
            : 'La unidad quedará disponible para que el equipo pueda utilizarla.'}
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reviewing}
          >
            Cancelar
          </Button>
          <Button
            variant={rejecting ? 'destructive' : 'default'}
            disabled={reviewing || (rejecting && !reason.trim())}
            onClick={onConfirm}
          >
            {reviewing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : rejecting ? (
              <XCircle className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {rejecting ? 'Confirmar rechazo' : 'Confirmar aprobación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/70 bg-muted/20 min-w-0 rounded-xl border px-3.5 py-3">
      <p className="text-muted-foreground text-[11px] leading-4 font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm leading-5 font-semibold break-words">
        {value || 'Sin informar'}
      </p>
    </div>
  );
}
