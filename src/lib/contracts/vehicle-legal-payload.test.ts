import { describe, expect, it } from 'vitest';

import type { VehicleLegalInput } from './types';
import {
  parseVehicleLegalInput,
  validateVehicleLegalInput,
} from './vehicle-legal-payload';

function validInput(): VehicleLegalInput {
  return {
    contactId: null,
    conversationId: null,
    executiveUserId: '11111111-1111-4111-8111-111111111111',
    executiveName: 'Ejecutivo Nexora',
    executivePhone: '',
    executiveEmail: 'ventas@nexora.test',
    issueDate: '2026-08-20',
    issuePlace: 'Puerto Montt',
    declarantName: 'Persona Propietaria',
    declarantRut: '12.345.678-5',
    declarantAddress: 'Dirección 123',
    declarantCity: 'Puerto Montt',
    declarantPhone: '',
    representativeName: 'Persona Mandataria',
    representativeRut: '9.876.543-3',
    representativeAddress: 'Avenida 456',
    representativeCity: 'Puerto Montt',
    powerValidityMonths: 12,
    vehicles: [
      {
        id: 'vehicle-1',
        type: 'Automóvil',
        make: 'Marca',
        model: 'Modelo',
        year: 2024,
        color: 'Negro',
        fuel: 'Bencina',
        engineNumber: 'MOTOR-1',
        chassisNumber: 'CHASIS-1',
        serialNumber: 'SERIE-1',
        plate: 'ABCD12',
        grossWeightKg: 1900,
        vin: '1HGCM82633A004352',
        entryDate: '2026-08-19',
      },
    ],
    internalNotes: '',
  };
}

describe('vehicle legal payload', () => {
  it('accepts a complete sales power', () => {
    expect(
      validateVehicleLegalInput('vehicle_sale_power_v1', validInput())
    ).toEqual({});
  });

  it('requires an entry date for every vehicle in a responsibility declaration', () => {
    const input = validInput();
    input.vehicles[0].entryDate = '';
    expect(
      validateVehicleLegalInput('vehicle_responsibility_declaration_v1', input)[
        'vehicles.0.entryDate'
      ]
    ).toContain('fecha');
  });

  it('limits, normalizes and sanitizes the submitted vehicles', () => {
    const parsed = parseVehicleLegalInput({
      ...validInput(),
      contactId: 'invalid',
      powerValidityMonths: 500,
      vehicles: Array.from({ length: 30 }, (_, index) => ({
        ...validInput().vehicles[0],
        id: '',
        plate: ` ab${index} `,
      })),
    });
    expect(parsed?.contactId).toBeNull();
    expect(parsed?.powerValidityMonths).toBe(120);
    expect(parsed?.vehicles).toHaveLength(25);
    expect(parsed?.vehicles[0].plate).toBe('AB0');
  });
});
