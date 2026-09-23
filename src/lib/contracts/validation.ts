import { isValidChileanRut } from '@/lib/quotes/validation';

export { isValidChileanRut };

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function isValidVehicleYear(value: number | null): boolean {
  return (
    value !== null &&
    Number.isInteger(value) &&
    value >= 1886 &&
    value <= new Date().getFullYear() + 2
  );
}

export function isValidChileanPlate(value: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(value.replace(/[^A-Z0-9]/gi, '').toUpperCase());
}

export function isValidVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value);
}
