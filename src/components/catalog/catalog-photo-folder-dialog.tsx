'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderUp,
  ImagePlus,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { uploadCatalogImage } from '@/lib/catalog/images';
import {
  prepareCatalogPhotoFolder,
  type CatalogPhotoDescriptor,
  type CatalogPhotoFolderIssue,
} from '@/lib/catalog/photo-folder';
import type { CatalogVehicle } from '@/lib/catalog/types';

interface CatalogPhotoFolderDialogProps {
  open: boolean;
  vehicles: CatalogVehicle[];
  canAdminister: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => Promise<void>;
}

interface SelectedCatalogPhoto extends CatalogPhotoDescriptor {
  file: File;
}

interface UploadProgress {
  completed: number;
  total: number;
  currentFile: string;
}

export function CatalogPhotoFolderDialog({
  open,
  vehicles,
  canAdminister,
  onOpenChange,
  onUploaded,
}: CatalogPhotoFolderDialogProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [photos, setPhotos] = useState<SelectedCatalogPhoto[]>([]);
  const [issues, setIssues] = useState<CatalogPhotoFolderIssue[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  const eligibleVehicles = useMemo(
    () =>
      vehicles
        .filter(
          (vehicle) =>
            (canAdminister &&
              ['draft', 'pending_approval', 'available'].includes(
                vehicle.status
              )) ||
            (vehicle.status === 'draft' && vehicle.createdByCurrentUser)
        )
        .sort((left, right) =>
          left.internalCode.localeCompare(right.internalCode, 'es', {
            numeric: true,
          })
        ),
    [canAdminister, vehicles]
  );
  const selectedVehicle = useMemo(
    () =>
      eligibleVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
      null,
    [eligibleVehicles, selectedVehicleId]
  );

  function resetPhotos() {
    setFolderName('');
    setPhotos([]);
    setIssues([]);
    setProgress(null);
    if (folderInputRef.current) folderInputRef.current.value = '';
  }

  function reset() {
    setSelectedVehicleId('');
    resetPhotos();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (uploading) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleVehicleChange(value: string | null) {
    setSelectedVehicleId(value ?? '');
    resetPhotos();
  }

  function handleFolder(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    setPhotos([]);
    setIssues([]);
    setProgress(null);
    if (selectedFiles.length === 0 || !selectedVehicle) {
      setFolderName('');
      return;
    }

    const firstPath = selectedFiles[0]?.webkitRelativePath ?? '';
    setFolderName(firstPath.split('/')[0] || 'Carpeta seleccionada');
    const candidates: SelectedCatalogPhoto[] = selectedFiles.map((file) => ({
      file,
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
      type: file.type,
      size: file.size,
    }));
    const result = prepareCatalogPhotoFolder(
      candidates,
      selectedVehicle.imageCount
    );
    setPhotos(result.files);
    setIssues(result.issues);
  }

  async function uploadFolder() {
    if (uploading || photos.length === 0 || !selectedVehicle) return;
    setUploading(true);
    setProgress({ completed: 0, total: photos.length, currentFile: '' });

    let completed = 0;
    let uploaded = 0;
    const uploadIssues: CatalogPhotoFolderIssue[] = [];
    const existingImageIds = (selectedVehicle.images ?? []).map(
      (image) => image.id
    );

    for (const photo of photos) {
      setProgress({
        completed,
        total: photos.length,
        currentFile: photo.relativePath || photo.name,
      });
      try {
        const imageId = await uploadCatalogImage(
          selectedVehicle.id,
          photo.file,
          existingImageIds.length
        );
        existingImageIds.push(imageId);
        uploaded += 1;
      } catch (error) {
        uploadIssues.push({
          fileName: photo.relativePath || photo.name,
          message:
            error instanceof Error
              ? error.message
              : 'No fue posible subir la fotografía.',
        });
      } finally {
        completed += 1;
        setProgress({
          completed,
          total: photos.length,
          currentFile: photo.relativePath || photo.name,
        });
      }
    }

    try {
      await onUploaded();
    } catch (error) {
      console.error(
        '[catalog] photo folder uploaded but refresh failed:',
        error
      );
      toast.warning(
        'Las fotografías se subieron, pero no se pudo actualizar la lista.',
        { description: 'Recarga la página para comprobarlas.' }
      );
    }

    setUploading(false);
    setProgress(null);
    if (uploadIssues.length > 0) {
      setPhotos([]);
      setFolderName('');
      setIssues(uploadIssues);
      if (folderInputRef.current) folderInputRef.current.value = '';
      toast.warning(
        `${uploaded} fotografía${uploaded === 1 ? '' : 's'} subida${uploaded === 1 ? '' : 's'}; ${uploadIssues.length} con problemas.`
      );
      return;
    }

    toast.success(
      `${uploaded} fotografía${uploaded === 1 ? '' : 's'} subida${uploaded === 1 ? '' : 's'} a ${selectedVehicle.internalCode}.`
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
              <FolderUp className="text-primary size-5" />
            </span>
            Cargar carpeta de fotos
          </DialogTitle>
          <DialogDescription>
            Elige un vehículo y Nexora asignará todas las fotos de la carpeta a
            ese vehículo. Los nombres de los archivos no importan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <section className="border-border bg-muted/25 rounded-2xl border p-4">
            <p className="text-sm font-semibold">1. Elige el vehículo</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Puedes agregar fotos a los listados de texto después de
              importarlos.
            </p>
            <Select
              value={selectedVehicleId || null}
              onValueChange={handleVehicleChange}
              disabled={uploading || eligibleVehicles.length === 0}
            >
              <SelectTrigger className="mt-4 w-full">
                <SelectValue placeholder="Seleccionar vehículo" />
              </SelectTrigger>
              <SelectContent>
                {eligibleVehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.internalCode} · {vehicle.make} {vehicle.model}{' '}
                    {vehicle.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="border-border bg-muted/25 rounded-2xl border p-4">
            <p className="text-sm font-semibold">2. Selecciona la carpeta</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              JPEG, PNG o WebP. Máximo 5 MB por fotografía y 50 por vehículo.
            </p>
            <input
              ref={folderInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              {...{ webkitdirectory: '', directory: '' }}
              onChange={(event) => handleFolder(event.target.files)}
            />
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading || !selectedVehicle}
            >
              <ImagePlus className="size-4" />
              {folderName || 'Elegir carpeta de fotos'}
            </Button>
          </section>
        </div>

        {eligibleVehicles.length === 0 && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
            No hay vehículos que puedas modificar. Importa el catálogo o crea un
            borrador antes de cargar una carpeta.
          </div>
        )}

        {selectedVehicle && photos.length > 0 && (
          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              {photos.length} foto{photos.length === 1 ? '' : 's'} lista
              {photos.length === 1 ? '' : 's'} para{' '}
              {selectedVehicle.internalCode}
            </div>
            <div className="border-border bg-background mt-3 grid gap-3 rounded-xl border p-4 text-xs sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Vehículo</p>
                <p className="mt-1 font-semibold">
                  {selectedVehicle.make} {selectedVehicle.model}{' '}
                  {selectedVehicle.year}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Primera foto</p>
                <p className="mt-1 truncate font-semibold">{photos[0]?.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total final</p>
                <p className="mt-1 font-semibold">
                  {selectedVehicle.imageCount + photos.length} fotografías
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-xs leading-5">
              Los nombres solo determinan el orden de la galería. Si el vehículo
              no tiene fotos, la primera será la principal y luego podrás
              cambiar el orden desde Editar.
            </p>
          </section>
        )}

        {issues.length > 0 && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              {issues.length} archivo{issues.length === 1 ? '' : 's'} no se
              {issues.length === 1 ? ' pudo' : ' pudieron'} incluir
            </div>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {issues.map((issue, index) => (
                <p
                  key={`${issue.fileName}-${index}`}
                  className="border-border bg-background rounded-lg border px-3 py-2 text-xs"
                >
                  <span className="font-medium">{issue.fileName}:</span>{' '}
                  {issue.message}
                </p>
              ))}
            </div>
          </section>
        )}

        {progress && (
          <section className="border-primary/20 bg-primary/5 rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span className="flex min-w-0 items-center gap-2">
                <Loader2 className="text-primary size-4 shrink-0 animate-spin" />
                <span className="truncate">{progress.currentFile}</span>
              </span>
              <span className="shrink-0">
                {progress.completed} / {progress.total}
              </span>
            </div>
            <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                }}
              />
            </div>
          </section>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void uploadFolder()}
            disabled={uploading || photos.length === 0 || !selectedVehicle}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderUp className="size-4" />
            )}
            {uploading
              ? 'Subiendo fotografías…'
              : `Subir ${photos.length || ''} foto${photos.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
