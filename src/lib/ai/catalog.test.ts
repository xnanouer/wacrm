import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: vi.fn(),
}));

import {
  buildCatalogCaption,
  buildCatalogContext,
  buildCatalogSummary,
  hasCatalogCardsInConversation,
  isCatalogMediaRequest,
  isCatalogRequest,
  isCatalogSelection,
  parseCatalogDownPayment,
  parseCatalogMaxPrice,
  rankCatalogCandidates,
  selectPreviouslyShownCandidate,
  type AiCatalogCandidate,
} from './catalog';

function candidate(
  overrides: Partial<AiCatalogCandidate> = {}
): AiCatalogCandidate {
  return {
    id: 'vehicle-1',
    title: 'Toyota RAV4 2024',
    description: 'SUV familiar',
    make: 'Toyota',
    model: 'RAV4',
    version: 'Limited',
    year: 2024,
    color: 'Blanco',
    engine: '2.5',
    fuel: 'Híbrido',
    transmission: 'Automática',
    drivetrain: 'AWD',
    mileage: 12_000,
    listPrice: 28_000_000,
    offerPrice: 26_990_000,
    displayedPrice: 26_990_000,
    minimumDownPayment: 5_000_000,
    financingText: 'Financiamiento sujeto a evaluación.',
    location: 'Santiago',
    licensePlate: 'ABCD12',
    licensePlateVisible: false,
    primaryImagePath: 'account/vehicle/photo.webp',
    imagePaths: ['account/vehicle/photo.webp'],
    updatedAt: '2026-07-28T12:00:00.000Z',
    ...overrides,
  };
}

describe('AI catalog request detection', () => {
  it('recognizes natural vehicle and catalog requests', () => {
    expect(isCatalogRequest('¿Me puedes enviar el catálogo?')).toBe(true);
    expect(isCatalogRequest('Muéstrame camionetas diésel 4x4')).toBe(true);
    expect(isCatalogRequest('¿Tienen Hyundai Tucson disponible?')).toBe(true);
    expect(isCatalogRequest('Envíame fotos del BAIC X55')).toBe(true);
    expect(isCatalogRequest('Mándame fotos de los vehículos disponibles')).toBe(
      true
    );
    expect(isCatalogRequest('¿Cuál es el pie inicial del BAIC X55?')).toBe(
      true
    );
    expect(isCatalogRequest('Hola, necesito ayuda con mi cuenta')).toBe(false);
  });

  it('distinguishes a photo request from a catalog summary request', () => {
    expect(isCatalogMediaRequest('¿Me puedes enviar el catálogo?')).toBe(false);
    expect(isCatalogMediaRequest('Mándame fotos del BAIC X55')).toBe(true);
    expect(isCatalogMediaRequest('Muéstrame la galería del segundo')).toBe(
      true
    );
    expect(isCatalogMediaRequest('Todavía no me envíes fotos')).toBe(false);
  });

  it('opens the catalog for a concrete body-type request', () => {
    expect(isCatalogRequest('Hola, quiero comprar un auto')).toBe(false);
    expect(isCatalogRequest('Me interesa un SUV')).toBe(true);
    expect(isCatalogRequest('Busco una camioneta')).toBe(true);
    expect(isCatalogRequest('Busco un BAIC X55')).toBe(false);
    expect(isCatalogRequest('Me interesa el BMW')).toBe(false);
    expect(isCatalogRequest('¿Qué tipo de camioneta me recomiendas?')).toBe(
      false
    );
    expect(isCatalogRequest('¡Qué bueno!')).toBe(false);
    expect(isCatalogRequest('Todavía no me envíes el catálogo')).toBe(false);
  });

  it('does not confuse general financing or support questions with catalog requests', () => {
    expect(
      isCatalogRequest('¿Cuáles son los requisitos para el financiamiento?')
    ).toBe(false);
    expect(
      isCatalogRequest('¿Qué documentos necesito para pedir financiamiento?')
    ).toBe(false);
    expect(isCatalogRequest('Envíame la dirección, por favor')).toBe(false);
    expect(isCatalogRequest('¿Cuál es el precio?')).toBe(false);

    expect(isCatalogRequest('¿Cuál es el precio del Mercedes?')).toBe(true);
    expect(isCatalogRequest('Envíame opciones de vehículos')).toBe(true);
  });

  it('treats interest as a selection only after catalog cards were shown', () => {
    expect(isCatalogRequest('Me interesa el BAIC X55')).toBe(false);
    expect(
      isCatalogRequest('Me interesa el BAIC X55', { allowSelection: true })
    ).toBe(true);
    expect(
      hasCatalogCardsInConversation([
        {
          role: 'assistant',
          content: 'BAIC X55\nValor vehículo: $10.990.000',
        },
      ])
    ).toBe(true);
    expect(isCatalogSelection('2')).toBe(true);
    expect(isCatalogSelection('el segundo')).toBe(true);
    expect(isCatalogRequest('2', { allowSelection: true })).toBe(true);
    expect(
      isCatalogRequest('Mándame fotos del segundo', { allowSelection: true })
    ).toBe(true);
  });

  it('understands common Chilean maximum-price formats', () => {
    expect(parseCatalogMaxPrice('Busco un auto hasta 20 millones')).toBe(
      20_000_000
    );
    expect(parseCatalogMaxPrice('Presupuesto $15.000.000')).toBe(15_000_000);
    expect(parseCatalogMaxPrice('Precio máximo de 12,5 millones')).toBe(
      12_500_000
    );
  });

  it('understands common Chilean down-payment formats', () => {
    expect(parseCatalogDownPayment('Tengo 3 millones para el pie')).toBe(
      3_000_000
    );
    expect(parseCatalogDownPayment('Pie disponible: $1.500.000')).toBe(
      1_500_000
    );
    expect(parseCatalogDownPayment('Cuento con 2500 lucas de pie')).toBe(
      2_500_000
    );
    expect(parseCatalogDownPayment('Mi presupuesto es 15 millones')).toBeNull();
    expect(
      isCatalogRequest('Tengo 3 millones para el pie', {
        allowSelection: true,
      })
    ).toBe(true);
  });
});

