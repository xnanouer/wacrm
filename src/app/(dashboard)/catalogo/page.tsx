import type { Metadata } from 'next';

import { CatalogView } from '@/components/catalog/catalog-view';
import { requireRole } from '@/lib/auth/account';
import { loadCatalogData } from '@/lib/catalog/server';

export const metadata: Metadata = {
  title: 'Catálogo | Nexora',
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const context = await requireRole('agent');
  const catalog = await loadCatalogData(context);
  const params = await searchParams;
  const initialSelectedId =
    typeof params.item === 'string' ? params.item : undefined;
  return (
    <CatalogView
      initialVehicles={catalog.vehicles}
      initialUsage={catalog.usage}
      initialSelectedId={initialSelectedId}
    />
  );
}
