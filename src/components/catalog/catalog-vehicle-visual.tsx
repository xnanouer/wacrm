import { CarFront, ImageIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CatalogVehicleVisualProps {
  tone: string;
  label: string;
  imageUrl?: string | null;
  compact?: boolean;
  badgeLabel?: string;
}

export function CatalogVehicleVisual({
  tone,
  label,
  imageUrl,
  compact = false,
  badgeLabel,
}: CatalogVehicleVisualProps) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-gradient-to-br',
        tone,
        compact ? 'h-20 w-28 shrink-0 rounded-xl' : 'aspect-[16/10] w-full'
      )}
      role="img"
      aria-label={`Imagen de ${label}`}
    >
      {imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${imageUrl}")` }}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,0.28),transparent_32%),linear-gradient(to_top,rgba(4,7,18,0.58),transparent_55%)]" />
      <div className="absolute -right-4 -bottom-8 size-28 rounded-full border border-white/15" />
      <div className="absolute -right-8 -bottom-12 size-40 rounded-full border border-white/10" />
      {!imageUrl && (
        <CarFront
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg',
            compact ? 'size-10' : 'size-16'
          )}
          strokeWidth={1.35}
        />
      )}
      {!compact && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full border border-white/20 bg-black/25 px-2 py-1 text-[10px] font-semibold text-white/85 backdrop-blur-md">
          <ImageIcon className="size-3" />
          {badgeLabel ?? (imageUrl ? 'Fotografía principal' : 'Sin fotografía')}
        </div>
      )}
    </div>
  );
}
