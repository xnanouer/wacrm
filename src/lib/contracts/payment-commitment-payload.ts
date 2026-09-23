import type { PaymentCommitmentInput } from './types';
import {
  isValidChileanPlate,
  isValidChileanRut,
  isValidEmail,
  isValidIsoDate,
  isValidPhone,
  isValidVehicleYear,
} from './validation';

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nullableId(value: unknown): string | null {
  const candidate = text(value, 50);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate
  )
    ? candidate
    : null;
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parsePaymentCommitmentInput(
  value: unknown
): PaymentCommitmentInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return {
    contactId: nullableId(body.contactId),
    conversationId: nullableId(body.conversationId),
    catalogItemId: nullableId(body.catalogItemId),
    executiveUserId: nullableId(body.executiveUserId),
    executiveName: text(body.executiveName, 180),
    executivePhone: text(body.executivePhone, 40),
    executiveEmail: text(body.executiveEmail, 160),
    issueDate: text(body.issueDate, 10),
    providerName: text(body.providerName, 180),
    providerRut: text(body.providerRut, 30),
    providerAddress: text(body.providerAddress, 300),
    providerCommune: text(body.providerCommune, 120),
    providerCity: text(body.providerCity, 120),
    providerRegion: text(body.providerRegion, 120),
    providerPhone: text(body.providerPhone, 40),
    providerEmail: text(body.providerEmail, 160),
    vehicleType: text(body.vehicleType, 80),
    vehicleMake: text(body.vehicleMake, 100),
    vehicleModel: text(body.vehicleModel, 160),
    vehicleYear: body.vehicleYear ? integer(body.vehicleYear) : null,
    vehicleColor: text(body.vehicleColor, 80),
    vehicleFuel: text(body.vehicleFuel, 80),
    vehicleEngineNumber: text(body.vehicleEngineNumber, 120),
    vehicleChassisNumber: text(body.vehicleChassisNumber, 120),
    vehiclePlate: text(body.vehiclePlate, 30),
    hasPensionDebt: body.hasPensionDebt === true,
    branchName: text(body.branchName, 160),
    branchAddress: text(body.branchAddress, 300),
    takePrice: Math.max(0, integer(body.takePrice)),
    cashPaymentBusinessDays: Math.max(
      1,
      integer(body.cashPaymentBusinessDays, 4)
    ),
    financedPaymentBusinessDays: Math.max(
      1,
      integer(body.financedPaymentBusinessDays, 10)
    ),
    internalNotes: text(body.internalNotes, 3000),
  };
}

export function validatePaymentCommitmentInput(input: PaymentCommitmentInput) {
  const errors: Record<string, string> = {};
  if (!isValidIsoDate(input.issueDate))
    errors.issueDate = 'Selecciona una fecha válida.';
  if (!input.providerName) errors.providerName = 'Ingresa el nombre.';
  if (!input.providerRut) errors.providerRut = 'Ingresa el RUT.';
  else if (!isValidChileanRut(input.providerRut))
    errors.providerRut = 'El RUT no es válido.';
  if (!input.providerAddress) errors.providerAddress = 'Ingresa el domicilio.';
  if (!input.providerPhone) errors.providerPhone = 'Ingresa el teléfono.';
  else if (!isValidPhone(input.providerPhone))
    errors.providerPhone = 'El teléfono no es válido.';
  if (input.providerEmail && !isValidEmail(input.providerEmail))
    errors.providerEmail = 'El correo no es válido.';
  if (input.executiveEmail && !isValidEmail(input.executiveEmail))
    errors.executiveEmail = 'El correo del ejecutivo no es válido.';
  if (!input.vehicleMake) errors.vehicleMake = 'Ingresa la marca.';
  if (!input.vehicleModel) errors.vehicleModel = 'Ingresa el modelo.';
  if (!input.vehiclePlate) errors.vehiclePlate = 'Ingresa la patente.';
  else if (!isValidChileanPlate(input.vehiclePlate))
    errors.vehiclePlate = 'La patente no es válida.';
  if (!isValidVehicleYear(input.vehicleYear))
    errors.vehicleYear = 'Ingresa un año válido.';
  if (!input.branchAddress) errors.branchAddress = 'Ingresa la sucursal.';
  if (input.takePrice <= 0) errors.takePrice = 'Ingresa el valor acordado.';
  if (!input.executiveName) errors.executiveName = 'Selecciona un ejecutivo.';
  return errors;
}

export function paymentCommitmentToRpcPayload(input: PaymentCommitmentInput) {
  return {
    ...input,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    catalog_item_id: input.catalogItemId,
    executive_user_id: input.executiveUserId,
    provider_name: input.providerName,
    vehicle_label:
      [input.vehicleMake, input.vehicleModel, input.vehicleYear]
        .filter(Boolean)
        .join(' ') || 'Vehículo',
    issue_date: input.issueDate,
  };
}
