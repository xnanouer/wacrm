import { describe, expect, it } from 'vitest';

import {
  buildLeadQualificationContext,
  extractLeadProfilePatch,
  sanitizeLeadProfilePatch,
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
    city: null,
    vehicle_interest: 'BAIC X55',
    down_payment: null,
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

  it('extracts and removes the private machine block', () => {
    const raw =
      'Gracias, Ana.\n[[LEAD_PROFILE]]{"city":"Temuco","trade_in":false}[[/LEAD_PROFILE]]';
    expect(extractLeadProfilePatch(raw)).toEqual({
      city: 'Temuco',
      trade_in: false,
    });
    expect(stripLeadProfileBlock(raw)).toBe('Gracias, Ana.');
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
  });
});
