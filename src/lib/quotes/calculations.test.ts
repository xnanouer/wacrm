import { describe, expect, it } from 'vitest';

import {
  addDaysToIsoDate,
  calculateQuotationAmounts,
  canTransitionQuotation,
  toClpInteger,
} from './calculations';
import {
  isSafeRemoteAssetUrl,
  isValidChileanRut,
  renderQuotationMessage,
} from './validation';

describe('vehicle quotation calculations', () => {
  it('calculates the documented financed totals using integer CLP', () => {
    expect(
      calculateQuotationAmounts({
        listPrice: 22_990_000,
        discountAmount: 1_000_000,
        downPayment: 4_500_000,
        financedExpenses: 0,
        purchaseType: 'financed',
      })
    ).toEqual({
      listPrice: 22_990_000,
      discountAmount: 1_000_000,
      finalPrice: 21_990_000,
      downPayment: 4_500_000,
      financedExpenses: 0,
      amountToFinance: 17_490_000,
      downPaymentPercentage: 20.5,
    });
  });

  it('zeroes financing-only values for cash purchases', () => {
    const result = calculateQuotationAmounts({
      listPrice: 10_000_000,
      discountAmount: 500_000,
      downPayment: 3_000_000,
      financedExpenses: 250_000,
      purchaseType: 'cash',
    });
    expect(result.amountToFinance).toBe(0);
    expect(result.downPayment).toBe(0);
    expect(result.financedExpenses).toBe(0);
  });

  it('rounds and clamps CLP inputs', () => {
    expect(toClpInteger('1020.7')).toBe(1021);
    expect(toClpInteger(-10)).toBe(0);
    expect(toClpInteger('invalid')).toBe(0);
  });

  it('calculates validity dates without timezone drift', () => {
    expect(addDaysToIsoDate('2026-08-01', 30)).toBe('2026-08-31');
    expect(addDaysToIsoDate('2026-12-20', 30)).toBe('2027-01-19');
  });
});

describe('quotation workflow', () => {
  it('allows the commercial path and protects terminal states', () => {
    expect(canTransitionQuotation('draft', 'generated')).toBe(true);
    expect(canTransitionQuotation('sent', 'financing_pending')).toBe(true);
    expect(canTransitionQuotation('accepted', 'contract_completed')).toBe(true);
    expect(canTransitionQuotation('contract_completed', 'draft')).toBe(false);
  });
});

describe('quotation validation helpers', () => {
  it('validates Chilean RUTs while allowing an empty optional value', () => {
    expect(isValidChileanRut('12.345.678-5')).toBe(true);
    expect(isValidChileanRut('12.345.678-9')).toBe(false);
    expect(isValidChileanRut('')).toBe(true);
  });

  it('renders deterministic WhatsApp variables and reports unknown ones', () => {
    const rendered = renderQuotationMessage(
      'Hola {{cliente}}, revisa {{numero}} {{desconocida}}',
      {
        cliente: 'María',
        numero: 'NX-000001',
        vehiculo: 'Ford Ranger',
        precio: '$21.990.000',
        vigencia: '20/06/2026',
        ejecutivo: 'Nicolás',
      }
    );
    expect(rendered.text).toContain('Hola María');
    expect(rendered.unknownVariables).toEqual(['desconocida']);
  });

  it('rejects local or insecure asset URLs used by the PDF renderer', () => {
    expect(isSafeRemoteAssetUrl('https://example.com/vehicle.png')).toBe(true);
    expect(isSafeRemoteAssetUrl('http://example.com/vehicle.png')).toBe(false);
    expect(isSafeRemoteAssetUrl('https://127.0.0.1/private')).toBe(false);
    expect(isSafeRemoteAssetUrl('https://192.168.1.20/private')).toBe(false);
  });
});
