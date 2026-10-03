import { describe, expect, it } from 'vitest';

import type { QuotationInput } from './types';
import { validateQuotationInput } from './validation';

function validQuotationInput(): QuotationInput {
  return {
    contactId: null,
    conversationId: null,
    catalogItemId: null,
    executiveUserId: null,
    executiveName: 'Ejecutiva Nexora',
    executivePhone: '',
    executiveEmail: '',
    clientName: 'Cliente de prueba',
    clientRut: '',
    clientPhone: '+56 9 1111 1111',
    clientEmail: '',
    clientCity: '',
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleVersion: '',
    vehicleYear: 2024,
    vehicleColor: '',
    vehicleFuel: '',
    vehicleTransmission: '',
    vehicleDrivetrain: '',
    vehicleMileageKm: 0,
    vehiclePlate: '',
    vehicleImageUrl: '',
    purchaseType: 'cash',
    listPrice: 10_000_000,
    discountAmount: 0,
    downPayment: 0,
    financedExpenses: 0,
    issueDate: '2026-10-03',
    validUntil: '2026-11-03',
    documentNotes: '',
    internalNotes: '',
    termsText: '',
    messageText: '',
    installments: [],
  };
}

describe('validateQuotationInput', () => {
  it('allows the client email to be empty', () => {
    const result = validateQuotationInput(validQuotationInput());

    expect(result.valid).toBe(true);
    expect(result.errors.clientEmail).toBeUndefined();
  });

  it('validates the client email only when one is provided', () => {
    const input = validQuotationInput();
    input.clientEmail = 'correo-invalido';

    const result = validateQuotationInput(input);

    expect(result.valid).toBe(false);
    expect(result.errors.clientEmail).toBe('El correo no es válido.');
  });
});
