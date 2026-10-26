'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
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
  createCatalogImportTemplateCsv,
  parseCatalogImportCsv,
  type CatalogImportIssue,
  type CatalogImportRow,
} from '@/lib/catalog/import';
import { formatCatalogClp } from '@/lib/catalog/config';

interface CatalogImportDialogProps {
  open: boolean;
  remaining: number;
  canPublishText: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void>;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function CatalogImportDialog({
  open,
  remaining,
  canPublishText,
  onOpenChange,
  onImported,
}: CatalogImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CatalogImportRow[]>([]);
  const [issues, setIssues] = useState<CatalogImportIssue[]>([]);
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName('');
    setRows([]);
    setIssues([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(nextOpen: boolean) {
    if (importing) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function downloadTemplate() {
    const blob = new Blob([createCatalogImportTemplateCsv()], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-catalogo-nexora.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | null) {
    setRows([]);
    setIssues([]);
    setFileName(file?.name ?? '');
    if (!file) return;
    if (!file.name.toLocaleLowerCase('es').endsWith('.csv')) {
      setIssues([
        { message: 'Selecciona un archivo CSV guardado en formato UTF-8.' },
      ]);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setIssues([{ message: 'El archivo no puede superar los 2 MB.' }]);
      return;
    }

    const parsed = parseCatalogImportCsv(await file.text());
    setRows(parsed.rows);
    setIssues(parsed.issues);
  }

  async function importVehicles() {
    if (rows.length === 0 || issues.length > 0 || importing) return;
    if (rows.length > remaining) {
      setIssues([
        {
          message: `Intentas importar ${rows.length} vehículos, pero quedan ${remaining} espacios disponibles.`,
        },
      ]);
      return;
    }

    setImporting(true);
    try {
      const response = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: rows }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        imported?: number;
        issues?: CatalogImportIssue[];
      } | null;

      if (!response.ok) {
        setIssues(payload?.issues ?? []);
        throw new Error(
          payload?.error ?? 'No fue posible importar el archivo.'
        );
      }

      await onImported();
      if ((payload?.issues?.length ?? 0) > 0) {
        setIssues(payload?.issues ?? []);
        toast.warning(payload?.message ?? 'La importación terminó con avisos.');
        return;
      }

      toast.success(
        payload?.message ??
          `${payload?.imported ?? rows.length} vehículos importados.`
      );
      handleOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No fue posible importar el archivo.'
      );
    } finally {
      setImporting(false);
    }
  }

  const canImport =
    rows.length > 0 &&
    issues.length === 0 &&
    rows.length <= remaining &&
    !importing;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
              <FileSpreadsheet className="text-primary size-5" />
            </span>
            Importar catálogo
          </DialogTitle>
          <DialogDescription>
            Carga varias unidades desde una planilla CSV compatible con Excel.
            Antes de guardar podrás revisar los datos y corregir cualquier fila.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <section className="border-border bg-muted/25 rounded-2xl border p-4">
            <p className="text-sm font-semibold">1. Descarga la plantilla</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Ábrela en Excel, completa una fila por vehículo y guárdala como
              CSV UTF-8. No cambies los nombres de las columnas.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={downloadTemplate}
            >
              <Download className="size-4" />
              Descargar plantilla CSV
            </Button>
          </section>

          <section className="border-border bg-muted/25 rounded-2xl border p-4">
            <p className="text-sm font-semibold">2. Selecciona el archivo</p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              Máximo 200 vehículos y 2 MB por importación. Tienes {remaining}{' '}
              espacios disponibles.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) =>
                void handleFile(event.target.files?.[0] ?? null)
              }
            />
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="size-4" />
              {fileName || 'Elegir archivo CSV'}
            </Button>
          </section>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
          {canPublishText
            ? 'Las unidades quedarán disponibles inmediatamente como catálogo de texto, aunque todavía no tengan fotografías. Podrás agregar las fotos después.'
            : 'Las unidades quedarán como catálogo de texto y se enviarán directamente a aprobación. No es obligatorio cargar fotografías para solicitarla.'}
        </div>

        {issues.length > 0 ? (
          <section className="border-destructive/25 bg-destructive/5 rounded-2xl border p-4">
            <div className="text-destructive flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4" />
              Corrige {issues.length} problema{issues.length === 1 ? '' : 's'}
            </div>
            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
              {issues.map((issue, index) => (
                <p
                  key={`${issue.rowNumber ?? 'file'}-${index}`}
                  className="border-destructive/15 bg-background rounded-lg border px-3 py-2 text-xs"
                >
                  {issue.rowNumber ? `Fila ${issue.rowNumber}: ` : ''}
                  {issue.message}
                </p>
              ))}
            </div>
          </section>
        ) : rows.length > 0 ? (
          <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                {rows.length} vehículo{rows.length === 1 ? '' : 's'} listo
                {rows.length === 1 ? '' : 's'} para importar
              </div>
              <span className="text-muted-foreground text-xs">
                Vista previa de {Math.min(rows.length, 8)} filas
              </span>
            </div>
            <div className="border-border bg-background mt-3 overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[42rem] text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Fila</th>
                    <th className="px-3 py-2 font-semibold">Código</th>
                    <th className="px-3 py-2 font-semibold">Vehículo</th>
                    <th className="px-3 py-2 font-semibold">Año</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Precio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((row) => (
                    <tr key={row.rowNumber} className="border-border border-t">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">
                        {row.input.internalCode}
                      </td>
                      <td className="px-3 py-2">
                        {row.input.make} {row.input.model}
                      </td>
                      <td className="px-3 py-2">{row.input.year}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCatalogClp(row.input.listPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importing}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void importVehicles()}
            disabled={!canImport}
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {importing ? 'Importando…' : `Importar ${rows.length || ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
