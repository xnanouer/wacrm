'use client';

import { FormEvent, useState } from 'react';
import { CarFront, Eye, EyeOff, ImagePlus, Save } from 'lucide-react';
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
import { uploadCatalogImage } from '@/lib/catalog/images';
import type { CatalogVehicle, CatalogVehicleInput } from '@/lib/catalog/types';

interface VehicleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: CatalogVehicle | null;
  onSaved: () => Promise<void> | void;
}

const fieldClassName = 'h-10 rounded-xl';

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle = null,
  onSaved,
}: VehicleFormDialogProps) {
  const [licensePlateVisible, setLicensePlateVisible] = useState(
    vehicle?.licensePlateVisible ?? false
  );
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

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
    const data = new FormData(event.currentTarget);
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

    setSaving(true);
    try {
      const itemId = await saveVehicle(input);
      let imageWarning: string | null = null;
      try {
        for (const [index, image] of images.entries()) {
          await uploadCatalogImage(itemId, image, index);
        }
      } catch (error) {
        imageWarning =
          error instanceof Error
            ? error.message
            : 'Una fotografía no pudo guardarse.';
      }
      await onSaved();
      toast.success(
        vehicle
          ? 'Vehículo actualizado correctamente.'
          : 'Vehículo guardado como borrador.'
      );
      if (imageWarning) {
        toast.warning('La ficha se guardó, pero faltó una fotografía.', {
          description: imageWarning,
        });
      }
      event.currentTarget.reset();
      setImages([]);
      setLicensePlateVisible(false);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el vehículo.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                      Selecciona fotografías JPEG, PNG o WebP de hasta 5 MB. La
                      primera quedará como imagen principal.
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
                    onChange={(event) =>
                      setImages(Array.from(event.target.files ?? []))
                    }
                  />
                </label>
              </div>
              {images.length > 0 && (
                <p className="text-primary mt-3 text-xs font-semibold">
                  {images.length}{' '}
                  {images.length === 1
                    ? 'fotografía seleccionada'
                    : 'fotografías seleccionadas'}
                </p>
              )}
            </section>
          </div>

          <DialogFooter className="bg-popover/95 sticky bottom-0 z-10 mx-0 mb-0 rounded-none px-5 py-4 backdrop-blur-xl sm:px-7">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
