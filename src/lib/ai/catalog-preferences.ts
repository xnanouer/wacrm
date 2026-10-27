function normalizedMoneyText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function parseClpAmount(raw: string, suffix?: string): number | null {
  const normalizedSuffix = suffix?.toLocaleLowerCase('es') ?? '';
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;

  let amount: number;
  if (/^(millon(?:es)?|palo(?:s)?|m)$/.test(normalizedSuffix)) {
    amount = Number(raw.replace(/\./g, '').replace(',', '.')) * 1_000_000;
  } else if (/^luca(?:s)?$/.test(normalizedSuffix)) {
    amount = Number(raw.replace(/\./g, '').replace(',', '.')) * 1_000;
  } else {
    amount = Number(digitsOnly);
    // In Chile, a small number inside an explicit budget or down-payment
    // phrase normally refers to millions (for example, "pie de 2").
    if (amount > 0 && amount < 1_000) amount *= 1_000_000;
  }

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

const AMOUNT_PATTERN = '([\\d.,]+)\\s*(millones?|palos?|lucas?|m)?';

export function parseCatalogMaxPrice(message: string): number | null {
  const normalized = normalizedMoneyText(message);
  const match = normalized.match(
    new RegExp(
      `\\b(?:hasta|maximo|menos de|menor a|bajo|presupuesto(?: de)?|precio(?: maximo)?(?: de)?)\\s*\\$?\\s*${AMOUNT_PATTERN}\\b`
    )
  );
  return match ? parseClpAmount(match[1], match[2]) : null;
}

export function parseCatalogDownPayment(message: string): number | null {
  const normalized = normalizedMoneyText(message);
  const beforeAmount = normalized.match(
    new RegExp(
      `\\b(?:pie|enganche)(?:\\s+disponible)?(?:\\s+(?:de|es))?\\s*[:=-]?\\s*\\$?\\s*${AMOUNT_PATTERN}\\b`
    )
  );
  if (beforeAmount) return parseClpAmount(beforeAmount[1], beforeAmount[2]);

  const afterAmount = normalized.match(
    new RegExp(
      `\\b(?:tengo|cuento con|dispongo de|con)?\\s*\\$?\\s*${AMOUNT_PATTERN}\\s+(?:para|de|como)\\s+(?:el\\s+)?(?:pie|enganche)\\b`
    )
  );
  return afterAmount ? parseClpAmount(afterAmount[1], afterAmount[2]) : null;
}

export function formatCatalogClpPreference(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}
