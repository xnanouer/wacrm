'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const MAX_COMPANY_LOGO_BYTES = 3 * 1024 * 1024;
export const COMPANY_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function validateCompanyLogo(file: File) {
  if (!COMPANY_LOGO_TYPES.has(file.type))
    return 'Utiliza una imagen PNG, JPG o WebP.';
  if (file.size <= 0 || file.size > MAX_COMPANY_LOGO_BYTES)
    return 'El logo puede pesar hasta 3 MB.';
  return null;
}

export function CompanyLogoPicker({
  file,
  currentUrl,
  companyName,
  disabled,
  onChange,
  onRemove,
}: {
  file: File | null;
  currentUrl?: string | null;
  companyName: string;
  disabled?: boolean;
  onChange: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  function choose(next: File | undefined) {
    if (!next) return;
    const error = validateCompanyLogo(next);
    if (error) {
      toast.error('No pudimos usar esa imagen', { description: error });
      return;
    }
    onChange(next);
  }

  const visibleUrl = preview ?? currentUrl ?? null;
  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) choose(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'border-border bg-muted/20 hover:border-primary/45 hover:bg-primary/5 flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-center transition-all',
          dragging && 'border-primary bg-primary/8 scale-[1.01]',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        {visibleUrl ? (
          <span className="bg-card border-border flex size-24 items-center justify-center overflow-hidden rounded-2xl border p-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={visibleUrl}
              alt={`Logo de ${companyName || 'la empresa'}`}
              className="max-h-full max-w-full object-contain"
            />
          </span>
        ) : (
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <ImageIcon className="size-6" />
          </span>
        )}
        <span>
          <span className="text-foreground block text-sm font-semibold">
            {visibleUrl ? 'Reemplazar logo' : 'Sube el logo de tu empresa'}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            Arrástralo aquí o selecciona un archivo · PNG, JPG o WebP · Máx. 3
            MB
          </span>
        </span>
        <span className="text-primary inline-flex items-center gap-2 text-xs font-semibold">
          <UploadCloud className="size-4" /> Seleccionar imagen
        </span>
      </button>
      {visibleUrl && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="size-4" /> Quitar logo
          </Button>
        </div>
      )}
    </div>
  );
}
