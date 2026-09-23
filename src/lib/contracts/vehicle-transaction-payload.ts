import {
  VEHICLE_TRANSACTION_TEMPLATES,
  type VehicleTransactionInput,
  type VehicleTransactionTemplateKey,
} from './types';
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

export function isVehicleTransactionTemplate(
  value: unknown
): value is VehicleTransactionTemplateKey {
  return VEHICLE_TRANSACTION_TEMPLATES.some((item) => item.key === value);
}

export function parseVehicleTransactionInput(
  value: unknown
): VehicleTransactionInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return {
    contactId: nullableId(body.contactId),
    conversationId: nullableId(body.conversationId),
    executiveUserId: nullableId(body.executiveUserId),
    executiveName: text(body.executiveName, 180),
    executivePhone: text(body.executivePhone, 40),
    executiveEmail: text(body.executiveEmail, 160),
    issueDate: text(body.issueDate, 10),
    issuePlace: text(body.issuePlace, 120),
    sellerName: text(body.sellerName, 180),
    sellerRut: text(body.sellerRut, 30),
    sellerAddress: text(body.sellerAddress, 300),
    sellerCity: text(body.sellerCity, 120),
    sellerPhone: text(body.sellerPhone, 40),
    sellerRepresentativeName: text(body.sellerRepresentativeName, 180),
    sellerRepresentativeRut: text(body.sellerRepresentativeRut, 30),
    sellerRepresentativeAddress: text(body.sellerRepresentativeAddress, 300),
    sellerRepresentativeCity: text(body.sellerRepresentativeCity, 120),
    sellerPowerDate: text(body.sellerPowerDate, 10),
    sellerPowerNotary: text(body.sellerPowerNotary, 180),
    buyerName: text(body.buyerName, 180),
    buyerRut: text(body.buyerRut, 30),
    buyerAddress: text(body.buyerAddress, 300),
    buyerCity: text(body.buyerCity, 120),
    buyerPhone: text(body.buyerPhone, 40),
    buyerCivilStatus: text(body.buyerCivilStatus, 80),
    secondBuyerName: text(body.secondBuyerName, 180),
    secondBuyerRut: text(body.secondBuyerRut, 30),
    secondBuyerAddress: text(body.secondBuyerAddress, 300),
    secondBuyerCity: text(body.secondBuyerCity, 120),
    buyerRepresentativeName: text(body.buyerRepresentativeName, 180),
    buyerRepresentativeRut: text(body.buyerRepresentativeRut, 30),
    buyerRepresentativeAddress: text(body.buyerRepresentativeAddress, 300),
    buyerRepresentativeCity: text(body.buyerRepresentativeCity, 120),
    buyerPowerDate: text(body.buyerPowerDate, 10),
    buyerPowerNotary: text(body.buyerPowerNotary, 180),
    powerValidityDays: Math.max(1, integer(body.powerValidityDays, 30)),
    vehicleType: text(body.vehicleType, 80),
    vehicleMake: text(body.vehicleMake, 100),
    vehicleModel: text(body.vehicleModel, 160),
    vehicleYear: nullableInteger(body.vehicleYear),
    vehicleColor: text(body.vehicleColor, 80),
    vehicleFuel: text(body.vehicleFuel, 80),
    vehicleEngineNumber: text(body.vehicleEngineNumber, 120),
    vehicleChassisNumber: text(body.vehicleChassisNumber, 120),
    vehicleSerialNumber: text(body.vehicleSerialNumber, 120),
    vehiclePlate: text(body.vehiclePlate, 30),
    vehicleGrossWeightKg: nullableInteger(body.vehicleGrossWeightKg),
    totalPrice: Math.max(0, integer(body.totalPrice)),
    cashAmount: Math.max(0, integer(body.cashAmount)),
    financedAmount: Math.max(0, integer(body.financedAmount)),
    reservationAmount: Math.max(0, integer(body.reservationAmount)),
    reservationPaymentMethod: text(body.reservationPaymentMethod, 80),
    reservationExpiresAt: text(body.reservationExpiresAt, 10),
    reservationConditions: text(body.reservationConditions, 1500),
    vehicleHasFines: body.vehicleHasFines === true,
    sellerHasPensionDebt: body.sellerHasPensionDebt === true,
    buyerHasPensionDebt: body.buyerHasPensionDebt === true,
    amendmentAttorneyName: text(body.amendmentAttorneyName, 180),
    amendmentAttorneyRut: text(body.amendmentAttorneyRut, 30),
    internalNotes: text(body.internalNotes, 3000),
  };
}

