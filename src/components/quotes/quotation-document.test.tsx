import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuotationDocument } from './quotation-document';
import type { QuotationDocumentData } from '@/lib/quotes/types';

function documentData(): QuotationDocumentData {
  const now = '2026-08-01T12:00:00.000Z';
  const installments = Array.from({ length: 8 }, (_, index) => ({
    termMonths: (index + 1) * 12,
    monthlyPayment: 1_000_000 - index * 50_000,
    observation: 'Referencial',
    sortOrder: index,
  }));
  return {
    quotation: {
      id: 'quote-1',
      accountId: 'account-1',
      quoteNumber: 'NX-000001',
      sequenceNumber: 1,
      currentVersion: 1,
      status: 'generated',
      contactId: null,
      conversationId: null,
      catalogItemId: null,
      executiveUserId: null,
      executiveName: 'Ejecutiva Nexora',
      executivePhone: '+56 9 1111 1111',
      executiveEmail: 'ventas@nexora.cl',
      clientName: 'Cliente de prueba',
      clientRut: '12.345.678-5',
      clientPhone: '+56 9 2222 2222',
      clientEmail: 'cliente@ejemplo.cl',
      clientCity: 'Santiago',
      vehicleMake: 'Ford',
      vehicleModel: 'Ranger',
      vehicleVersion: 'XLT',
      vehicleYear: 2024,
      vehicleColor: 'Gris',
      vehicleFuel: 'Diésel',
      vehicleTransmission: 'Automática',
      vehicleDrivetrain: '4x4',
      vehicleMileageKm: 1000,
      vehiclePlate: 'ABCD12',
      vehicleImageUrl: '',
      documentTemplate: 'classic',
      purchaseType: 'financed',
      listPrice: 20_000_000,
      discountAmount: 1_000_000,
      finalPrice: 19_000_000,
      downPayment: 5_000_000,
      financedExpenses: 0,
      amountToFinance: 14_000_000,
      issueDate: '2026-08-01',
      validUntil: '2026-08-31',
      documentNotes: '',
      internalNotes: '',
      termsText: 'Documento referencial.',
      messageText: 'Te comparto la cotización.',
      installments,
      generatedAt: now,
      lastSentAt: null,
      deletionHold: false,
      deletionHoldReason: null,
      scheduledDeletionAt: null,
      createdByUserId: 'user-1',
      updatedByUserId: 'user-1',
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      accountId: 'account-1',
      quotePrefix: 'NX',
      sequenceDigits: 6,
      nextSequence: 2,
      defaultValidityDays: 30,
      currencyCode: 'CLP',
      companyDisplayName: 'Nexora CRM',
      companyRut: null,
      companyPhone: null,
      companyEmail: null,
      companyAddress: null,
      logoUrl: null,
      accountLogoUrl: null,
      primaryColor: '#6d28d9',
      accentColor: '#8b5cf6',
      showClientRut: false,
      showClientEmail: false,
      showVehiclePlate: false,
      showExecutivePhone: true,
      showExecutiveEmail: true,
      defaultTerms: 'Documento referencial.',
      messageTemplate: 'Hola {{cliente}}.',
      defaultAttachmentFormat: 'pdf',
    },
    executive: {
      name: 'Ejecutiva Nexora',
      phone: '+56 9 1111 1111',
      email: 'ventas@nexora.cl',
    },
    installments,
    generatedAt: now,
  };
}

describe('QuotationDocument', () => {
  it('moves additional installments to a continuation page', () => {
    const html = renderToStaticMarkup(
      <QuotationDocument data={documentData()} includeStyles={false} />
    );
    expect((html.match(/quote-page/g) ?? []).length).toBe(2);
    expect(html).toContain('continuación');
    expect(html).toContain('96 cuotas');
  });

  it('honors account visibility settings', () => {
    const html = renderToStaticMarkup(
      <QuotationDocument data={documentData()} includeStyles={false} />
    );
    expect(html).not.toContain('12.345.678-5');
    expect(html).not.toContain('cliente@ejemplo.cl');
    expect(html).not.toContain('ABCD12');
  });

  it('co-brands the document with Nexora and the issuing company', () => {
    const data = documentData();
    data.settings.companyDisplayName = 'Salgado Automotriz';
    data.settings.accountLogoUrl = 'https://example.com/salgado-logo.png';
    const html = renderToStaticMarkup(
      <QuotationDocument data={data} includeStyles={false} />
    );

    expect(html).toContain('/brand/nexora-transparent-lockup.png');
    expect(html).toContain('https://example.com/salgado-logo.png');
    expect(html).toContain('alt="Salgado Automotriz"');
  });

  it('uses the company name when the issuer has no logo', () => {
    const data = documentData();
    data.settings.companyDisplayName = 'Empresa sin logo';
    const html = renderToStaticMarkup(
      <QuotationDocument data={data} includeStyles={false} />
    );

    expect(html).toContain('/brand/nexora-transparent-lockup.png');
    expect(html).toContain('<strong>Empresa sin logo</strong>');
  });

  it('renders the premium design with the selected vehicle and issuer images', () => {
    const data = documentData();
    data.quotation.documentTemplate = 'showcase';
    data.quotation.vehicleImageUrl = 'https://example.com/vehicle.jpg';
    data.settings.accountLogoUrl = 'https://example.com/company.png';
    const html = renderToStaticMarkup(
      <QuotationDocument data={data} includeStyles={false} />
    );

    expect(html).toContain('showcase-document');
    expect(html).toContain('showcase-header');
    expect(html).toContain('https://example.com/vehicle.jpg');
    expect(html).toContain('https://example.com/company.png');
  });
});
