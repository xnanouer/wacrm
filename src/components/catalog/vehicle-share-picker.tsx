'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CarFront,
  Check,
  GripVertical,
  ImageIcon,
  Info,
  Loader2,
  MapPin,
  Search,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { CatalogVehicleVisual } from '@/components/catalog/catalog-vehicle-visual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  CATALOG_SHARE_MAX_ITEMS,
  formatCatalogClp,
} from '@/lib/catalog/config';
import type { CatalogVehicle } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

interface VehicleSharePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelMode: 'whatsapp' | 'social';
  conversationId: string;
}

export function VehicleSharePicker({
  open,
  onOpenChange,
  channelMode,
  conversationId,
}: VehicleSharePickerProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<CatalogVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [intro, setIntro] = useState(
    'Encontré estas opciones que podrían interesarte:'
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void fetch('/api/catalog', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          vehicles?: CatalogVehicle[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error || 'No fue posible cargar el catálogo.'
          );
        }
        setVehicles(Array.isArray(payload?.vehicles) ? payload.vehicles : []);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'No fue posible cargar el catálogo.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  const availableVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        if (vehicle.status !== 'available') return false;
        const term = search.trim().toLocaleLowerCase('es');
        return (
          !term ||
          [
            vehicle.make,
            vehicle.model,
            vehicle.version,
            String(vehicle.year),
            vehicle.location,
          ].some((value) => value.toLocaleLowerCase('es').includes(term))
        );
      }),
    [search, vehicles]
  );

  const selectedVehicles = selectedIds
    .map((id) => vehicles.find((vehicle) => vehicle.id === id))
    .filter((vehicle): vehicle is CatalogVehicle => Boolean(vehicle));

  function toggleVehicle(vehicleId: string) {
    setSelectedIds((current) => {
      if (current.includes(vehicleId)) {
        return current.filter((id) => id !== vehicleId);
      }
      if (current.length >= CATALOG_SHARE_MAX_ITEMS) return current;
      return [...current, vehicleId];
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setStep('select');
      setSearch('');
      setSelectedIds([]);
      setIntro('Encontré estas opciones que podrían interesarte:');
      setLoadError(null);
    }
  }

  async function handleSend() {
    if (
      sending ||
      channelMode !== 'whatsapp' ||
      selectedIds.length === 0 ||
      !intro.trim()
    ) {
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/catalog/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          itemIds: selectedIds,
          introductionText: intro.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        sent?: number;
        failed?: number;
        imagesSent?: number;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'No fue posible enviar el catálogo.');
      }

      const sent = payload?.sent ?? selectedIds.length;
      const imagesSent = payload?.imagesSent ?? 0;
      toast.success(
        `${sent} ${sent === 1 ? 'vehículo enviado' : 'vehículos enviados'} · ${imagesSent} ${imagesSent === 1 ? 'foto' : 'fotos'}.`
      );
      handleOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible enviar el catálogo.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] min-h-[70vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-border/70 border-b px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3 pr-10">
            {step === 'preview' ? (
              <button
                type="button"
                onClick={() => setStep('select')}
                className="border-border bg-muted/40 hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors"
                aria-label="Volver a seleccionar vehículos"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : (
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                <CarFront className="size-5" />
              </div>
            )}
            <div>
              <DialogTitle className="text-lg">
                {step === 'select'
                  ? 'Enviar vehículos'
                  : 'Vista previa del envío'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {step === 'select'
                  ? `Selecciona hasta ${CATALOG_SHARE_MAX_ITEMS} unidades disponibles.`
                  : 'Revisa el orden, los precios y el texto antes de enviar.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === 'select' ? (
          <>
            <div className="border-border/70 border-b p-4 sm:px-6">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 rounded-xl pl-10"
                  placeholder="Buscar por marca, modelo, año o ubicación"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Solo se muestran vehículos disponibles para enviar.
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    'rounded-full',
                    selectedIds.length > 0 &&
                      'border-primary/25 bg-primary/8 text-primary'
                  )}
                >
                  {selectedIds.length} de {CATALOG_SHARE_MAX_ITEMS}{' '}
                  seleccionados
                </Badge>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {loading ? (
                <div className="border-border flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
                  <Loader2 className="text-primary size-7 animate-spin" />
                  <p className="mt-3 text-sm font-semibold">
                    Cargando catálogo…
                  </p>
                </div>
              ) : loadError ? (
                <div className="border-destructive/30 bg-destructive/5 flex min-h-64 flex-col items-center justify-center rounded-2xl border px-6 text-center">
                  <p className="text-destructive text-sm font-semibold">
                    {loadError}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Cierra esta ventana y vuelve a intentarlo.
                  </p>
                </div>
              ) : availableVehicles.length === 0 ? (
                <div className="border-border flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
                  <CarFront className="text-muted-foreground size-8" />
                  <p className="mt-3 text-sm font-semibold">
                    No tienes unidades disponibles para enviar.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableVehicles.map((vehicle) => {
                    const selected = selectedIds.includes(vehicle.id);
                    const limitReached =
                      !selected &&
                      selectedIds.length >= CATALOG_SHARE_MAX_ITEMS;
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        disabled={limitReached}
                        onClick={() => toggleVehicle(vehicle.id)}
                        className={cn(
                          'border-border bg-background flex items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                          selected
                            ? 'border-primary bg-primary/5 ring-primary/15 ring-2'
                            : 'hover:border-primary/35 hover:bg-muted/25',
                          limitReached && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <CatalogVehicleVisual
                          compact
                          tone={vehicle.photoTone}
                          label={`${vehicle.make} ${vehicle.model}`}
                          imageUrl={vehicle.photoUrl}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {vehicle.make} {vehicle.model} {vehicle.year}
                          </span>
                          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                            {vehicle.version}
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {formatCatalogClp(
                                vehicle.offerPrice ?? vehicle.listPrice
                              )}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                              <MapPin className="size-3" />
                              {vehicle.location}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full border',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border'
                          )}
                        >
                          {selected && <Check className="size-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div
              className={cn(
                'mb-5 flex items-start gap-3 rounded-2xl border p-4',
                channelMode === 'social'
                  ? 'border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-200'
                  : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-200'
              )}
            >
              {channelMode === 'social' ? (
                <Info className="mt-0.5 size-4 shrink-0" />
              ) : (
                <ImageIcon className="mt-0.5 size-4 shrink-0" />
              )}
              <p className="text-xs leading-5">
                {channelMode === 'social'
                  ? 'Facebook e Instagram admiten solo texto en la integración actual. La imagen se omitirá sin simular un envío.'
                  : 'WhatsApp enviará todas las fotografías de cada vehículo; la primera incluirá su ficha comercial.'}
              </p>
            </div>

            <label className="block">
              <span className="text-sm font-semibold">
                Mensaje introductorio
              </span>
              <textarea
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
                maxLength={500}
                className="border-input bg-background focus:border-ring focus:ring-ring/50 mt-2 min-h-20 w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-3"
              />
            </label>

            <div className="mt-5 space-y-3">
              {selectedVehicles.map((vehicle, index) => (
                <div
                  key={vehicle.id}
                  className="border-border bg-background flex items-center gap-3 rounded-2xl border p-3"
                >
                  <GripVertical className="text-muted-foreground size-4 shrink-0" />
                  <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <CatalogVehicleVisual
                    compact
                    tone={vehicle.photoTone}
                    label={`${vehicle.make} ${vehicle.model}`}
                    imageUrl={vehicle.photoUrl}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {vehicle.make} {vehicle.model} {vehicle.year}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {vehicle.engine} · {vehicle.fuel} · {vehicle.transmission}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">
                      {formatCatalogClp(
                        vehicle.offerPrice ?? vehicle.listPrice
                      )}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleVehicle(vehicle.id)}
                    aria-label={`Quitar ${vehicle.make} ${vehicle.model}`}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 rounded-none px-5 py-4 sm:px-6">
          {step === 'select' ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => setStep('preview')}
              >
                Revisar selección
                <ArrowLeft className="size-4 rotate-180" />
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('select')}
              >
                Modificar
              </Button>
              <Button
                type="button"
                disabled={
                  sending ||
                  channelMode !== 'whatsapp' ||
                  selectedIds.length === 0 ||
                  !intro.trim()
                }
                title={
                  channelMode === 'social'
                    ? 'El envío visual está disponible actualmente para WhatsApp.'
                    : 'Enviar vehículos al cliente'
                }
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sending ? 'Enviando…' : 'Enviar por WhatsApp'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
