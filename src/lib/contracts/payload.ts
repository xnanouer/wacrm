import type { VehicleConsignmentInput } from './types';
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

function nullableInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

export function parseVehicleConsignmentInput(
  value: unknown
): VehicleConsignmentInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const capacity =
    body.consignorCapacity === 'authorized_representative'
      ? 'authorized_representative'
      : 'legal_owner';
  return {
    contactId: nullableId(body.contactId),
    conversationId: nullableId(body.conversationId),
    catalogItemId: nullableId(body.catalogItemId),
    executiveUserId: nullableId(body.executiveUserId),
    executiveName: text(body.executiveName, 180),
    executivePhone: text(body.executivePhone, 40),
    executiveEmail: text(body.executiveEmail, 160),
    issueDate: text(body.issueDate, 10),
    consignorName: text(body.consignorName, 180),
    consignorRut: text(body.consignorRut, 30),
    consignorAddress: text(body.consignorAddress, 300),
    consignorCity: text(body.consignorCity, 160),
    consignorPhone: text(body.consignorPhone, 40),
    consignorEmail: text(body.consignorEmail, 160),
    vehicleType: text(body.vehicleType, 80),
    vehicleMake: text(body.vehicleMake, 100),
    vehicleModel: text(body.vehicleModel, 120),
    vehicleVersion: text(body.vehicleVersion, 160),
    vehicleYear: nullableInteger(body.vehicleYear),
    vehicleColor: text(body.vehicleColor, 80),
    vehicleFuel: text(body.vehicleFuel, 80),
    vehicleEngine: text(body.vehicleEngine, 120),
    vehicleEngineNumber: text(body.vehicleEngineNumber, 120),
    vehicleChassisNumber: text(body.vehicleChassisNumber, 120),
    vehiclePlate: text(body.vehiclePlate, 30),
    vehicleGrossWeightKg: nullableInteger(body.vehicleGrossWeightKg),
    vehicleMileageKm: nullableInteger(body.vehicleMileageKm),
    keysReceived: Math.max(0, integer(body.keysReceived, 1)),
    keysAtBranch: Math.max(0, integer(body.keysAtBranch, 1)),
    documentsUpToDate: bool(body.documentsUpToDate),
    consignorCapacity: capacity,
    hasPowerOfAttorney: bool(body.hasPowerOfAttorney),
    hasIdCopy: bool(body.hasIdCopy),
    vehicleUse: text(body.vehicleUse, 120),
    hasLien: bool(body.hasLien),
    hasAnnotationsCertificate: bool(body.hasAnnotationsCertificate),
    hasAutofactReport: bool(body.hasAutofactReport),
    autofactPreparedBy: text(body.autofactPreparedBy, 120),
    hasFines: bool(body.hasFines),
    hasPensionDebt: bool(body.hasPensionDebt),
    branchName: text(body.branchName, 160),
    branchAddress: text(body.branchAddress, 300),
    consignmentValue: Math.max(0, integer(body.consignmentValue)),
    cashPaymentTerms: text(body.cashPaymentTerms, 1000),
    financedPaymentTerms: text(body.financedPaymentTerms, 1000),
    internalNotes: text(body.internalNotes, 3000),
  };
}

export function validateVehicleConsignmentInput(
  input: VehicleConsignmentInput
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isValidIsoDate(input.issueDate))
    errors.issueDate = 'Selecciona una fecha válida.';
  if (!input.consignorName) errors.consignorName = 'Ingresa el nombre.';
  if (!input.consignorRut) errors.consignorRut = 'Ingresa el RUT.';
  else if (!isValidChileanRut(input.consignorRut))
    errors.consignorRut = 'El RUT no es válido.';
  if (!input.consignorAddress)
    errors.consignorAddress = 'Ingresa el domicilio.';
  if (!input.consignorPhone) errors.consignorPhone = 'Ingresa el teléfono.';
  else if (!isValidPhone(input.consignorPhone))
    errors.consignorPhone = 'El teléfono no es válido.';
  if (input.consignorEmail && !isValidEmail(input.consignorEmail))
    errors.consignorEmail = 'El correo no es válido.';
  if (input.executiveEmail && !isValidEmail(input.executiveEmail))
    errors.executiveEmail = 'El correo del ejecutivo no es válido.';
  if (!input.vehicleType) errors.vehicleType = 'Ingresa el tipo de vehículo.';
  if (!input.vehicleMake) errors.vehicleMake = 'Ingresa la marca.';
  if (!input.vehicleModel) errors.vehicleModel = 'Ingresa el modelo.';
  if (!input.vehiclePlate) errors.vehiclePlate = 'Ingresa la patente.';
  else if (!isValidChileanPlate(input.vehiclePlate))
    errors.vehiclePlate = 'La patente no es válida.';
  if (!isValidVehicleYear(input.vehicleYear))
    errors.vehicleYear = 'Ingresa un año válido.';
  if (!input.vehicleMileageKm && input.vehicleMileageKm !== 0)
    errors.vehicleMileageKm = 'Ingresa el kilometraje.';
  if (!input.branchAddress) errors.branchAddress = 'Ingresa la sucursal.';
  if (input.consignmentValue <= 0)
    errors.consignmentValue = 'Ingresa un valor de consignación.';
  if (!input.executiveName) errors.executiveName = 'Selecciona un ejecutivo.';
  return errors;
}

export function inputToRpcPayload(input: VehicleConsignmentInput) {
  return {
    ...input,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    catalog_item_id: input.catalogItemId,
    executive_user_id: input.executiveUserId,
    consignor_name: input.consignorName,
    vehicle_label:
      [input.vehicleMake, input.vehicleModel, input.vehicleYear]
        .filter(Boolean)
        .join(' ') || 'Vehículo',
    issue_date: input.issueDate,
  };
}
