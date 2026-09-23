export const CATALOG_PLAN_LIMITS = {
  starter: 50,
  professional: 150,
  enterprise: 500,
} as const;

export const CATALOG_ADDON = {
  units: 10,
  monthlyPrice: 5_990,
} as const;

export const CATALOG_SHARE_MAX_ITEMS = 5;

export const CATALOG_QUOTA_STATUSES = [
  'draft',
  'pending_approval',
  'available',
  'reserved',
] as const;

export const CATALOG_STATUSES = [
  'draft',
  'pending_approval',
  'available',
  'reserved',
  'sold',
  'inactive',
  'archived',
] as const;

export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const CATALOG_STATUS_META: Record<
  CatalogStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Borrador',
    className:
      'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  },
  pending_approval: {
    label: 'Pendiente de aprobación',
    className:
      'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  available: {
    label: 'Disponible',
    className:
      'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  reserved: {
    label: 'Reservado',
    className:
      'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  sold: {
    label: 'Vendido',
    className:
      'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  inactive: {
    label: 'Inactivo',
    className:
      'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
  },
  archived: {
    label: 'Archivado',
    className:
      'border-zinc-500/20 bg-zinc-500/5 text-zinc-500 dark:text-zinc-400',
  },
};

export function formatCatalogClp(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

export function catalogStatusConsumesQuota(status: CatalogStatus): boolean {
  return (CATALOG_QUOTA_STATUSES as readonly string[]).includes(status);
}