export function validateVehicleTransactionInput(
  templateKey: VehicleTransactionTemplateKey,
  input: VehicleTransactionInput
) {
  const errors: Record<string, string> = {};
  const reservation = templateKey === 'vehicle_reservation_v1';
  const companySeller = templateKey === 'vehicle_sale_company_v1';
  if (!isValidIsoDate(input.issueDate))
    errors.issueDate = 'Selecciona una fecha válida.';
  if (!input.issuePlace) errors.issuePlace = 'Ingresa la ciudad.';
  if (!companySeller && !reservation) {
    if (!input.sellerName)
      errors.sellerName = 'Ingresa el nombre del vendedor.';
    if (!input.sellerRut) errors.sellerRut = 'Ingresa el RUT del vendedor.';
    else if (!isValidChileanRut(input.sellerRut))
      errors.sellerRut = 'El RUT del vendedor no es válido.';
    if (!input.sellerAddress) errors.sellerAddress = 'Ingresa su domicilio.';
  }
  if (!input.buyerName)
    errors.buyerName = reservation
      ? 'Ingresa quién reserva.'
      : 'Ingresa el comprador.';
  if (!input.buyerRut) errors.buyerRut = 'Ingresa el RUT.';
  else if (!isValidChileanRut(input.buyerRut))
    errors.buyerRut = 'El RUT no es válido.';
  if (input.sellerPhone && !isValidPhone(input.sellerPhone))
    errors.sellerPhone = 'El teléfono no es válido.';
  if (input.buyerPhone && !isValidPhone(input.buyerPhone))
    errors.buyerPhone = 'El teléfono no es válido.';
  if (input.executiveEmail && !isValidEmail(input.executiveEmail))
    errors.executiveEmail = 'El correo del ejecutivo no es válido.';
  if (!reservation && !input.buyerAddress)
    errors.buyerAddress = 'Ingresa el domicilio.';
  if (templateKey === 'vehicle_sale_civil_union_v1') {
    if (!input.secondBuyerName)
      errors.secondBuyerName = 'Ingresa el segundo comprador.';
    if (!input.secondBuyerRut) errors.secondBuyerRut = 'Ingresa su RUT.';
    else if (!isValidChileanRut(input.secondBuyerRut))
      errors.secondBuyerRut = 'El RUT no es válido.';
  }
  if (templateKey === 'vehicle_sale_seller_power_v1') {
    if (!input.sellerRepresentativeName)
      errors.sellerRepresentativeName = 'Ingresa el representante.';
    if (!input.sellerRepresentativeRut)
      errors.sellerRepresentativeRut = 'Ingresa su RUT.';
    else if (!isValidChileanRut(input.sellerRepresentativeRut))
      errors.sellerRepresentativeRut = 'El RUT no es válido.';
    if (!isValidIsoDate(input.sellerPowerDate))
      errors.sellerPowerDate = 'Ingresa la fecha del poder.';
    if (!input.sellerPowerNotary)
      errors.sellerPowerNotary = 'Ingresa la notaría.';
  }
  if (templateKey === 'vehicle_sale_purchase_power_v1') {
    if (!input.buyerRepresentativeName)
      errors.buyerRepresentativeName = 'Ingresa el mandatario.';
    if (!input.buyerRepresentativeRut)
      errors.buyerRepresentativeRut = 'Ingresa su RUT.';
    else if (!isValidChileanRut(input.buyerRepresentativeRut))
      errors.buyerRepresentativeRut = 'El RUT no es válido.';
    if (!isValidIsoDate(input.buyerPowerDate))
      errors.buyerPowerDate = 'Ingresa la fecha del poder.';
    if (!input.buyerPowerNotary)
      errors.buyerPowerNotary = 'Ingresa la notaría.';
  }
  if (!input.vehicleMake) errors.vehicleMake = 'Ingresa la marca.';
  if (!input.vehicleModel) errors.vehicleModel = 'Ingresa el modelo.';
  if (!isValidVehicleYear(input.vehicleYear))
    errors.vehicleYear = 'Ingresa un año válido.';
  if (!input.vehiclePlate) errors.vehiclePlate = 'Ingresa la patente.';
  else if (!isValidChileanPlate(input.vehiclePlate))
    errors.vehiclePlate = 'La patente no es válida.';
  if (reservation) {
    if (input.reservationAmount <= 0)
      errors.reservationAmount = 'Ingresa la garantía.';
    if (!isValidIsoDate(input.reservationExpiresAt))
      errors.reservationExpiresAt = 'Ingresa la vigencia.';
    else if (input.reservationExpiresAt < input.issueDate)
      errors.reservationExpiresAt =
        'La vigencia no puede ser anterior a la fecha del contrato.';
  } else {
    if (input.totalPrice <= 0) errors.totalPrice = 'Ingresa el precio total.';
    if (input.cashAmount + input.financedAmount !== input.totalPrice)
      errors.totalPrice =
        'El contado más el financiamiento deben coincidir con el precio total.';
  }
  if (!input.executiveName) errors.executiveName = 'Selecciona un ejecutivo.';
  return errors;
}

export function vehicleTransactionToRpcPayload(input: VehicleTransactionInput) {
  return {
    ...input,
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    executive_user_id: input.executiveUserId,
    party_name: input.buyerName,
    vehicle_label: [input.vehicleMake, input.vehicleModel, input.vehicleYear]
      .filter(Boolean)
      .join(' '),
    issue_date: input.issueDate,
  };
}
