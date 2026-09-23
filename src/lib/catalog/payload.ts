import type { CatalogVehicleInput } from './types';

const FUEL_CODES: Record<string, string> = {
  Bencina: 'gasoline',
  Diésel: 'diesel',
  Híbrido: 'hybrid',
  Eléctrico: 'electric',
  Gas: 'gas',
  Otro: 'other',
};

const TRANSMISSION_CODES: Record<string, string> = {
  Automática: 'automatic',
  Mecánica: 'manual',
  CVT: 'cvt',
  'Doble embrague': 'dual_clutch',
  Otra: 'other',
};

const DRIVETRAIN_CODES: Record<string, string> = {
  '4x2': '4x2',
  '4x4': '4x4',
  AWD: 'awd',
  FWD: 'fwd',
  RWD: 'rwd',
  Otra: 'other',
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCatalogVehicleInput(
  body: unknown
): { ok: true; value: CatalogVehicleInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Solicitud inválida.' };
  }

  const source = body as Record<string, unknown>;
  const internalCode = text(source.internalCode, 80);
  const make = text(source.make, 80);
  const model = text(source.model, 80);
  const year = numberOrNull(source.year);
  const mileage = numberOrNull(source.mileage) ?? 0;
  const listPrice = numberOrNull(source.listPrice);
  const offerPrice = numberOrNull(source.offerPrice);
  const minimumDownPayment = numberOrNull(source.minimumDownPayment);

  if (!internalCode || !make || !model) {
    return {
      ok: false,
      error: 'Código interno, marca y modelo son obligatorios.',
    };
  }
  if (!year || !Number.isInteger(year) || year < 1886 || year > 2200) {
    return { ok: false, error: 'El año del vehículo no es válido.' };
  }
  if (!Number.isInteger(mileage) || mileage < 0) {
    return { ok: false, error: 'El kilometraje no es válido.' };
  }
  if (listPrice === null || listPrice < 0) {
    return { ok: false, error: 'El precio de lista no es válido.' };
  }
  if (offerPrice !== null && (offerPrice < 0 || offerPrice > listPrice)) {
    return {
      ok: false,
      error: 'El precio de oferta no puede superar el precio de lista.',
    };
  }
  if (minimumDownPayment !== null && minimumDownPayment < 0) {
    return { ok: false, error: 'El pie mínimo no es válido.' };
  }

  return {
    ok: true,
    value: {
      internalCode,
      licensePlate: text(source.licensePlate, 30),
      licensePlateVisible: source.licensePlateVisible === true,
      make,
      model,
      version: text(source.version, 120),
      year,
      color: text(source.color, 80),
      engine: text(source.engine, 120),
      fuel: text(source.fuel, 40) || 'Otro',
      transmission: text(source.transmission, 40) || 'Otra',
      drivetrain: text(source.drivetrain, 40) || 'Otra',
      mileage,
      listPrice,
      offerPrice,
      minimumDownPayment,
      financingText: text(source.financingText, 3000),
      description: text(source.description, 10000),
      location: text(source.location, 160),
    },
  };
}

export function toCatalogVehiclePayload(input: CatalogVehicleInput) {
  return {
    internal_code: input.internalCode,
    license_plate: input.licensePlate || null,
    license_plate_visible: input.licensePlateVisible,
    make: input.make,
    model: input.model,
    version: input.version,
    model_year: input.year,
    color: input.color,
    engine: input.engine,
    fuel: FUEL_CODES[input.fuel] ?? 'other',
    transmission: TRANSMISSION_CODES[input.transmission] ?? 'other',
    drivetrain: DRIVETRAIN_CODES[input.drivetrain] ?? 'other',
    mileage_km: input.mileage,
    list_price: input.listPrice,
    offer_price: input.offerPrice,
    minimum_down_payment: input.minimumDownPayment,
    financing_text: input.financingText,
    description: input.description,
    current_location: input.location,
    location_description: '',
    technical_review_expires_on: null,
    circulation_permit_expires_on: null,
  };
}
