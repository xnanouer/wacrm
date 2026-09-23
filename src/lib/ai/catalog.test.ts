import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/whatsapp/send-message', () => ({
  sendMessageToConversation: vi.fn(),
}));

import {
  buildCatalogCaption,
  buildCatalogContext,
  hasCatalogCardsInConversation,
  isCatalogRequest,
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
    expect(isCatalogRequest('¿Cuál es el pie inicial del BAIC X55?')).toBe(
      true
    );
    expect(isCatalogRequest('Hola, necesito ayuda con mi cuenta')).toBe(false);
  });

  it('does not send cards for early, generic vehicle interest', () => {
    expect(isCatalogRequest('Hola, quiero comprar un auto')).toBe(false);
    expect(isCatalogRequest('Me interesa un SUV')).toBe(false);
    expect(isCatalogRequest('Busco un BAIC X55')).toBe(false);
    expect(isCatalogRequest('Me interesa el BMW')).toBe(false);
    expect(isCatalogRequest('¿Qué tipo de camioneta me recomiendas?')).toBe(
      false
    );
    expect(isCatalogRequest('¡Qué bueno!')).toBe(false);
    expect(isCatalogRequest('Todavía no me envíes el catálogo')).toBe(false);
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
  });

  it('understands common Chilean maximum-price formats', () => {
    expect(parseCatalogMaxPrice('Busco un auto hasta 20 millones')).toBe(
      20_000_000
    );
    expect(parseCatalogMaxPrice('Presupuesto $15.000.000')).toBe(15_000_000);
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

  it('does not substitute another brand when the requested one is unavailable', () => {
    expect(
      rankCatalogCandidates(
        [candidate({ make: 'BAIC', model: 'X55' })],
        'Busco un Hyundai Tucson',
        3
      )
    ).toEqual([]);
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
});
