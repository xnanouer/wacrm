export type QuotationStatus =
  | 'draft'
  | 'generated'
  | 'sent'
  | 'negotiating'
  | 'financing_pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'contract_completed'
  | 'cancelled';

export type QuotationPurchaseType = 'cash' | 'financed';
export type QuotationAttachmentFormat = 'pdf' | 'png' | 'both';

export interface QuotationInstallmentOption {
  id?: string;
  termMonths: number;
  monthlyPayment: number;
  observation: string;
  sortOrder: number;
}

export interface QuotationSettings {
  accountId: string;
  quotePrefix: string;
  sequenceDigits: number;
  nextSequence: number;
  defaultValidityDays: number;
  currencyCode: string;
  companyDisplayName: string;
  companyRut: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyAddress: string | null;
  /** Optional quotation-specific override configured by an administrator. */
  logoUrl: string | null;
  /** General company logo; used when the quotation has no custom override. */
  accountLogoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  showClientRut: boolean;
  showClientEmail: boolean;
  showVehiclePlate: boolean;
  showExecutivePhone: boolean;
  showExecutiveEmail: boolean;
  defaultTerms: string;
  messageTemplate: string;
  defaultAttachmentFormat: QuotationAttachmentFormat;
}

export interface QuotationInput {
  contactId: string | null;
  conversationId: string | null;
  catalogItemId: string | null;
  executiveUserId: string | null;
  executiveName: string;
  executivePhone: string;
  executiveEmail: string;
  clientName: string;
  clientRut: string;
  clientPhone: string;
  clientEmail: string;
  clientCity: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVersion: string;
  vehicleYear: number | null;
  vehicleColor: string;
  vehicleFuel: string;
  vehicleTransmission: string;
  vehicleDrivetrain: string;
  vehicleMileageKm: number;
  vehiclePlate: string;
  vehicleImageUrl: string;
  purchaseType: QuotationPurchaseType;
  listPrice: number;
  discountAmount: number;
  downPayment: number;
  financedExpenses: number;
  issueDate: string;
  validUntil: string;
  documentNotes: string;
  internalNotes: string;
  termsText: string;
  messageText: string;
  installments: QuotationInstallmentOption[];
}

export interface QuotationRecord extends QuotationInput {
  id: string;
  accountId: string;
  quoteNumber: string;
  sequenceNumber: number;
  currentVersion: number;
  status: QuotationStatus;
  finalPrice: number;
  amountToFinance: number;
  generatedAt: string | null;
  lastSentAt: string | null;
  deletionHold: boolean;
  deletionHoldReason: string | null;
  scheduledDeletionAt: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationExecutiveSnapshot {
  name: string;
  phone: string;
  email: string;
}

export interface QuotationDocumentData {
  quotation: QuotationRecord;
  settings: QuotationSettings;
  executive: QuotationExecutiveSnapshot;
  installments: QuotationInstallmentOption[];
  generatedAt: string;
}

export interface QuotationVersion {
  id: string;
  quotationId: string;
  versionNumber: number;
  snapshot: QuotationDocumentData;
  generationStatus: 'pending' | 'ready' | 'failed';
  generationError: string | null;
  pdfStoragePath: string | null;
  pngStoragePath: string | null;
  createdAt: string;
}

export interface QuotationActivity {
  id: string;
  eventType:
    | 'created'
    | 'updated'
    | 'generated'
    | 'versioned'
    | 'sent'
    | 'resent'
    | 'status_changed'
    | 'duplicated'
    | 'hold_enabled'
    | 'hold_disabled'
    | 'retention_warning';
  actorUserId: string | null;
  fromStatus: QuotationStatus | null;
  toStatus: QuotationStatus | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface QuotationSendSummary {
  id: string;
  versionId: string | null;
  format: 'pdf' | 'png' | 'both';
  status: 'pending' | 'sending' | 'sent' | 'partial' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: 'Borrador',
  generated: 'Generada',
  sent: 'Enviada',
  negotiating: 'En negociación',
  financing_pending: 'Financiamiento pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  contract_completed: 'Contrato completado',
  cancelled: 'Cancelada',
};

export const QUOTATION_INSTALLMENT_PRESETS = [12, 24, 36, 48, 60] as const;

export const QUOTATION_RETENTION_DAYS: Partial<
  Record<QuotationStatus, number>
> = {
  draft: 7,
  generated: 15,
  sent: 30,
  expired: 15,
  rejected: 15,
  contract_completed: 7,
};
