import { parseCatalogVehicleInput } from './payload';
import type { CatalogVehicleInput } from './types';

export const CATALOG_IMPORT_MAX_ROWS = 200;

export const CATALOG_IMPORT_HEADERS = [
  'codigo_interno',
  'patente',
  'mostrar_patente',
  'marca',
  'modelo',
  'version',
  'año',
  'color',
  'motor',
  'combustible',
  'transmision',
  'traccion',
  'kilometraje',
  'precio_lista',
  'precio_oferta',
  'pie_minimo',
  'texto_financiamiento',
  'descripcion',
  'ubicacion',
] as const;

type ImportField =
  | 'internalCode'
  | 'licensePlate'
  | 'licensePlateVisible'
  | 'make'
  | 'model'
  | 'version'
  | 'year'
  | 'color'
  | 'engine'
  | 'fuel'
  | 'transmission'
  | 'drivetrain'
  | 'mileage'
  | 'listPrice'
  | 'offerPrice'
  | 'minimumDownPayment'
  | 'financingText'
  | 'description'
  | 'location';

export interface CatalogImportRow {
  rowNumber: number;
  input: CatalogVehicleInput;
}

export interface CatalogImportIssue {
  rowNumber?: number;
  message: string;
}

export interface CatalogImportResult {
  rows: CatalogImportRow[];
  issues: CatalogImportIssue[];
}

const HEADER_ALIASES: Record<string, ImportField> = {
  codigo: 'internalCode',
  codigo_interno: 'internalCode',
  internal_code: 'internalCode',
  patente: 'licensePlate',
  license_plate: 'licensePlate',
  mostrar_patente: 'licensePlateVisible',
  patente_visible: 'licensePlateVisible',
  marca: 'make',
  make: 'make',
  modelo: 'model',
  model: 'model',
  version: 'version',
  ano: 'year',
  year: 'year',
  color: 'color',
  motor: 'engine',
  engine: 'engine',
  combustible: 'fuel',
  fuel: 'fuel',
  transmision: 'transmission',
  transmission: 'transmission',
  traccion: 'drivetrain',
  drivetrain: 'drivetrain',
  kilometraje: 'mileage',
  kilometraje_km: 'mileage',
  mileage: 'mileage',
  precio_lista: 'listPrice',
  list_price: 'listPrice',
  precio_oferta: 'offerPrice',
  offer_price: 'offerPrice',
  pie_minimo: 'minimumDownPayment',
  minimum_down_payment: 'minimumDownPayment',
  texto_financiamiento: 'financingText',
  financing_text: 'financingText',
  descripcion: 'description',
  description: 'description',
  ubicacion: 'location',
  location: 'location',
};

const REQUIRED_FIELDS: Array<{ field: ImportField; label: string }> = [
  { field: 'internalCode', label: 'codigo_interno' },
  { field: 'make', label: 'marca' },
  { field: 'model', label: 'modelo' },
  { field: 'year', label: 'año' },
  { field: 'listPrice', label: 'precio_lista' },
];

const FUEL_VALUES: Record<string, string> = {
  bencina: 'Bencina',
  gasolina: 'Bencina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  gas: 'Gas',
  otro: 'Otro',
};

const TRANSMISSION_VALUES: Record<string, string> = {
  automatica: 'Automática',
  automatico: 'Automática',
  mecanica: 'Mecánica',
  manual: 'Mecánica',
  cvt: 'CVT',
  doble_embrague: 'Doble embrague',
  otra: 'Otra',
  otro: 'Otra',
};

const DRIVETRAIN_VALUES: Record<string, string> = {
  '4x2': '4x2',
  '4x4': '4x4',
  awd: 'AWD',
  fwd: 'FWD',
  rwd: 'RWD',
  otra: 'Otra',
  otro: 'Otra',
};

function normalize(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(contents: string): ',' | ';' | '\t' {
  const firstLine = contents.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const options = [',', ';', '\t'] as const;
  return options.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length
      ? candidate
      : best
  );
}

function parseCsv(contents: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    const next = contents[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && character === delimiter) {
      record.push(value.trim());
      value = '';
      continue;
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      record.push(value.trim());
      if (record.some((cell) => cell.length > 0)) records.push(record);
      record = [];
      value = '';
      continue;
    }

    value += character;
  }

  record.push(value.trim());
  if (record.some((cell) => cell.length > 0)) records.push(record);
  return records;
}

function integerValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(`${negative ? '-' : ''}${digits}`);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanValue(value: string): boolean {
  return ['1', 'si', 'sí', 'true', 'yes', 'visible'].includes(
    value.trim().toLocaleLowerCase('es')
  );
}

