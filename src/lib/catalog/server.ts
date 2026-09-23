import type { AccountContext } from '@/lib/auth/account';
import type { CatalogStatus } from './config';
import type { CatalogUsage, CatalogVehicle } from './types';

const FUEL_LABELS: Record<string, string> = {
  gasoline: 'Bencina',
  diesel: 'Diésel',
  hybrid: 'Híbrido',
  electric: 'Eléctrico',
  gas: 'Gas',
  other: 'Otro',
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: 'Automática',
  manual: 'Mecánica',
  cvt: 'CVT',
  dual_clutch: 'Doble embrague',
  other: 'Otra',
};

const DRIVETRAIN_LABELS: Record<string, string> = {
  '4x2': '4x2',
  '4x4': '4x4',
  awd: 'AWD',
  fwd: 'FWD',
  rwd: 'RWD',
  other: 'Otra',
};

const PHOTO_TONES = [
  'from-violet-950 via-violet-700 to-fuchsia-300',
  'from-slate-800 via-slate-600 to-slate-300',
  'from-blue-950 via-blue-700 to-cyan-300',
  'from-emerald-950 via-emerald-700 to-teal-300',
] as const;

interface VehicleDetailRow {
  license_plate: string | null;
  license_plate_visible: boolean;
  make: string;
  model: string;
  version: string;
  model_year: number;
  color: string;
  engine: string;
  fuel: string;
  transmission: string;
  drivetrain: string;
  mileage_km: number;
  list_price: number | string;
  offer_price: number | string | null;
  minimum_down_payment: number | string | null;
  financing_text: string;
  current_location: string;
}

interface ImageRow {
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
}

interface CatalogItemRow {
  id: string;
  internal_code: string;
  description: string;
  status: CatalogStatus;
  created_by_user_id: string;
  updated_at: string;
  catalog_vehicle_details: VehicleDetailRow | VehicleDetailRow[];
  catalog_item_images: ImageRow[] | null;
}

interface CapacityRow {
  plan_code: string;
  extra_units: number;
  total_limit: number;
  used_units: number;
  remaining_units: number;
}

function relationOne<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function numeric(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function planName(code: string): string {
  if (code === 'professional') return 'PRO';
  if (code === 'enterprise') return 'BUSINESS';
  if (code === 'starter') return 'STARTER';
  return 'PRUEBA';
}

export async function loadCatalogData(
  ctx: AccountContext
): Promise<{ vehicles: CatalogVehicle[]; usage: CatalogUsage }> {
  const [
    { data: rawItems, error: itemsError },
    { data: rawCapacity, error: capacityError },
  ] = await Promise.all([
    ctx.supabase
      .from('catalog_items')
      .select(
        `
          id,
          internal_code,
          description,
          status,
          created_by_user_id,
          updated_at,
          catalog_vehicle_details!inner(
            license_plate,
            license_plate_visible,
            make,
            model,
            version,
            model_year,
            color,
            engine,
            fuel,
            transmission,
            drivetrain,
            mileage_km,
            list_price,
            offer_price,
            minimum_down_payment,
            financing_text,
            current_location
          ),
          catalog_item_images(storage_path, is_primary, sort_order)
        `
      )
      .eq('account_id', ctx.accountId)
      .order('updated_at', { ascending: false }),
    ctx.supabase.rpc('catalog_capacity_snapshot'),
  ]);

  if (itemsError) throw new Error('catalog_items_load_failed');
  if (capacityError) throw new Error('catalog_capacity_load_failed');

  const items = (rawItems ?? []) as unknown as CatalogItemRow[];
  const creatorIds = [...new Set(items.map((item) => item.created_by_user_id))];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await ctx.supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('account_id', ctx.accountId)
      .in('user_id', creatorIds);
    for (const profile of profiles ?? []) {
      creatorNames.set(profile.user_id as string, profile.full_name as string);
    }
  }

  const primaryPaths = items
    .map((item) => {
      const orderedImages = (item.catalog_item_images ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      return (
        orderedImages.find((image) => image.is_primary)?.storage_path ??
        orderedImages[0]?.storage_path
      );
    })
    .filter((path): path is string => Boolean(path));

  const signedUrls = new Map<string, string>();
  await Promise.all(
    primaryPaths.map(async (path) => {
      const { data } = await ctx.supabase.storage
        .from('catalog-media')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) signedUrls.set(path, data.signedUrl);
    })
  );

  const vehicles = items.map((item, index): CatalogVehicle => {
    const detail = relationOne(item.catalog_vehicle_details);
    const orderedImages = (item.catalog_item_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    const primaryPath =
      orderedImages.find((image) => image.is_primary)?.storage_path ??
      orderedImages[0]?.storage_path;
    return {
      id: item.id,
      internalCode: item.internal_code,
      licensePlate: detail.license_plate ?? 'SIN PATENTE',
      licensePlateVisible: detail.license_plate_visible,
      make: detail.make,
      model: detail.model,
      version: detail.version,
      year: detail.model_year,
      color: detail.color,
      engine: detail.engine,
      fuel: FUEL_LABELS[detail.fuel] ?? 'Otro',
      transmission: TRANSMISSION_LABELS[detail.transmission] ?? 'Otra',
      drivetrain: DRIVETRAIN_LABELS[detail.drivetrain] ?? 'Otra',
      mileage: detail.mileage_km,
      listPrice: numeric(detail.list_price) ?? 0,
      offerPrice: numeric(detail.offer_price),
      minimumDownPayment: numeric(detail.minimum_down_payment),
      financingText: detail.financing_text,
      description: item.description,
      location: detail.current_location,
      status: item.status,
      createdBy:
        item.created_by_user_id === ctx.userId
          ? 'Tú'
          : (creatorNames.get(item.created_by_user_id) ?? 'Equipo Nexora'),
      createdByCurrentUser: item.created_by_user_id === ctx.userId,
      updatedAt: item.updated_at,
      imageCount: (item.catalog_item_images ?? []).length,
      photoTone: PHOTO_TONES[index % PHOTO_TONES.length],
      photoUrl: primaryPath ? (signedUrls.get(primaryPath) ?? null) : null,
    };
  });

  const capacity = ((rawCapacity ?? []) as CapacityRow[])[0];
  return {
    vehicles,
    usage: {
      used: capacity?.used_units ?? 0,
      limit: capacity?.total_limit ?? 0,
      remaining: capacity?.remaining_units ?? 0,
      planName: planName(capacity?.plan_code ?? ctx.account.plan_code),
      extraUnits: capacity?.extra_units ?? 0,
    },
  };
}
