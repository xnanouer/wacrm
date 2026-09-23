import { calculateQuotationAmounts } from './calculations';
import type { QuotationInput } from './types';

export interface QuotationValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function isSafeRemoteAssetUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:') ||
      hostname.endsWith('.local') ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('0.')
    ) {
      return false;
    }
    const parts = hostname.split('.').map(Number);
    if (
      parts.length === 4 &&
      parts.every(Number.isInteger) &&
      parts[0] === 172 &&
      parts[1] >= 16 &&
      parts[1] <= 31
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeRut(value: string): string {
  return value.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function isValidChileanRut(value: string): boolean {
  const normalized = normalizeRut(value);
  if (!normalized) return true;
  if (!/^\d{7,8}[0-9K]$/.test(normalized)) return false;
  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? '0' : result === 10 ? 'K' : String(result);
  return verifier === expected;
}

export function validateQuotationInput(
  input: QuotationInput
): QuotationValidationResult {
  const errors: Record<string, string> = {};
  const required = [
    ['clientName', input.clientName, 'Ingresa el nombre del cliente.'],
    ['executiveName', input.executiveName, 'Selecciona un ejecutivo.'],
    ['clientPhone', input.clientPhone, 'Ingresa el teléfono del cliente.'],
    ['vehicleMake', input.vehicleMake, 'Ingresa la marca del vehículo.'],
    ['vehicleModel', input.vehicleModel, 'Ingresa el modelo del vehículo.'],
    ['issueDate', input.issueDate, 'Selecciona la fecha de emisión.'],
    ['validUntil', input.validUntil, 'Selecciona la fecha de vigencia.'],
  ] as const;
  for (const [key, value, message] of required) {
    if (!value.trim()) errors[key] = message;
  }
  if (input.clientRut && !isValidChileanRut(input.clientRut)) {
    errors.clientRut = 'El RUT no es válido.';
  }
  if (input.clientEmail && !/^\S+@\S+\.\S+$/.test(input.clientEmail)) {
    errors.clientEmail = 'El correo no es válido.';
  }
  if (input.executiveEmail && !/^\S+@\S+\.\S+$/.test(input.executiveEmail)) {
    errors.executiveEmail = 'El correo del ejecutivo no es válido.';
  }
  if (input.vehicleImageUrl && !isSafeRemoteAssetUrl(input.vehicleImageUrl)) {
    errors.vehicleImageUrl =
      'La imagen debe usar una URL HTTPS pública y segura.';
  }
  if (input.vehicleYear !== null) {
    const maxYear = new Date().getFullYear() + 2;
    if (input.vehicleYear < 1886 || input.vehicleYear > maxYear) {
      errors.vehicleYear = `El año debe estar entre 1886 y ${maxYear}.`;
    }
  }
  if (input.listPrice <= 0) {
    errors.listPrice = 'El precio de lista debe ser mayor que cero.';
  }
  const amounts = calculateQuotationAmounts(input);
  if (input.discountAmount > input.listPrice) {
    errors.discountAmount = 'El descuento no puede superar el precio de lista.';
  }
  if (input.downPayment > amounts.finalPrice) {
    errors.downPayment = 'El pie no puede superar el precio final.';
  }
  if (
    input.validUntil &&
    input.issueDate &&
    input.validUntil < input.issueDate
  ) {
    errors.validUntil = 'La vigencia no puede ser anterior a la emisión.';
  }
  if (input.purchaseType === 'financed' && input.installments.length === 0) {
    errors.installments = 'Agrega al menos una opción de financiamiento.';
  }
  const terms = new Set<number>();
  for (const option of input.installments) {
    if (option.termMonths < 1 || option.termMonths > 120) {
      errors.installments = 'Los plazos deben estar entre 1 y 120 meses.';
    }
    if (option.monthlyPayment <= 0) {
      errors.installments = 'Cada cuota debe tener un valor mayor que cero.';
    }
    if (terms.has(option.termMonths)) {
      errors.installments = 'No repitas el mismo plazo de cuotas.';
    }
    terms.add(option.termMonths);
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export const TEMPLATE_VARIABLES = [
  'cliente',
  'numero',
  'vehiculo',
  'precio',
  'vigencia',
  'ejecutivo',
] as const;

export type QuotationMessageVariables = Record<
  (typeof TEMPLATE_VARIABLES)[number],
  string
>;

export function renderQuotationMessage(
  template: string,
  variables: QuotationMessageVariables
): { text: string; unknownVariables: string[] } {
  const unknownVariables: string[] = [];
  const text = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (key in variables) return variables[key as keyof typeof variables];
    unknownVariables.push(key);
    return `{{${key}}}`;
  });
  return { text, unknownVariables: [...new Set(unknownVariables)] };
}
