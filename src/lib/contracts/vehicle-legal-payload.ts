import {
  VEHICLE_LEGAL_TEMPLATES,
  type VehicleLegalInput,
  type VehicleLegalTemplateKey,
  type VehicleLegalVehicle,
} from './types';
import {
  isValidChileanPlate,
  isValidChileanRut,
  isValidEmail,
  isValidIsoDate,
  isValidPhone,
  isValidVehicleYear,
  isValidVin,
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

function vehicle(value: unknown, index: number): VehicleLegalVehicle {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    id: text(row.id, 80) || `vehicle-${index + 1}`,
    type: text(row.type, 80),
    make: text(row.make, 100),
    model: text(row.model, 160),
    year: nullableInteger(row.year),
    color: text(row.color, 80),
    fuel: text(row.fuel, 80),
    engineNumber: text(row.engineNumber, 120),
    chassisNumber: text(row.chassisNumber, 120),
    serialNumber: text(row.serialNumber, 120),
    plate: text(row.plate, 30).toUpperCase(),
    grossWeightKg: nullableInteger(row.grossWeightKg),
    vin: text(row.vin, 120),
    entryDate: text(row.entryDate, 10),
  };
}

export function isVehicleLegalTemplate(
  value: unknown
): value is VehicleLegalTemplateKey {
  return VEHICLE_LEGAL_TEMPLATES.some((item) => item.key === value);
}

export function parseVehicleLegalInput(
  value: unknown
): VehicleLegalInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const vehicles = Array.isArray(body.vehicles)
    ? body.vehicles.slice(0, 25).map(vehicle)
    : [];
  return {
    contactId: nullableId(body.contactId),
    conversationId: nullableId(body.conversationId),
    executiveUserId: nullableId(body.executiveUserId),
    executiveName: text(body.executiveName, 180),
    executivePhone: text(body.executivePhone, 40),
    executiveEmail: text(body.executiveEmail, 160),
    issueDate: text(body.issueDate, 10),
    issuePlace: text(body.issuePlace, 120),
    declarantName: text(body.declarantName, 180),
    declarantRut: text(body.declarantRut, 30),
    declarantAddress: text(body.declarantAddress, 300),
    declarantCity: text(body.declarantCity, 120),
    declarantPhone: text(body.declarantPhone, 40),
    representativeName: text(body.representativeName, 180),
    representativeRut: text(body.representativeRut, 30),
    representativeAddress: text(body.representativeAddress, 300),
    representativeCity: text(body.representativeCity, 120),
    powerValidityMonths: Math.min(
      120,
      Math.max(1, integer(body.powerValidityMonths, 12))
    ),
    vehicles,
    internalNotes: text(body.internalNotes, 3000),
  };
}

export function validateVehicleLegalInput(
  templateKey: VehicleLegalTemplateKey,
  input: VehicleLegalInput
) {
  const errors: Record<string, string> = {};
  if (!isValidIsoDate(input.issueDate))
    errors.issueDate = 'Selecciona una fecha válida.';
  if (!input.issuePlace) errors.issuePlace = 'Ingresa la ciudad.';
  if (!input.declarantName) errors.declarantName = 'Ingresa el nombre.';
  if (!input.declarantRut) errors.declarantRut = 'Ingresa el RUT.';
  else if (!isValidChileanRut(input.declarantRut))
    errors.declarantRut = 'El RUT no es válido.';
  if (input.declarantPhone && !isValidPhone(input.declarantPhone))
    errors.declarantPhone = 'El teléfono no es válido.';
  if (input.executiveEmail && !isValidEmail(input.executiveEmail))
    errors.executiveEmail = 'El correo del ejecutivo no es válido.';
  if (!input.declarantAddress)
    errors.declarantAddress = 'Ingresa el domicilio.';
  if (templateKey === 'vehicle_sale_power_v1') {
    if (!input.representativeName)
      errors.representativeName = 'Ingresa el nombre del mandatario.';
    if (!input.representativeRut)
      errors.representativeRut = 'Ingresa el RUT del mandatario.';
    else if (!isValidChileanRut(input.representativeRut))
      errors.representativeRut = 'El RUT del mandatario no es válido.';
    if (input.vehicles.length !== 1)
      errors.vehicles = 'Este poder debe individualizar un vehículo.';
  } else if (!input.vehicles.length) {
    errors.vehicles = 'Agrega al menos un vehículo.';
  }
  input.vehicles.forEach((item, index) => {
    const prefix = `vehicles.${index}`;
    if (!item.make) errors[`${prefix}.make`] = 'Ingresa la marca.';
    if (!item.model) errors[`${prefix}.model`] = 'Ingresa el modelo.';
    if (!isValidVehicleYear(item.year))
      errors[`${prefix}.year`] = 'Ingresa un año válido.';
    if (!item.plate) errors[`${prefix}.plate`] = 'Ingresa la patente.';
    else if (!isValidChileanPlate(item.plate))
      errors[`${prefix}.plate`] = 'La patente no es válida.';
    if (item.vin && !isValidVin(item.vin))
      errors[`${prefix}.vin`] = 'El VIN debe contener 17 caracteres válidos.';
    if (
      templateKey === 'vehicle_responsibility_declaration_v1' &&
      !isValidIsoDate(item.entryDate)
    )
      errors[`${prefix}.entryDate`] = 'Ingresa la fecha de ingreso.';
  });
  if (!input.executiveName) errors.executiveName = 'Selecciona un ejecutivo.';
  return errors;
}

export function vehicleLegalToRpcPayload(input: VehicleLegalInput) {
  const firstVehicle = input.vehicles[0];
  return {
    ...input,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    executive_user_id: input.executiveUserId,
    party_name: input.declarantName,
    vehicle_label: firstVehicle
      ? [firstVehicle.make, firstVehicle.model, firstVehicle.year]
          .filter(Boolean)
          .join(' ')
      : 'Vehículos declarados',
    issue_date: input.issueDate,
  };
}
