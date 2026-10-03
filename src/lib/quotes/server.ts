import 'server-only';

import type { AccountContext } from '@/lib/auth/account';
import type {
  QuotationActivity,
  QuotationAttachmentFormat,
  QuotationDocumentData,
  QuotationInstallmentOption,
  QuotationRecord,
  QuotationSendSummary,
  QuotationSettings,
  QuotationStatus,
  QuotationVersion,
} from './types';

type Row = Record<string, unknown>;

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function installmentFromRow(row: Row): QuotationInstallmentOption {
  return {
    id: String(row.id),
    termMonths: numeric(row.term_months),
    monthlyPayment: numeric(row.monthly_payment),
    observation: String(row.observation ?? 'Referencial'),
    sortOrder: numeric(row.sort_order),
  };
}

export function quotationFromRow(
  row: Row,
  installmentsInput?: Row[]
): QuotationRecord {
  const relationInstallments = Array.isArray(row.quotation_installment_options)
    ? (row.quotation_installment_options as Row[])
    : [];
  const installments = (installmentsInput ?? relationInstallments)
    .map(installmentFromRow)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    quoteNumber: String(row.quote_number),
    sequenceNumber: numeric(row.sequence_number),
    currentVersion: numeric(row.current_version),
    status: row.status as QuotationStatus,
    contactId: nullableText(row.contact_id),
    conversationId: nullableText(row.conversation_id),
    catalogItemId: nullableText(row.catalog_item_id),
    executiveUserId: nullableText(row.executive_user_id),
    executiveName: String(row.executive_name ?? ''),
    executivePhone: String(row.executive_phone ?? ''),
    executiveEmail: String(row.executive_email ?? ''),
    clientName: String(row.client_name ?? ''),
    clientRut: String(row.client_rut ?? ''),
    clientPhone: String(row.client_phone ?? ''),
    clientEmail: String(row.client_email ?? ''),
    clientCity: String(row.client_city ?? ''),
    vehicleMake: String(row.vehicle_make ?? ''),
    vehicleModel: String(row.vehicle_model ?? ''),
    vehicleVersion: String(row.vehicle_version ?? ''),
    vehicleYear: row.vehicle_year === null ? null : numeric(row.vehicle_year),
    vehicleColor: String(row.vehicle_color ?? ''),
    vehicleFuel: String(row.vehicle_fuel ?? ''),
    vehicleTransmission: String(row.vehicle_transmission ?? ''),
    vehicleDrivetrain: String(row.vehicle_drivetrain ?? ''),
    vehicleMileageKm: numeric(row.vehicle_mileage_km),
    vehiclePlate: String(row.vehicle_plate ?? ''),
    vehicleImageUrl: String(row.vehicle_image_url ?? ''),
    purchaseType: row.purchase_type === 'cash' ? 'cash' : 'financed',
    listPrice: numeric(row.list_price),
    discountAmount: numeric(row.discount_amount),
    finalPrice: numeric(row.final_price),
    downPayment: numeric(row.down_payment),
    financedExpenses: numeric(row.financed_expenses),
    amountToFinance: numeric(row.amount_to_finance),
    issueDate: String(row.issue_date),
    validUntil: String(row.valid_until),
    documentNotes: String(row.document_notes ?? ''),
    internalNotes: String(row.internal_notes ?? ''),
    termsText: String(row.terms_text ?? ''),
    messageText: String(row.message_text ?? ''),
    installments,
    generatedAt: nullableText(row.generated_at),
    lastSentAt: nullableText(row.last_sent_at),
    deletionHold: Boolean(row.deletion_hold),
    deletionHoldReason: nullableText(row.deletion_hold_reason),
    scheduledDeletionAt: nullableText(row.scheduled_deletion_at),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function settingsFromRow(
  row: Row,
  accountLogoUrl: string | null = null
): QuotationSettings {
  return {
    accountId: String(row.account_id),
    quotePrefix: String(row.quote_prefix),
    sequenceDigits: numeric(row.sequence_digits),
    nextSequence: numeric(row.next_sequence),
    defaultValidityDays: numeric(row.default_validity_days),
    currencyCode: String(row.currency_code),
    companyDisplayName: String(row.company_display_name),
    companyRut: nullableText(row.company_rut),
    companyPhone: nullableText(row.company_phone),
    companyEmail: nullableText(row.company_email),
    companyAddress: nullableText(row.company_address),
    logoUrl: nullableText(row.logo_url),
    accountLogoUrl,
    primaryColor: String(row.primary_color),
    accentColor: String(row.accent_color),
    showClientRut: Boolean(row.show_client_rut),
    showClientEmail: Boolean(row.show_client_email),
    showVehiclePlate: Boolean(row.show_vehicle_plate),
    showExecutivePhone: Boolean(row.show_executive_phone),
    showExecutiveEmail: Boolean(row.show_executive_email),
    defaultTerms: String(row.default_terms),
    messageTemplate: String(row.message_template),
    defaultAttachmentFormat:
      row.default_attachment_format === 'png' ||
      row.default_attachment_format === 'both'
        ? (row.default_attachment_format as QuotationAttachmentFormat)
        : 'pdf',
  };
}

export async function loadQuotationSettings(
  ctx: AccountContext
): Promise<QuotationSettings> {
  let { data, error } = await ctx.supabase
    .from('quotation_settings')
    .select('*')
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (!data && !error) {
    const result = await ctx.supabase
      .from('quotation_settings')
      .insert({
        account_id: ctx.accountId,
        company_display_name: ctx.account.name,
      })
      .select('*')
      .single();
    data = result.data;
    error = result.error;
  }
  if (error || !data) throw new Error('quotation_settings_load_failed');

  // The general company logo is the automatic fallback for quotations. Keep
  // the optional quotation-specific URL separate so changing the account logo
  // continues to update future documents without copying URLs between forms.
  const { data: accountBranding, error: brandingError } = await ctx.supabase
    .from('accounts')
    .select('logo_url')
    .eq('id', ctx.accountId)
    .maybeSingle();
  if (brandingError) {
    console.error('[quotes] account branding load failed:', brandingError);
  }

  return settingsFromRow(data as Row, nullableText(accountBranding?.logo_url));
}

export async function buildQuotationDocumentData(
  ctx: AccountContext,
  quotation: QuotationRecord
): Promise<QuotationDocumentData> {
  const settings = await loadQuotationSettings(ctx);
  let vehicleImageUrl = quotation.vehicleImageUrl;
  if (quotation.catalogItemId) {
    const { data: image } = await ctx.supabase
      .from('catalog_item_images')
      .select('storage_path')
      .eq('account_id', ctx.accountId)
      .eq('catalog_item_id', quotation.catalogItemId)
      .eq('is_primary', true)
      .maybeSingle();
    if (image?.storage_path) {
      const { data: signed } = await ctx.supabase.storage
        .from('catalog-media')
        .createSignedUrl(image.storage_path, 600);
      vehicleImageUrl = signed?.signedUrl ?? vehicleImageUrl;
    }
  }
  const snapshotQuote: QuotationRecord = {
    ...quotation,
    vehicleImageUrl,
  };
  return {
    quotation: snapshotQuote,
    settings,
    executive: {
      name: quotation.executiveName,
      phone: quotation.executivePhone,
      email: quotation.executiveEmail,
    },
    installments: quotation.installments,
    generatedAt: new Date().toISOString(),
  };
}

export interface QuotationListFilters {
  query?: string;
  status?: QuotationStatus;
  contactId?: string;
  conversationId?: string;
  page?: number;
  pageSize?: number;
}

export async function loadQuotations(
  ctx: AccountContext,
  filters: QuotationListFilters = {}
): Promise<{
  quotations: QuotationRecord[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  let query = ctx.supabase
    .from('quotations')
    .select('*, quotation_installment_options(*)', { count: 'exact' })
    .eq('account_id', ctx.accountId)
    .order('updated_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.contactId) query = query.eq('contact_id', filters.contactId);
  if (filters.conversationId) {
    query = query.eq('conversation_id', filters.conversationId);
  }
  if (filters.query?.trim()) {
    const escaped = filters.query.trim().replace(/[%_,()]/g, '');
    if (escaped) {
      query = query.or(
        `quote_number.ilike.%${escaped}%,client_name.ilike.%${escaped}%,client_phone.ilike.%${escaped}%,vehicle_make.ilike.%${escaped}%,vehicle_model.ilike.%${escaped}%`
      );
    }
  }
  const { data, error, count } = await query;
  if (error) throw new Error('quotations_load_failed');
  return {
    quotations: ((data ?? []) as Row[]).map((row) => quotationFromRow(row)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function loadQuotation(
  ctx: AccountContext,
  quotationId: string
): Promise<{
  quotation: QuotationRecord;
  versions: QuotationVersion[];
  sends: QuotationSendSummary[];
  events: QuotationActivity[];
}> {
  const [quoteResult, versionsResult, sendsResult, eventsResult] =
    await Promise.all([
      ctx.supabase
        .from('quotations')
        .select('*, quotation_installment_options(*)')
        .eq('account_id', ctx.accountId)
        .eq('id', quotationId)
        .single(),
      ctx.supabase
        .from('quotation_versions')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('version_number', { ascending: false }),
      ctx.supabase
        .from('quotation_sends')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('created_at', { ascending: false }),
      ctx.supabase
        .from('quotation_events')
        .select('*')
        .eq('quotation_id', quotationId)
        .order('created_at', { ascending: false }),
    ]);
  if (quoteResult.error || !quoteResult.data) {
    throw new Error('quotation_not_found');
  }
  const versions: QuotationVersion[] = (
    (versionsResult.data ?? []) as Row[]
  ).map((row) => ({
    id: String(row.id),
    quotationId: String(row.quotation_id),
    versionNumber: numeric(row.version_number),
    snapshot: row.snapshot as unknown as QuotationDocumentData,
    generationStatus:
      row.generation_status === 'ready' || row.generation_status === 'failed'
        ? row.generation_status
        : 'pending',
    generationError: nullableText(row.generation_error),
    pdfStoragePath: nullableText(row.pdf_storage_path),
    pngStoragePath: nullableText(row.png_storage_path),
    createdAt: String(row.created_at),
  }));
  return {
    quotation: quotationFromRow(quoteResult.data as Row),
    versions,
    sends: ((sendsResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      versionId: nullableText(row.quotation_version_id),
      format:
        row.attachment_format === 'png' || row.attachment_format === 'both'
          ? row.attachment_format
          : 'pdf',
      status:
        row.status === 'sending' ||
        row.status === 'sent' ||
        row.status === 'partial' ||
        row.status === 'failed'
          ? row.status
          : 'pending',
      errorMessage: nullableText(row.error_message),
      createdAt: String(row.created_at),
      completedAt: nullableText(row.completed_at),
    })),
    events: ((eventsResult.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type) as QuotationActivity['eventType'],
      actorUserId: nullableText(row.actor_user_id),
      fromStatus: nullableText(row.from_status) as QuotationStatus | null,
      toStatus: nullableText(row.to_status) as QuotationStatus | null,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: String(row.created_at),
    })),
  };
}
