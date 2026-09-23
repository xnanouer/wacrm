import type {
  QuotationInput,
  QuotationPurchaseType,
  QuotationStatus,
} from './types';

export function toClpInteger(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

export function calculateQuotationAmounts(input: {
  listPrice: number;
  discountAmount: number;
  downPayment: number;
  financedExpenses: number;
  purchaseType: QuotationPurchaseType;
}) {
  const listPrice = toClpInteger(input.listPrice);
  const discountAmount = Math.min(
    listPrice,
    toClpInteger(input.discountAmount)
  );
  const finalPrice = listPrice - discountAmount;
  const downPayment =
    input.purchaseType === 'cash'
      ? 0
      : Math.min(finalPrice, toClpInteger(input.downPayment));
  const financedExpenses =
    input.purchaseType === 'cash' ? 0 : toClpInteger(input.financedExpenses);
  const amountToFinance =
    input.purchaseType === 'cash'
      ? 0
      : finalPrice - downPayment + financedExpenses;
  const downPaymentPercentage = finalPrice
    ? Math.round((downPayment / finalPrice) * 1000) / 10
    : 0;

  return {
    listPrice,
    discountAmount,
    finalPrice,
    downPayment,
    financedExpenses,
    amountToFinance,
    downPaymentPercentage,
  };
}

export function formatClp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(toClpInteger(value));
}

export function addDaysToIsoDate(value: string, days: number): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}

export function sanitizeQuotationInput(input: QuotationInput): QuotationInput {
  const amounts = calculateQuotationAmounts(input);
  return {
    ...input,
    clientName: input.clientName.trim(),
    executiveName: input.executiveName.trim(),
    executivePhone: input.executivePhone.trim(),
    executiveEmail: input.executiveEmail.trim().toLowerCase(),
    clientRut: input.clientRut.trim(),
    clientPhone: input.clientPhone.trim(),
    clientEmail: input.clientEmail.trim().toLowerCase(),
    clientCity: input.clientCity.trim(),
    vehicleMake: input.vehicleMake.trim(),
    vehicleModel: input.vehicleModel.trim(),
    vehicleVersion: input.vehicleVersion.trim(),
    vehicleColor: input.vehicleColor.trim(),
    vehicleFuel: input.vehicleFuel.trim(),
    vehicleTransmission: input.vehicleTransmission.trim(),
    vehicleDrivetrain: input.vehicleDrivetrain.trim(),
    vehiclePlate: input.vehiclePlate.trim().toUpperCase(),
    vehicleImageUrl: input.vehicleImageUrl.trim(),
    listPrice: amounts.listPrice,
    discountAmount: amounts.discountAmount,
    downPayment: amounts.downPayment,
    financedExpenses: amounts.financedExpenses,
    vehicleMileageKm: toClpInteger(input.vehicleMileageKm),
    installments: input.installments.map((option, index) => ({
      ...option,
      termMonths: Math.max(1, Math.round(option.termMonths)),
      monthlyPayment: toClpInteger(option.monthlyPayment),
      observation: option.observation.trim() || 'Referencial',
      sortOrder: index,
    })),
  };
}

const STATUS_TRANSITIONS: Record<QuotationStatus, readonly QuotationStatus[]> =
  {
    draft: ['generated', 'cancelled'],
    generated: [
      'sent',
      'negotiating',
      'financing_pending',
      'accepted',
      'rejected',
      'expired',
      'cancelled',
    ],
    sent: [
      'negotiating',
      'financing_pending',
      'accepted',
      'rejected',
      'expired',
      'cancelled',
    ],
    negotiating: [
      'sent',
      'financing_pending',
      'accepted',
      'rejected',
      'expired',
      'cancelled',
    ],
    financing_pending: ['sent', 'accepted', 'rejected', 'cancelled'],
    accepted: ['contract_completed', 'cancelled'],
    rejected: ['generated', 'cancelled'],
    expired: ['generated', 'cancelled'],
    contract_completed: [],
    cancelled: [],
  };

export function canTransitionQuotation(
  from: QuotationStatus,
  to: QuotationStatus
): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}
