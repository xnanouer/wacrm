'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CarFront,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  ImagePlus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CATALOG_IMAGE_MAX_BYTES,
  reorderCatalogImages,
  uploadCatalogImage,
} from '@/lib/catalog/images';
import type { CatalogVehicle, CatalogVehicleInput } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: CatalogVehicle | null;
  onSaved: () => Promise<void> | void;
}

const fieldClassName = 'h-10 rounded-xl';
const MAX_GALLERY_IMAGES = 50;

interface ExistingGalleryImage {
  key: string;
  kind: 'existing';
  id: string;
  url: string | null;
  altText: string;
  byteSize: number;
}

interface NewGalleryImage {
  key: string;
  kind: 'new';
  file: File;
  url: string;
}

type GalleryImage = ExistingGalleryImage | NewGalleryImage;

function galleryFromVehicle(vehicle?: CatalogVehicle | null): GalleryImage[] {
  return (vehicle?.images ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => ({
      key: `existing:${image.id}`,
      kind: 'existing' as const,
      id: image.id,
      url: image.url,
      altText: image.altText,
      byteSize: image.byteSize,
    }));
}

function imageBaseName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLocaleLowerCase('es');
}

function isRepeatedImage(gallery: GalleryImage[], file: File): boolean {
  const fileName = imageBaseName(file.name);
  return gallery.some((image) => {
    if (image.kind === 'new') {
      return (
        image.file.name.toLocaleLowerCase('es') ===
          file.name.toLocaleLowerCase('es') &&
        image.file.size === file.size &&
        image.file.lastModified === file.lastModified
      );
    }
    return (
      Boolean(image.altText) &&
      imageBaseName(image.altText) === fileName &&
      image.byteSize === file.size
    );
  });
}

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle = null,
  onSaved,
}: VehicleFormDialogProps) {
  const [licensePlateVisible, setLicensePlateVisible] = useState(
    vehicle?.licensePlateVisible ?? false
  );
  const [gallery, setGallery] = useState<GalleryImage[]>(() =>
    galleryFromVehicle(vehicle)
  );
  const [saving, setSaving] = useState(false);
  const objectUrls = useRef(new Set<string>());
  const savingRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    if (!open) return;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setGallery(galleryFromVehicle(vehicle));
    setLicensePlateVisible(vehicle?.licensePlateVisible ?? false);
  }, [open, vehicle]);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    },
    []
  );

  function clearNewImagePreviews() {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && savingRef.current) return;
    if (!nextOpen) clearNewImagePreviews();
    onOpenChange(nextOpen);
  }

  function handleImageSelection(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const nextGallery = [...gallery];
    let duplicateCount = 0;
    let invalidCount = 0;
    let limitCount = 0;

    for (const file of selectedFiles) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size < 1 ||
        file.size > CATALOG_IMAGE_MAX_BYTES
      ) {
        invalidCount += 1;
        continue;
      }
      if (isRepeatedImage(nextGallery, file)) {
        duplicateCount += 1;
        continue;
      }
      if (nextGallery.length >= MAX_GALLERY_IMAGES) {
        limitCount += 1;
        continue;
      }

      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      nextGallery.push({
        key: `new:${crypto.randomUUID()}`,
        kind: 'new',
        file,
        url,
      });
    }

    setGallery(nextGallery);
    if (duplicateCount > 0) {
      toast.info(
        duplicateCount === 1
          ? 'Esa fotografía ya estaba en la galería.'
          : `${duplicateCount} fotografías repetidas no se agregaron.`
      );
    }
    if (invalidCount > 0) {
      toast.warning(
        invalidCount === 1
          ? 'Una fotografía no cumple el formato o el límite de 5 MB.'
          : `${invalidCount} fotografías no cumplen el formato o el límite de 5 MB.`
      );
    }
    if (limitCount > 0) {
      toast.warning(`La galería admite hasta ${MAX_GALLERY_IMAGES} fotos.`);
    }
  }

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = gallery.findIndex((image) => image.key === active.id);
    const newIndex = gallery.findIndex((image) => image.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setGallery(arrayMove(gallery, oldIndex, newIndex));
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= gallery.length) return;
    setGallery(arrayMove(gallery, index, nextIndex));
  }

  function removeNewImage(key: string) {
    setGallery((current) => {
      const image = current.find((candidate) => candidate.key === key);
      if (image?.kind === 'new') {
        URL.revokeObjectURL(image.url);
        objectUrls.current.delete(image.url);
      }
      return current.filter((candidate) => candidate.key !== key);
    });
  }

  async function saveVehicle(
    input: CatalogVehicleInput,
    confirmDuplicate = false
  ): Promise<string> {
    const response = await fetch(
      vehicle ? `/api/catalog/${vehicle.id}` : '/api/catalog',
      {
        method: vehicle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, confirmDuplicate }),
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      error?: string;
      code?: string;
    } | null;

    if (
      response.status === 409 &&
      payload?.code === 'possible_duplicate' &&
      !confirmDuplicate
    ) {
      const confirmed = window.confirm(
        'Ya existe una unidad con la misma patente. ¿Deseas guardar esta ficha de todas formas?'
      );
      if (confirmed) return saveVehicle(input, true);
    }
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.error ?? 'No fue posible guardar el vehículo.');
    }
    return payload.id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CatalogVehicleInput = {
      internalCode: String(data.get('internalCode') || '').trim(),
      licensePlate: String(data.get('licensePlate') || '').trim(),
      licensePlateVisible,
      make: String(data.get('make') || '').trim(),
      model: String(data.get('model') || '').trim(),
      version: String(data.get('version') || '').trim(),
      year: Number(data.get('year')),
      color: String(data.get('color') || '').trim(),
      engine: String(data.get('engine') || '').trim(),
      fuel: String(data.get('fuel') || 'Bencina'),
      transmission: String(data.get('transmission') || 'Automática'),
      drivetrain: String(data.get('drivetrain') || '4x2'),
      mileage: Number(data.get('mileage')) || 0,
      listPrice: Number(data.get('listPrice')),
      offerPrice: Number(data.get('offerPrice')) || null,
      minimumDownPayment: Number(data.get('minimumDownPayment')) || null,
      financingText: String(data.get('financingText') || '').trim(),
      description: String(data.get('description') || '').trim(),
      location: String(data.get('location') || '').trim(),
    };

    savingRef.current = true;
    setSaving(true);
    try {
      const itemId = await saveVehicle(input);
      const orderedImageIds: string[] = [];
      const imageWarnings: string[] = [];
      for (const [index, image] of gallery.entries()) {
        if (image.kind === 'existing') {
          orderedImageIds.push(image.id);
          continue;
        }

        try {
          const imageId = await uploadCatalogImage(
            itemId,
            image.file,
            2_000_000_000 + index
          );
          orderedImageIds.push(imageId);
        } catch (error) {
          imageWarnings.push(
            error instanceof Error
              ? `${image.file.name}: ${error.message}`
              : `${image.file.name}: no pudo guardarse.`
          );
        }
      }
      if (orderedImageIds.length > 0) {
        try {
          await reorderCatalogImages(itemId, orderedImageIds);
        } catch (error) {
          imageWarnings.push(
            error instanceof Error
              ? `No se pudo ordenar la galería: ${error.message}`
              : 'No se pudo ordenar la galería.'
          );
        }
      }
      try {
        await onSaved();
      } catch (error) {
        console.error('[catalog] vehicle saved but refresh failed:', error);
        toast.warning(
          'El vehículo se guardó, pero no fue posible actualizar la lista.',
          { description: 'Recarga la página para verlo.' }
        );
      }
      toast.success(
        vehicle
          ? 'Vehículo actualizado correctamente.'
          : 'Vehículo guardado como borrador.'
      );
      if (imageWarnings.length > 0) {
        toast.warning(
          imageWarnings.length === 1
            ? 'La ficha se guardó, pero faltó una fotografía.'
            : `La ficha se guardó, pero faltaron ${imageWarnings.length} fotografías.`,
          {
            description: imageWarnings.join(' '),
          }
        );
      }
      form.reset();
      clearNewImagePreviews();
      setGallery([]);
      setLicensePlateVisible(false);
      savingRef.current = false;
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el vehículo.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-border/70 bg-popover/95 sticky top-0 z-10 border-b px-5 py-4 backdrop-blur-xl sm:px-7">
            <div className="flex items-start gap-3 pr-10">
              <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
                <CarFront className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  {vehicle ? 'Editar vehículo' : 'Nuevo vehículo'}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Completa la ficha. Los cambios se guardarán en el catálogo
                  privado de tu empresa.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8 px-5 py-6 sm:px-7">
            <FormSection
              eyebrow="01"
              title="Identificación"
              description="Los datos esenciales para reconocer la unidad dentro del equipo."
            >
              <Field
                label="Código interno"
                name="internalCode"
                placeholder="NX-00135"
                defaultValue={vehicle?.internalCode}
                required
              />
              <Field
                label="Patente"
                name="licensePlate"
                placeholder="ABCD-12"
                defaultValue={vehicle?.licensePlate}
              />
              <Field
                label="Marca"
                name="make"
                placeholder="Hyundai"
                defaultValue={vehicle?.make}
                required
              />
              <Field
                label="Modelo"
                name="model"
                placeholder="Tucson"
                defaultValue={vehicle?.model}
                required
              />
              <Field
                label="Versión"
                name="version"
                placeholder="2.0 GL 4x2"
                defaultValue={vehicle?.version}
              />
              <Field
                label="Año"
                name="year"
                type="number"
                placeholder="2024"
                min="1950"
                max="2030"
                defaultValue={vehicle?.year}
                required
              />
              <Field
                label="Color"
                name="color"
                placeholder="Blanco"
                defaultValue={vehicle?.color}
              />

              <div className="sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  onClick={() => setLicensePlateVisible((current) => !current)}
                  className="border-border bg-muted/35 hover:bg-muted/60 flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-colors"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-xl border">
                      {licensePlateVisible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4" />
                      )}
                    </span>
                    <span>
                      <span className="text-foreground block text-sm font-semibold">
                        Patente visible al cliente
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        La patente seguirá disponible internamente aunque se
                        oculte al compartir.
                      </span>
                    </span>
                  </span>
                  <span
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      licensePlateVisible
                        ? 'bg-primary'
                        : 'bg-muted-foreground/25'
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${
                        licensePlateVisible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </FormSection>

            <FormSection
              eyebrow="02"
              title="Información técnica"
              description="Características que el ejecutivo podrá incluir al compartir."
            >
              <Field
                label="Motor"
                name="engine"
                placeholder="2.0 Turbo"
                defaultValue={vehicle?.engine}
              />
              <SelectField
                label="Combustible"
                name="fuel"
                options={['Bencina', 'Diésel', 'Híbrido', 'Eléctrico']}
                defaultValue={vehicle?.fuel}
              />
              <SelectField
                label="Transmisión"
                name="transmission"
                options={['Automática', 'Mecánica']}
                defaultValue={vehicle?.transmission}
              />
              <SelectField
                label="Tracción"
                name="drivetrain"
                options={['4x2', '4x4', 'AWD']}
                defaultValue={vehicle?.drivetrain}
              />
              <Field
                label="Kilometraje"
                name="mileage"
                type="number"
                placeholder="82000"
                min="0"
                defaultValue={vehicle?.mileage}
              />
            </FormSection>

            <FormSection
              eyebrow="03"
              title="Información comercial"
              description="Los precios del vehículo no podrán modificarse desde la vista previa del chat."
            >
              <Field
                label="Precio lista"
                name="listPrice"
                type="number"
                placeholder="12990000"
                min="0"
                defaultValue={vehicle?.listPrice}
                required
              />
              <Field
                label="Precio oferta"
                name="offerPrice"
                type="number"
                placeholder="11990000"
                min="0"
                defaultValue={vehicle?.offerPrice ?? undefined}
              />
              <Field
                label="Pie mínimo"
                name="minimumDownPayment"
                type="number"
                placeholder="2600000"
                min="0"
                defaultValue={vehicle?.minimumDownPayment ?? undefined}
              />
              <Field
                label="Ubicación"
                name="location"
                placeholder="Puerto Montt"
                defaultValue={vehicle?.location}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="financingText">Texto de financiamiento</Label>
                <Input
                  id="financingText"
                  name="financingText"
                  className={`mt-2 ${fieldClassName}`}
                  placeholder="Pie mínimo acreditando ingresos"
                  defaultValue={vehicle?.financingText}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="description">Descripción comercial</Label>
                <Textarea
                  id="description"
                  name="description"
                  className="mt-2 min-h-24 rounded-xl"
                  placeholder="Describe el estado, equipamiento y atributos destacados de la unidad."
                  defaultValue={vehicle?.description}
                />
              </div>
            </FormSection>

            <section className="border-border/70 bg-muted/20 rounded-2xl border border-dashed p-5">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <ImagePlus className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Fotografías</h3>
                    <p className="text-muted-foreground mt-1 max-w-xl text-xs leading-5">
                      Las fotos ya guardadas aparecen abajo: agrega solo las
                      nuevas. Arrástralas para definir el orden de envío; la
                      primera será la imagen principal.
                    </p>
                  </div>
                </div>
                <label className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 cursor-pointer items-center justify-center rounded-md border px-4 text-sm font-medium">
                  Seleccionar fotografías
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      handleImageSelection(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
              {gallery.length > 0 ? (
                <div className="mt-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-foreground text-xs font-semibold">
                      {gallery.length}{' '}
                      {gallery.length === 1
                        ? 'fotografía en la galería'
                        : 'fotografías en la galería'}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      JPEG, PNG o WebP · máximo 5 MB por foto
                    </p>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleReorder}
                  >
                    <SortableContext
                      items={gallery.map((image) => image.key)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {gallery.map((image, index) => (
                          <SortableGalleryImage
                            key={image.key}
                            image={image}
                            index={index}
                            total={gallery.length}
                            onMove={moveImage}
                            onRemove={removeNewImage}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ) : (
                <div className="border-border/70 bg-background/60 text-muted-foreground mt-5 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center">
                  <ImageIcon className="mb-2 size-5" />
                  <p className="text-xs font-medium">
                    Este vehículo aún no tiene fotografías.
                  </p>
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="bg-popover/95 sticky bottom-0 z-10 mx-0 mb-0 rounded-none px-5 py-4 backdrop-blur-xl sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-w-40" disabled={saving}>
              <Save className="size-4" />
              {saving
                ? 'Guardando…'
                : vehicle
                  ? 'Guardar cambios'
                  : 'Guardar borrador'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableGalleryImage({
  image,
  index,
  total,
  onMove,
  onRemove,
}: {
  image: GalleryImage;
  index: number;
  total: number;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.key });
  const label =
    image.kind === 'new'
      ? image.file.name
      : image.altText || `Fotografía ${index + 1}`;

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={cn(
        'border-border bg-card group relative overflow-hidden rounded-xl border shadow-sm',
        index === 0 && 'border-primary/55 ring-primary/10 ring-2'
      )}
    >
      <div
        {...listeners}
        className="bg-muted relative aspect-[4/3] cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        title="Arrastra la fotografía para cambiar su posición"
      >
        {image.url ? (
          // Signed and local blob URLs do not benefit from Next image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={label}
            draggable={false}
            className="pointer-events-none size-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground pointer-events-none flex size-full flex-col items-center justify-center gap-1 px-3 text-center">
            <ImageIcon className="size-6" />
            <span className="text-[10px]">Vista previa no disponible</span>
          </div>
        )}

        <span className="bg-background/90 text-foreground absolute top-2 left-2 flex size-6 items-center justify-center rounded-full text-[10px] font-bold shadow-sm backdrop-blur">
          {index + 1}
        </span>
        <span
          className={cn(
            'absolute right-2 bottom-2 rounded-full px-2 py-1 text-[9px] font-bold shadow-sm backdrop-blur',
            image.kind === 'existing'
              ? 'bg-background/90 text-foreground'
              : 'bg-emerald-600/90 text-white'
          )}
        >
          {image.kind === 'existing' ? 'Guardada' : 'Nueva'}
        </span>
        {index === 0 && (
          <span className="bg-primary text-primary-foreground absolute top-2 left-10 rounded-full px-2 py-1 text-[9px] font-bold shadow-sm">
            Principal
          </span>
        )}
        <span className="bg-background/90 text-foreground pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold opacity-90 shadow-sm backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <GripVertical className="size-3" />
          Arrastra
        </span>
      </div>

      <div className="flex items-center gap-1.5 p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border active:cursor-grabbing"
          aria-label={`Mover ${label}`}
          title="Arrastrar para ordenar"
        >
          <GripVertical className="size-4" />
        </button>
        <p
          className="min-w-0 flex-1 truncate text-[11px] font-medium"
          title={label}
        >
          {label}
        </p>
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-md disabled:opacity-25"
          aria-label={`Mover ${label} a la izquierda`}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-md disabled:opacity-25"
          aria-label={`Mover ${label} a la derecha`}
        >
          <ChevronRight className="size-3.5" />
        </button>
        {image.kind === 'new' && (
          <button
            type="button"
            onClick={() => onRemove(image.key)}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex size-7 items-center justify-center rounded-md"
            aria-label={`Quitar ${label}`}
            title="Quitar fotografía nueva"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        <span className="border-primary/20 bg-primary/8 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold">
          {eyebrow}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        className={`mt-2 ${fieldClassName}`}
        {...props}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="border-input bg-background text-foreground focus:border-ring focus:ring-ring/50 mt-2 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:ring-3"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
