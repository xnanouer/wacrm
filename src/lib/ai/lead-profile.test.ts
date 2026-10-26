import { describe, expect, it } from 'vitest';

import {
  buildLeadProfileExtractionPrompt,
  buildLeadQualificationContext,
  extractDeterministicLeadProfilePatch,
  extractLeadProfilePatch,
  formatChileanRut,
  normalizeDocumentFullName,
  parseLeadProfileJson,
  sanitizeLeadProfilePatch,
  shouldExtractLeadProfile,
  stripLeadProfileBlock,
} from './lead-profile';
import type { ConversationLeadProfile } from './types';

function profile(
  overrides: Partial<ConversationLeadProfile> = {}
): ConversationLeadProfile {
  return {
    id: null,
    account_id: 'account-1',
    conversation_id: 'conversation-1',
    contact_id: 'contact-1',
    full_name: 'Ana Pérez',
    rut: null,
    phone: '+56911112222',
    email: null,
    address: null,
    commune: null,
    city: null,
    region: null,
    occupation: null,
    company: null,
    monthly_income: null,
    vehicle_interest: 'BAIC X55',
    vehicle_plate: null,
    vehicle_price: null,
    down_payment: null,
    payment_method: null,
    income_proof: null,
    employment_type: null,
    employment_tenure: null,
    has_dicom: null,
    trade_in: null,
    trade_in_vehicle: null,
    purchase_timeline: null,
    financing_requested: true,
    captured_by_ai: true,
    updated_at: null,
    ...overrides,
  };
}

describe('AI lead profile', () => {
  it('accepts only supported, explicitly typed fields', () => {
    expect(
      sanitizeLeadProfilePatch({
        full_name: '  Ana   Pérez  ',
        has_dicom: false,
        income_proof: 'sí',
        internal_secret: 'ignore',
      })
    ).toEqual({ full_name: 'Ana Pérez', has_dicom: false });
  });

  it('accepts only Chilean RUTs with a valid verifier digit', () => {
    expect(formatChileanRut('17955246-9')).toBe('17.955.246-9');
    expect(sanitizeLeadProfilePatch({ rut: '17.955.246-9' })).toEqual({
      rut: '17.955.246-9',
    });
    expect(sanitizeLeadProfilePatch({ rut: 'Si demole' })).toEqual({});
    expect(sanitizeLeadProfilePatch({ rut: '17.955.246-8' })).toEqual({});
  });

  it('captures a valid RUT and an explicitly stated full name deterministically', () => {
    expect(
      extractDeterministicLeadProfilePatch(
        'Mi nombre completo es Carlos Alberto Soto y mi RUT es 17.955.246-9'
      )
    ).toEqual({
      rut: '17.955.246-9',
      full_name: 'Carlos Alberto Soto',
    });
    expect(
      extractDeterministicLeadProfilePatch('Mi teléfono es 56936200994')
    ).toEqual({});
  });

  it('accepts a compact RUT only when the customer identifies it as a RUT', () => {
    expect(extractDeterministicLeadProfilePatch('Mi RUT es 179552469')).toEqual(
      { rut: '17.955.246-9' }
    );
    expect(extractDeterministicLeadProfilePatch('RUT: 179552469')).toEqual({
      rut: '17.955.246-9',
    });
    expect(extractDeterministicLeadProfilePatch('179552469')).toEqual({});
    expect(extractDeterministicLeadProfilePatch('Mi RUT es 179552468')).toEqual(
      {}
    );
  });

  it('requires at least a name and surname for document-derived names', () => {
    expect(normalizeDocumentFullName('EEPB')).toBeNull();
    expect(normalizeDocumentFullName('CARLOS ALBERTO SOTO PÉREZ')).toBe(
      'CARLOS ALBERTO SOTO PÉREZ'
    );
    expect(normalizeDocumentFullName('Certificado 2026')).toBeNull();
  });

  it('extracts and removes the private machine block', () => {
    const raw =
      'Gracias, Ana.\n[[LEAD_PROFILE]]{"city":"Temuco","trade_in":false}[[/LEAD_PROFILE]]';
    expect(extractLeadProfilePatch(raw)).toEqual({
      city: 'Temuco',
      trade_in: false,
    });
    expect(stripLeadProfileBlock(raw)).toBe('Gracias, Ana.');
  });

  it('parses a fenced fallback extractor response and rejects unsupported fields', () => {
    expect(
      parseLeadProfileJson(
        '```json\n{"profile":{"city":"Santiago","financing_requested":true,"approval":"yes"}}\n```'
      )
    ).toEqual({ city: 'Santiago', financing_requested: true });
  });

  it('detects qualification answers that need the fallback extractor', () => {
    expect(
      shouldExtractLeadProfile([
        { role: 'assistant', content: '¿En qué ciudad o comuna estás?' },
        { role: 'user', content: 'Estoy en Santiago.' },
      ])
    ).toBe(true);
    expect(
      shouldExtractLeadProfile([
        { role: 'assistant', content: 'Gracias por escribir.' },
        { role: 'user', content: 'Hola' },
      ])
    ).toBe(false);
  });

  it('builds a strict JSON-only extraction prompt with existing facts', () => {
    const prompt = buildLeadProfileExtractionPrompt(
      profile({ city: 'Santiago' }),
      ['ciudad o comuna', 'vehículo que busca']
    );
    expect(prompt).toContain('objeto JSON válido');
    expect(prompt).toContain('"city":"Santiago"');
    expect(prompt).toContain('Si no hay datos nuevos confirmados, devuelve {}');
  });

  it('does not repeat confirmed information or expose sensitive data', () => {
    const context = buildLeadQualificationContext(profile(), [
      'nombre completo',
      'RUT para financiamiento',
    ]);
    expect(context).toContain('Nombre completo: Ana Pérez');
    expect(context).toContain('Vehículo que busca: BAIC X55');
    expect(context).toContain('no vuelvas a preguntarlos');
    expect(context).toContain('no los repitas completos');
    expect(context).toContain('agrega obligatoriamente un bloque interno');
  });

  it('does not present a malformed stored RUT as confirmed', () => {
    const context = buildLeadQualificationContext(
      profile({ rut: 'Si demole' }),
      ['RUT para financiamiento']
    );
    expect(context).toContain('RUT: sin confirmar');
    expect(context).not.toContain('RUT: Si demole');
  });
});
