import { sanitizeQuotationInput } from './calculations';
import type {
  QuotationDocumentTemplate,
  QuotationInput,
  QuotationInstallmentOption,
  QuotationPurchaseType,
} from './types';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableId(value: unknown): string | null {
  const normalized = text(value).trim();
  return normalized || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function installments(value: unknown): QuotationInstallmentOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const row =
      entry && typeof entry === 'object'
        ? (entry as Record<string, unknown>)
        : {};
    return {
      id: text(row.id) || undefined,
      termMonths: numberValue(row.termMonths ?? row.term_months),
      monthlyPayment: numberValue(row.monthlyPayment ?? row.monthly_payment),
      observation: text(row.observation) || 'Referencial',
      sortOrder: numberValue(row.sortOrder ?? row.sort_order, index),
    };
  });
}

export function parseQuotationInput(value: unknown): QuotationInput | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const purchaseType: QuotationPurchaseType =
    row.purchaseType === 'cash' || row.purchase_type === 'cash'
      ? 'cash'
      : 'financed';
  const documentTemplate: QuotationDocumentTemplate =
    row.documentTemplate === 'showcase' || row.document_template === 'showcase'
      ? 'showcase'
      : 'classic';
  return sanitizeQuotationInput({
    contactId: nullableId(row.contactId ?? row.contact_id),
    conversationId: nullableId(row.conversationId ?? row.conversation_id),
    catalogItemId: nullableId(row.catalogItemId ?? row.catalog_item_id),
    executiveUserId: nullableId(row.executiveUserId ?? row.executive_user_id),
    executiveName: text(row.executiveName ?? row.executive_name),
    executivePhone: text(row.executivePhone ?? row.executive_phone),
    executiveEmail: text(row.executiveEmail ?? row.executive_email),
    clientName: text(row.clientName ?? row.client_name),
    clientRut: text(row.clientRut ?? row.client_rut),
    clientPhone: text(row.clientPhone ?? row.client_phone),
    clientEmail: text(row.clientEmail ?? row.client_email),
    clientCity: text(row.clientCity ?? row.client_city),
    vehicleMake: text(row.vehicleMake ?? row.vehicle_make),
    vehicleModel: text(row.vehicleModel ?? row.vehicle_model),
    vehicleVersion: text(row.vehicleVersion ?? row.vehicle_version),
    vehicleYear:
      row.vehicleYear === null || row.vehicle_year === null
        ? null
        : numberValue(row.vehicleYear ?? row.vehicle_year) || null,
    vehicleColor: text(row.vehicleColor ?? row.vehicle_color),
    vehicleFuel: text(row.vehicleFuel ?? row.vehicle_fuel),
    vehicleTransmission: text(
      row.vehicleTransmission ?? row.vehicle_transmission
    ),
    vehicleDrivetrain: text(row.vehicleDrivetrain ?? row.vehicle_drivetrain),
    vehicleMileageKm: numberValue(
      row.vehicleMileageKm ?? row.vehicle_mileage_km
    ),
    vehiclePlate: text(row.vehiclePlate ?? row.vehicle_plate),
    vehicleImageUrl: text(row.vehicleImageUrl ?? row.vehicle_image_url),
    documentTemplate,
    purchaseType,
    listPrice: numberValue(row.listPrice ?? row.list_price),
    discountAmount: numberValue(row.discountAmount ?? row.discount_amount),
    downPayment: numberValue(row.downPayment ?? row.down_payment),
    financedExpenses: numberValue(
      row.financedExpenses ?? row.financed_expenses
    ),
    issueDate: text(row.issueDate ?? row.issue_date),
    validUntil: text(row.validUntil ?? row.valid_until),
    documentNotes: text(row.documentNotes ?? row.document_notes),
    internalNotes: text(row.internalNotes ?? row.internal_notes),
    termsText: text(row.termsText ?? row.terms_text),
    messageText: text(row.messageText ?? row.message_text),
    installments: installments(row.installments),
  });
}

export function quotationInputToRpcPayload(input: QuotationInput) {
  return {
    contact_id: input.contactId,
    conversation_id: input.conversationId,
    catalog_item_id: input.catalogItemId,
    executive_user_id: input.executiveUserId,
    executive_name: input.executiveName,
    executive_phone: input.executivePhone,
    executive_email: input.executiveEmail,
    client_name: input.clientName,
    client_rut: input.clientRut,
    client_phone: input.clientPhone,
    client_email: input.clientEmail,
    client_city: input.clientCity,
    vehicle_make: input.vehicleMake,
    vehicle_model: input.vehicleModel,
    vehicle_version: input.vehicleVersion,
    vehicle_year: input.vehicleYear,
    vehicle_color: input.vehicleColor,
    vehicle_fuel: input.vehicleFuel,
    vehicle_transmission: input.vehicleTransmission,
    vehicle_drivetrain: input.vehicleDrivetrain,
    vehicle_mileage_km: input.vehicleMileageKm,
    vehicle_plate: input.vehiclePlate,
    vehicle_image_url: input.vehicleImageUrl,
    document_template: input.documentTemplate,
    purchase_type: input.purchaseType,
    list_price: input.listPrice,
    discount_amount: input.discountAmount,
    down_payment: input.downPayment,
    financed_expenses: input.financedExpenses,
    issue_date: input.issueDate,
    valid_until: input.validUntil,
    document_notes: input.documentNotes,
    internal_notes: input.internalNotes,
    terms_text: input.termsText,
    message_text: input.messageText,
    installments: input.installments.map((option) => ({
      term_months: option.termMonths,
      monthly_payment: option.monthlyPayment,
      observation: option.observation,
    })),
  };
}
