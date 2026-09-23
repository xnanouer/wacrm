import { describe, expect, it } from 'vitest';

import { parseCatalogVehicleInput, toCatalogVehiclePayload } from './payload';

const validInput = {
  internalCode: 'NX-100',
  licensePlate: 'ABCD-12',
  licensePlateVisible: false,
  make: 'Hyundai',
  model: 'Tucson',
  version: '2.0',
  year: 2024,
  color: 'Blanco',
  engine: '2.0',
  fuel: 'Bencina',
  transmission: 'Automática',
  drivetrain: '4x2',
  mileage: 12000,
  listPrice: 15990000,
  offerPrice: 14990000,
  minimumDownPayment: 3000000,
  financingText: 'Sujeto a evaluación',
  description: 'Unidad disponible.',
  location: 'Puerto Montt',
};

describe('parseCatalogVehicleInput', () => {
  it('accepts and normalizes a valid vehicle', () => {
    const result = parseCatalogVehicleInput(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.internalCode).toBe('NX-100');
    expect(result.value.listPrice).toBe(15990000);
  });

  it('rejects an offer price above list price', () => {
    const result = parseCatalogVehicleInput({
      ...validInput,
      offerPrice: 16990000,
    });
    expect(result).toEqual({
      ok: false,
      error: 'El precio de oferta no puede superar el precio de lista.',
    });
  });

  it('rejects missing tenant-safe required fields', () => {
    const result = parseCatalogVehicleInput({
      ...validInput,
      internalCode: '',
    });
    expect(result.ok).toBe(false);
  });
});

describe('toCatalogVehiclePayload', () => {
  it('maps display labels to database codes', () => {
    const parsed = parseCatalogVehicleInput(validInput);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(toCatalogVehiclePayload(parsed.value)).toMatchObject({
      fuel: 'gasoline',
      transmission: 'automatic',
      drivetrain: '4x2',
      model_year: 2024,
      list_price: 15990000,
    });
  });
});
