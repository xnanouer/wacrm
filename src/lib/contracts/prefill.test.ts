import { describe, expect, it } from 'vitest';

import { buildContractContactPrefill, parseCustomerMoney } from './prefill';

const contact = {
  id: 'contact-1',
  name: 'Nombre guardado',
  phone: '+56911112222',
  email: 'guardado@example.com',
  rut: '12.345.678-5',
  company: null,
  address: null,
  commune: null,
  city: 'Santiago',
  region: null,
  occupation: null,
  monthly_income: null,
  employment_type: null,
  employment_tenure: null,
  down_payment: 3_000_000,
  interest_product: null,
  vehicle_plate: null,
  vehicle_price: null,
  payment_method: null,
  financing_requested: null,
  profile_sources: {},
};

describe('contract contact prefill', () => {
  it('parses common Chilean money expressions', () => {
    expect(parseCustomerMoney('$6.190.000')).toBe(6_190_000);
    expect(parseCustomerMoney('2,5 millones')).toBe(2_500_000);
    expect(parseCustomerMoney(null)).toBeNull();
  });

  it('prefers explicit conversation corrections and keeps provenance', () => {
    const result = buildContractContactPrefill(contact, {
      conversation_id: 'conversation-1',
      contact_id: 'contact-1',
      full_name: 'Nombre confirmado por cliente',
      rut: null,
      phone: null,
      email: null,
      address: 'Los Carrera 123',
      commune: 'Providencia',
      city: null,
      region: 'Metropolitana',
      occupation: null,
      company: null,
      monthly_income: null,
      employment_type: null,
      employment_tenure: null,
      down_payment: '5 millones',
      vehicle_interest: 'SUV automático',
      vehicle_plate: 'abcd12',
      vehicle_price: '$18.990.000',
      payment_method: 'Financiamiento',
      financing_requested: true,
    });

    expect(result.fullName).toBe('Nombre confirmado por cliente');
    expect(result.rut).toBe(contact.rut);
    expect(result.address).toBe('Los Carrera 123');
    expect(result.downPayment).toBe(5_000_000);
    expect(result.vehiclePrice).toBe(18_990_000);
    expect(result.conversationId).toBe('conversation-1');
    expect(result.sources.fullName).toBe('ai');
    expect(result.sources.rut).toBe('contact');
    expect(result.conflicts).toContain('fullName');
    expect(result.conflicts).toContain('downPayment');
  });
});