function enumValue(
  value: string,
  values: Record<string, string>,
  fallback: string
): string {
  if (!value.trim()) return fallback;
  return values[normalize(value)] ?? '';
}

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function createCatalogImportTemplateCsv(): string {
  return `\uFEFF${CATALOG_IMPORT_HEADERS.join(';')}\r\n`;
}

export function parseCatalogImportCsv(contents: string): CatalogImportResult {
  const records = parseCsv(contents, detectDelimiter(contents));
  if (records.length === 0) {
    return { rows: [], issues: [{ message: 'El archivo está vacío.' }] };
  }

  const headerFields = records[0].map(
    (header) => HEADER_ALIASES[normalize(header)] ?? null
  );
  const presentFields = new Set(headerFields.filter(Boolean));
  const missingHeaders = REQUIRED_FIELDS.filter(
    ({ field }) => !presentFields.has(field)
  );
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      issues: [
        {
          message: `Faltan columnas obligatorias: ${missingHeaders
            .map(({ label }) => label)
            .join(', ')}.`,
        },
      ],
    };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > CATALOG_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      issues: [
        {
          message: `El archivo supera el máximo de ${CATALOG_IMPORT_MAX_ROWS} vehículos por importación.`,
        },
      ],
    };
  }

  const rows: CatalogImportRow[] = [];
  const issues: CatalogImportIssue[] = [];
  const seenCodes = new Map<string, number>();
  const seenPlates = new Map<string, number>();

  dataRecords.forEach((record, index) => {
    const rowNumber = index + 2;
    const source: Partial<Record<ImportField, string>> = {};
    headerFields.forEach((field, columnIndex) => {
      if (field) source[field] = record[columnIndex] ?? '';
    });

    const fuel = enumValue(source.fuel ?? '', FUEL_VALUES, 'Otro');
    const transmission = enumValue(
      source.transmission ?? '',
      TRANSMISSION_VALUES,
      'Otra'
    );
    const drivetrain = enumValue(
      source.drivetrain ?? '',
      DRIVETRAIN_VALUES,
      'Otra'
    );

    if ((source.fuel ?? '').trim() && !fuel) {
      issues.push({
        rowNumber,
        message:
          'Combustible inválido. Usa Bencina, Diésel, Híbrido, Eléctrico, Gas u Otro.',
      });
      return;
    }
    if ((source.transmission ?? '').trim() && !transmission) {
      issues.push({
        rowNumber,
        message:
          'Transmisión inválida. Usa Automática, Mecánica, CVT, Doble embrague u Otra.',
      });
      return;
    }
    if ((source.drivetrain ?? '').trim() && !drivetrain) {
      issues.push({
        rowNumber,
        message: 'Tracción inválida. Usa 4x2, 4x4, AWD, FWD, RWD u Otra.',
      });
      return;
    }

    const candidate = {
      internalCode: source.internalCode ?? '',
      licensePlate: source.licensePlate ?? '',
      licensePlateVisible: booleanValue(source.licensePlateVisible ?? ''),
      make: source.make ?? '',
      model: source.model ?? '',
      version: source.version ?? '',
      year: integerValue(source.year ?? ''),
      color: source.color ?? '',
      engine: source.engine ?? '',
      fuel,
      transmission,
      drivetrain,
      mileage: integerValue(source.mileage ?? '') ?? 0,
      listPrice: integerValue(source.listPrice ?? ''),
      offerPrice: integerValue(source.offerPrice ?? ''),
      minimumDownPayment: integerValue(source.minimumDownPayment ?? ''),
      financingText: source.financingText ?? '',
      description: source.description ?? '',
      location: source.location ?? '',
    };
    const parsed = parseCatalogVehicleInput(candidate);
    if (!parsed.ok) {
      issues.push({ rowNumber, message: parsed.error });
      return;
    }

    const normalizedCode = parsed.value.internalCode.toLocaleLowerCase('es');
    const previousCodeRow = seenCodes.get(normalizedCode);
    if (previousCodeRow) {
      issues.push({
        rowNumber,
        message: `El código interno se repite en las filas ${previousCodeRow} y ${rowNumber}.`,
      });
      return;
    }
    seenCodes.set(normalizedCode, rowNumber);

    const normalizedLicensePlate = normalizePlate(parsed.value.licensePlate);
    const previousPlateRow = normalizedLicensePlate
      ? seenPlates.get(normalizedLicensePlate)
      : undefined;
    if (previousPlateRow) {
      issues.push({
        rowNumber,
        message: `La patente se repite en las filas ${previousPlateRow} y ${rowNumber}.`,
      });
      return;
    }
    if (normalizedLicensePlate) {
      seenPlates.set(normalizedLicensePlate, rowNumber);
    }

    rows.push({ rowNumber, input: parsed.value });
  });

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ message: 'El archivo no contiene vehículos.' });
  }

  return { rows, issues };
}
