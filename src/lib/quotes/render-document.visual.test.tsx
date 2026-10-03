import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, test, vi } from 'vitest';

import type { QuotationDocumentData } from './types';
import { QuotationDocument } from '@/components/quotes/quotation-document';

vi.mock('server-only', () => ({}));

const runVisual = process.env.RENDER_QUOTE_SAMPLE === '1';

function vehiclePlaceholder(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f8f9fd"/><stop offset="1" stop-color="#e8eaf2"/></linearGradient></defs>
    <rect width="900" height="520" rx="34" fill="url(#g)"/>
    <path d="M195 316h510l-35-105c-12-35-43-57-80-57H347c-38 0-72 24-84 60l-36 102Z" fill="#24283c"/>
    <path d="M310 218h278c20 0 36 9 43 28l18 54H263l20-56c5-16 13-26 27-26Z" fill="#9ca3b7"/>
    <rect x="173" y="294" width="554" height="104" rx="38" fill="#171a2b"/>
    <circle cx="292" cy="397" r="54" fill="#0b0d18"/><circle cx="292" cy="397" r="27" fill="#a8adbd"/>
    <circle cx="618" cy="397" r="54" fill="#0b0d18"/><circle cx="618" cy="397" r="27" fill="#a8adbd"/>
    <rect x="198" y="320" width="88" height="32" rx="12" fill="#fafafa"/><rect x="616" y="320" width="88" height="32" rx="12" fill="#fafafa"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function companyLogoPlaceholder(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180" viewBox="0 0 760 180">
    <circle cx="82" cy="90" r="66" fill="none" stroke="#ffffff" stroke-width="12"/>
    <text x="82" y="115" fill="#ffffff" font-family="Arial,sans-serif" font-size="76" font-weight="800" text-anchor="middle">S</text>
    <text x="174" y="78" fill="#ffffff" font-family="Arial,sans-serif" font-size="48" font-weight="800">SALGADO</text>
    <text x="174" y="132" fill="#c4b5fd" font-family="Arial,sans-serif" font-size="35" font-weight="700">AUTOMOTRIZ</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function sample(): QuotationDocumentData {
  const now = new Date().toISOString();
  return {
    quotation: {
      id: '00000000-0000-4000-8000-000000000001',
      accountId: '00000000-0000-4000-8000-000000000002',
      quoteNumber: 'NX-000058',
      sequenceNumber: 58,
      currentVersion: 1,
      status: 'generated',
      contactId: null,
      conversationId: null,
      catalogItemId: null,
      executiveUserId: null,
      executiveName: 'Nicolás Salgado',
      executivePhone: '+56 9 8764 8929',
      executiveEmail: 'ventas@nexoracrm.cl',
      clientName: 'Juan Pérez Soto',
      clientRut: '12.345.678-9',
      clientPhone: '+56 9 8765 4321',
      clientEmail: 'juanperez@email.com',
      clientCity: 'Santiago',
      vehicleMake: 'Ford',
      vehicleModel: 'Ranger XLT 4x4',
      vehicleVersion: '3.2 Diésel Automática',
      vehicleYear: 2022,
      vehicleColor: 'Gris',
      vehicleFuel: 'Diésel',
      vehicleTransmission: 'Automática',
      vehicleDrivetrain: '4x4',
      vehicleMileageKm: 48000,
      vehiclePlate: '',
      vehicleImageUrl: vehiclePlaceholder(),
      purchaseType: 'financed',
      listPrice: 22990000,
      discountAmount: 1000000,
      finalPrice: 21990000,
      downPayment: 4500000,
      financedExpenses: 0,
      amountToFinance: 17490000,
      issueDate: '2026-08-01',
      validUntil: '2026-09-01',
      documentNotes: '',
      internalNotes: '',
      termsText:
        'Cotización referencial sujeta a disponibilidad del vehículo, evaluación crediticia y aprobación de la entidad financiera.',
      messageText: 'Hola Juan, te comparto la cotización NX-000058.',
      generatedAt: now,
      lastSentAt: null,
      deletionHold: false,
      deletionHoldReason: null,
      scheduledDeletionAt: null,
      createdByUserId: '00000000-0000-4000-8000-000000000003',
      updatedByUserId: '00000000-0000-4000-8000-000000000003',
      createdAt: now,
      updatedAt: now,
      installments: [
        {
          termMonths: 24,
          monthlyPayment: 890000,
          observation: 'Referencial',
          sortOrder: 0,
        },
        {
          termMonths: 36,
          monthlyPayment: 655000,
          observation: 'Referencial',
          sortOrder: 1,
        },
        {
          termMonths: 48,
          monthlyPayment: 540000,
          observation: 'Referencial',
          sortOrder: 2,
        },
        {
          termMonths: 60,
          monthlyPayment: 470000,
          observation: 'Referencial',
          sortOrder: 3,
        },
      ],
    },
    settings: {
      accountId: '00000000-0000-4000-8000-000000000002',
      companyDisplayName: 'Salgado Automotriz',
      companyRut: '76.123.456-7',
      companyPhone: '+56 9 8764 8929',
      companyEmail: 'ventas@nexoracrm.cl',
      companyAddress: 'Santiago, Chile',
      logoUrl: null,
      accountLogoUrl: companyLogoPlaceholder(),
      primaryColor: '#6d28d9',
      accentColor: '#8b5cf6',
      quotePrefix: 'NX',
      sequenceDigits: 6,
      nextSequence: 59,
      defaultValidityDays: 30,
      currencyCode: 'CLP',
      defaultTerms: 'Documento referencial.',
      messageTemplate: 'Hola {{cliente}}, te comparto {{numero}}.',
      defaultAttachmentFormat: 'pdf',
      showClientRut: true,
      showClientEmail: true,
      showVehiclePlate: false,
      showExecutivePhone: true,
      showExecutiveEmail: true,
    },
    executive: {
      name: 'Nicolás Salgado',
      phone: '+56 9 8764 8929',
      email: 'ventas@nexoracrm.cl',
    },
    installments: [
      {
        termMonths: 24,
        monthlyPayment: 890000,
        observation: 'Referencial',
        sortOrder: 0,
      },
      {
        termMonths: 36,
        monthlyPayment: 655000,
        observation: 'Referencial',
        sortOrder: 1,
      },
      {
        termMonths: 48,
        monthlyPayment: 540000,
        observation: 'Referencial',
        sortOrder: 2,
      },
      {
        termMonths: 60,
        monthlyPayment: 470000,
        observation: 'Referencial',
        sortOrder: 3,
      },
    ],
    generatedAt: now,
  };
}

describe.skipIf(!runVisual)('quotation document visual artifact', () => {
  test('renders inspectable PDF and PNG artifacts', async () => {
    const { renderQuotationArtifacts } = await import('./render-document');
    const markup = renderToStaticMarkup(<QuotationDocument data={sample()} />);
    const nexoraLogo = await readFile(
      path.join(
        process.cwd(),
        'public',
        'brand',
        'nexora-transparent-lockup.png'
      )
    );
    const server = createServer((request, response) => {
      if (request.url === '/brand/nexora-transparent-lockup.png') {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(nexoraLogo);
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;font-family:Inter,Arial,sans-serif}</style></head><body>${markup}</body></html>`
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address() as AddressInfo;
    let artifacts: Awaited<ReturnType<typeof renderQuotationArtifacts>>;
    try {
      artifacts = await renderQuotationArtifacts({
        url: `http://127.0.0.1:${address.port}`,
        cookieHeader: '',
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    const outputDir = path.join(process.cwd(), 'tmp', 'pdfs');
    await mkdir(outputDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputDir, 'quotation-sample.pdf'), artifacts.pdf),
      writeFile(path.join(outputDir, 'quotation-sample.png'), artifacts.png),
    ]);
    expect(artifacts.pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(artifacts.png.subarray(1, 4).toString()).toBe('PNG');
  }, 60_000);

  afterAll(async () => {
    const activeBrowser = globalThis.__nexoraQuotationBrowser;
    if (activeBrowser) await (await activeBrowser).close();
    globalThis.__nexoraQuotationBrowser = undefined;
  });
});
