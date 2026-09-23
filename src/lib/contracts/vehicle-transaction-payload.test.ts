import { describe, expect, it } from 'vitest';

import type { VehicleTransactionInput } from './types';
import {
  parseVehicleTransactionInput,
  validateVehicleTransactionInput,
} from './vehicle-transaction-payload';

function validInput(): VehicleTransactionInput {
  return {
    contactId: null,
    conversationId: null,
    executiveUserId: '11111111-1111-4111-8111-111111111111',
    executiveName: 'Ejecutivo Nexora',
    executivePhone: '',
    executiveEmail: 'ventas@nexora.test',
    issueDate: '2026-08-19',
    issuePlace: 'Santiago',
    sellerName: 'Persona Vendedora',
    sellerRut: '12.345.678-5',
    sellerAddress: 'Dirección 123',
    sellerCity: 'Santiago',
    sellerPhone: '',
    sellerRepresentativeName: '',
    sellerRepresentativeRut: '',
    sellerRepresentativeAddress: '',
    sellerRepresentativeCity: '',
    sellerPowerDate: '',
    sellerPowerNotary: '',
    buyerName: 'Persona Compradora',
    buyerRut: '9.876.543-3',
    buyerAddress: 'Avenida 456',
    buyerCity: 'Santiago',
    buyerPhone: '',
    buyerCivilStatus: 'Soltero',
    secondBuyerName: '',
    secondBuyerRut: '',
    secondBuyerAddress: '',
    secondBuyerCity: '',
    buyerRepresentativeName: '',
    buyerRepresentativeRut: '',
    buyerRepresentativeAddress: '',
    buyerRepresentativeCity: '',
    buyerPowerDate: '',
    buyerPowerNotary: '',
    powerValidityDays: 30,
    vehicleType: 'Automóvil',
    vehicleMake: 'Marca',
    vehicleModel: 'Modelo',
    vehicleYear: 2024,
    vehicleColor: 'Negro',
    vehicleFuel: 'Bencina',
    vehicleEngineNumber: 'MOTOR-1',
    vehicleChassisNumber: 'VIN-1',
    vehicleSerialNumber: 'SERIE-1',
    vehiclePlate: 'ABCD12',
    vehicleGrossWeightKg: 1900,
    totalPrice: 20_000_000,
    cashAmount: 5_000_000,
    financedAmount: 15_000_000,
    reservationAmount: 500_000,
    reservationPaymentMethod: 'Transferencia',
    reservationExpiresAt: '2026-09-19',
    reservationConditions: 'Condiciones de reserva.',
    vehicleHasFines: false,
    sellerHasPensionDebt: false,
    buyerHasPensionDebt: false,
    amendmentAttorneyName: '',
    amendmentAttorneyRut: '',
    internalNotes: '',
  };
}

describe('vehicle transaction payload', () => {
  it('accepts a consistent direct sale', () => {
    expect(
      validateVehicleTransactionInput('vehicle_sale_direct_v1', validInput())
    ).toEqual({});
  });

  it('rejects a total that differs from cash plus financing', () => {
    const input = validInput();
    input.financedAmount = 14_000_000;
    expect(
      validateVehicleTransactionInput('vehicle_sale_direct_v1', input)
        .totalPrice
    ).toContain('coincidir');
  });

  it('rejects a reservation whose expiry precedes its issue date', () => {
    const input = validInput();
    input.reservationExpiresAt = '2026-08-18';
    expect(
      validateVehicleTransactionInput('vehicle_reservation_v1', input)
        .reservationExpiresAt
    ).toContain('anterior');
  });

  it('sanitizes identifiers, amounts and text lengths', () => {
    const parsed = parseVehicleTransactionInput({
      ...validInput(),
      contactId: 'not-an-id',
      totalPrice: -10,
      issuePlace: 'x'.repeat(150),
    });
    expect(parsed?.contactId).toBeNull();
    expect(parsed?.totalPrice).toBe(0);
    expect(parsed?.issuePlace).toHaveLength(120);
  });
});