describe('AI catalog ranking and privacy', () => {
  it('filters explicit requirements and returns the most relevant items', () => {
    const diesel = candidate({
      id: 'diesel',
      make: 'Ford',
      model: 'Ranger',
      fuel: 'Diésel',
      transmission: 'Automática',
      displayedPrice: 24_000_000,
    });
    const expensive = candidate({
      id: 'expensive',
      make: 'Ford',
      model: 'Ranger Raptor',
      fuel: 'Diésel',
      displayedPrice: 55_000_000,
    });
    const hybrid = candidate();

    expect(
      rankCatalogCandidates(
        [hybrid, expensive, diesel],
        'Busco Ford diésel automática hasta 30 millones',
        3
      ).map((item) => item.id)
    ).toEqual(['diesel']);
  });

  it('matches the requested model, price and confirmed minimum down payment', () => {
    const morning = candidate({
      id: 'morning',
      make: 'Kia',
      model: 'Morning',
      displayedPrice: 7_900_000,
      minimumDownPayment: 1_500_000,
    });
    const expensiveMorning = candidate({
      id: 'expensive-morning',
      make: 'Kia',
      model: 'Morning',
      displayedPrice: 9_500_000,
      minimumDownPayment: 1_500_000,
    });
    const highDownPayment = candidate({
      id: 'high-down-payment',
      make: 'Kia',
      model: 'Morning',
      displayedPrice: 7_500_000,
      minimumDownPayment: 3_000_000,
    });
    const unrelated = candidate({
      id: 'tucson',
      make: 'Hyundai',
      model: 'Tucson',
      displayedPrice: 7_500_000,
      minimumDownPayment: null,
    });

    expect(
      rankCatalogCandidates(
        [unrelated, highDownPayment, expensiveMorning, morning],
        'Muéstrame un Kia Morning hasta 8 millones, tengo 2 millones para el pie',
        5
      ).map((item) => item.id)
    ).toEqual(['morning']);
  });

  it('returns only SUVs for an SUV request and prefers matches with photos', () => {
    const spresso = candidate({
      id: 'spresso',
      make: 'Suzuki',
      model: 'Spresso',
      title: 'Suzuki Spresso 2022',
      description: '',
      imagePaths: ['spresso.webp'],
      updatedAt: '2026-10-27T12:00:00.000Z',
    });
    const cla = candidate({
      id: 'cla',
      make: 'Mercedes-Benz',
      model: 'CLA 250',
      title: 'Mercedes-Benz CLA 250 2014',
      description: '',
    });
    const trackerWithoutPhotos = candidate({
      id: 'tracker-text',
      make: 'Chevrolet',
      model: 'Tracker',
      title: 'Chevrolet Tracker 2022',
      description: '',
      imagePaths: [],
      primaryImagePath: null,
      updatedAt: '2026-10-27T13:00:00.000Z',
    });
    const coolrayWithPhotos = candidate({
      id: 'coolray-photo',
      make: 'Geely',
      model: 'New Coolray',
      title: 'Geely New Coolray 2025',
      description: '',
      imagePaths: ['coolray.webp'],
      primaryImagePath: 'coolray.webp',
      updatedAt: '2026-10-20T13:00:00.000Z',
    });

    expect(
      rankCatalogCandidates(
        [spresso, cla, trackerWithoutPhotos, coolrayWithPhotos],
        'Busco un SUV',
        5
      ).map((item) => item.id)
    ).toEqual(['coolray-photo', 'tracker-text']);
  });

  it('omits unknown zero mileage from catalog messages', () => {
    const unknownMileage = candidate({ mileage: 0 });

    expect(buildCatalogSummary([unknownMileage])).not.toContain('0 km');
    expect(buildCatalogCaption(unknownMileage)).not.toContain('0 km');
    expect(buildCatalogContext([unknownMileage])).not.toContain('Kilometraje: 0');
  });

  it('does not substitute another brand when the requested one is unavailable', () => {
    expect(
      rankCatalogCandidates(
        [candidate({ make: 'BAIC', model: 'X55' })],
        'Busco un Hyundai Tucson',
        3
      )
    ).toEqual([]);
  });

  it('returns available vehicles for a general photo request', () => {
    const older = candidate({
      id: 'older',
      make: 'BAIC',
      model: 'X55',
      updatedAt: '2026-07-01T12:00:00.000Z',
    });
    const newer = candidate({
      id: 'newer',
      make: 'BMW',
      model: 'I180',
      updatedAt: '2026-07-02T12:00:00.000Z',
    });

    expect(
      rankCatalogCandidates(
        [older, newer],
        'Mándame fotos de los vehículos disponibles',
        3
      ).map((item) => item.id)
    ).toEqual(['newer', 'older']);
  });

  it('returns only the named vehicle for a specific photo request', () => {
    const baic = candidate({ id: 'baic', make: 'BAIC', model: 'X55' });
    const bmw = candidate({ id: 'bmw', make: 'BMW', model: 'I180' });

    expect(
      rankCatalogCandidates([baic, bmw], 'Envíame fotos del BMW I180', 3).map(
        (item) => item.id
      )
    ).toEqual(['bmw']);
  });

  it('resolves a named or ordinal choice to one previously shown vehicle', () => {
    const baic = candidate({ id: 'baic', make: 'BAIC', model: 'X55' });
    const bmw = candidate({ id: 'bmw', make: 'BMW', model: 'I180' });
    const history = [
      {
        role: 'assistant' as const,
        content:
          '[Catálogo mostrado por Nexora: 1. BAIC X55 2022; 2. BMW I180 2021]',
      },
    ];

    expect(
      selectPreviouslyShownCandidate([baic, bmw], history, 'Me interesa el BMW')
        ?.id
    ).toBe('bmw');
    expect(
      selectPreviouslyShownCandidate([baic, bmw], history, 'Quiero el segundo')
        ?.id
    ).toBe('bmw');
  });

  it('does not expose a hidden license plate in prompt context or captions', () => {
    const hidden = candidate();
    expect(buildCatalogContext([hidden])).not.toContain('ABCD12');
    expect(buildCatalogCaption(hidden)).not.toContain('ABCD12');

    const visible = candidate({ licensePlateVisible: true });
    expect(buildCatalogCaption(visible)).toContain('ABCD12');
  });

  it('includes the complete commercial vehicle information in the WhatsApp card', () => {
    const caption = buildCatalogCaption(candidate());
    expect(caption).toContain('Valor vehículo: $26.990.000');
    expect(caption).toContain('Precio lista: $28.000.000');
    expect(caption).toContain('Pie inicial desde: $5.000.000');
    expect(caption).toContain('Motor: 2.5');
    expect(caption).toContain('Color: Blanco');
    expect(caption).toContain('Financiamiento sujeto a evaluación.');
  });

  it('builds a numbered summary that asks the customer to choose before photos', () => {
    const summary = buildCatalogSummary([
      candidate({ id: 'baic', make: 'BAIC', model: 'X55' }),
      candidate({ id: 'bmw', make: 'BMW', model: 'I180' }),
    ]);

    expect(summary).toContain('Vehículos disponibles');
    expect(summary).toContain('1. *BAIC X55 Limited*');
    expect(summary).toContain('2. *BMW I180 Limited*');
    expect(summary).toContain('número o modelo');
    expect(
      hasCatalogCardsInConversation([{ role: 'assistant', content: summary }])
    ).toBe(true);
  });

  it('offers more information instead of promising missing photos', () => {
    const summary = buildCatalogSummary([
      candidate({
        primaryImagePath: null,
        imagePaths: [],
      }),
    ]);

    expect(summary).toContain('te comparto más información');
    expect(summary).not.toContain('te envío sus fotos');
  });
});
