import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  CUSTOMER_BASE_EXPORT_LIMIT,
  CUSTOMER_BASE_PAGE_SIZE,
  parseCustomerBaseFilters,
  type CustomerBaseRow,
} from '@/lib/contacts/customer-base';

const CUSTOMER_BASE_COLUMNS =
  'contact_id, account_id, full_name, rut, phone, email, company, city, vehicle_interest, down_payment, income_proof, employment_type, employment_tenure, has_dicom, trade_in, trade_in_vehicle, purchase_timeline, financing_requested, evaluation_status, source, next_follow_up_at, commercial_notes, tag_ids, tags, conversation_id, conversation_status, assigned_agent_id, assigned_agent_name, assigned_agent_email, department_id, department_name, last_contact_at, profile_updated_at, has_profile, profile_completed_fields, profile_completion, search_text';

function addOneDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString();
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function safeCell(value: unknown): string {
  if (value === null || value === undefined || value === '')
    return 'No informado';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';

  let text = String(value).replace(/\r?\n/g, ' ').trim();
  // Prevent spreadsheet programs from interpreting customer-controlled text
  // as a formula when the CSV is opened in Excel or similar tools.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}

function csvCell(value: unknown): string {
  return `"${safeCell(value).replace(/"/g, '""')}"`;
}

function tagsCell(row: CustomerBaseRow): string {
  return (row.tags ?? []).map((tag) => tag.name).join(', ');
}

function csvForRows(rows: CustomerBaseRow[]): string {
  const headers = [
    'Nombre completo',
    'RUT',
    'Teléfono',
    'Correo',
    'Empresa',
    'Ciudad o comuna',
    'Vehículo que busca',
    'Pie disponible',
    'Acredita ingresos',
    'Tipo de contrato',
    'Antigüedad laboral',
    'Presenta DICOM',
    'Solicita financiamiento',
    'Vehículo en parte de pago',
    'Detalle parte de pago',
    'Cuándo desea comprar',
    'Etiquetas',
    'Estado',
    'Canal de origen',
    'Ejecutivo',
    'Departamento',
    'Avance de ficha',
    'Último contacto',
  ];

  const lines = rows.map((row) =>
    [
      row.full_name,
      row.rut,
      row.phone,
      row.email,
      row.company,
      row.city,
      row.vehicle_interest,
      row.down_payment,
      row.income_proof,
      row.employment_type,
      row.employment_tenure,
      row.has_dicom,
      row.financing_requested,
      row.trade_in,
      row.trade_in_vehicle,
      row.purchase_timeline,
      tagsCell(row),
      row.evaluation_status,
      row.source,
      row.assigned_agent_name,
      row.department_name,
      `${row.profile_completion}%`,
      row.last_contact_at,
    ]
      .map(csvCell)
      .join(';')
  );

  // BOM + semicolon delimiter keep accents and columns working in the common
  // Chilean Excel locale without an import wizard.
  return `\uFEFF${headers.map(csvCell).join(';')}\r\n${lines.join('\r\n')}`;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const url = new URL(request.url);
    const filters = parseCustomerBaseFilters(url.searchParams);
    const exportCsv = url.searchParams.get('export') === 'csv';

    const buildQuery = (includeCount: boolean) => {
      const query = includeCount
        ? ctx.supabase
            .from('customer_base_view')
            .select(CUSTOMER_BASE_COLUMNS, { count: 'exact' })
        : ctx.supabase.from('customer_base_view').select(CUSTOMER_BASE_COLUMNS);
      let filtered = query.eq('account_id', ctx.accountId);

      if (filters.search) {
        filtered = filtered.ilike(
          'search_text',
          `%${escapeIlike(filters.search.toLocaleLowerCase('es-CL'))}%`
        );
      }
      if (filters.tagIds.length) {
        filtered = filtered.overlaps('tag_ids', filters.tagIds);
      }
      if (filters.source) filtered = filtered.eq('source', filters.source);
      if (filters.assignedAgentId) {
        filtered = filtered.eq('assigned_agent_id', filters.assignedAgentId);
      }
      if (filters.departmentId) {
        filtered = filtered.eq('department_id', filters.departmentId);
      }
      if (filters.evaluationStatus) {
        filtered = filtered.eq('evaluation_status', filters.evaluationStatus);
      }
      if (filters.dateFrom) {
        filtered = filtered.gte(
          'last_contact_at',
          `${filters.dateFrom}T00:00:00.000Z`
        );
      }
      if (filters.dateTo) {
        filtered = filtered.lt('last_contact_at', addOneDay(filters.dateTo));
      }

      if (filters.profile === 'complete') {
        filtered = filtered.eq('profile_completion', 100);
      } else if (filters.profile === 'incomplete') {
        filtered = filtered.lt('profile_completion', 100);
      } else if (filters.profile === 'with_data') {
        filtered = filtered.eq('has_profile', true);
      } else if (filters.profile === 'without_data') {
        filtered = filtered.eq('has_profile', false);
      }

      return filtered;
    };

    if (exportCsv) {
      const rows: CustomerBaseRow[] = [];
      const batchSize = 1_000;

      while (rows.length < CUSTOMER_BASE_EXPORT_LIMIT) {
        const from = rows.length;
        const to = Math.min(
          from + batchSize - 1,
          CUSTOMER_BASE_EXPORT_LIMIT - 1
        );
        const { data, error } = await buildQuery(false)
          .order('last_contact_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        const batch = (data ?? []) as unknown as CustomerBaseRow[];
        rows.push(...batch);
        if (batch.length < batchSize) break;
      }

      const { error: auditError } = await ctx.supabase
        .from('contact_export_logs')
        .insert({
          account_id: ctx.accountId,
          exported_by_user_id: ctx.userId,
          export_format: 'csv',
          // Record which filters were used without retaining a searched name,
          // phone or RUT in a second table.
          filters: {
            ...filters,
            search: filters.search ? '[applied]' : '',
          },
          row_count: rows.length,
        });
      if (auditError) throw auditError;

      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      return new NextResponse(csvForRows(rows), {
        headers: {
          'Cache-Control': 'no-store, private',
          'Content-Disposition': `attachment; filename="clientes-nexora-${date}.csv"`,
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const requestedPage = Number(url.searchParams.get('page') ?? '1');
    const page = Number.isInteger(requestedPage)
      ? Math.max(1, requestedPage)
      : 1;
    const from = (page - 1) * CUSTOMER_BASE_PAGE_SIZE;
    const to = from + CUSTOMER_BASE_PAGE_SIZE - 1;
    const { data, count, error } = await buildQuery(true)
      .order('last_contact_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return NextResponse.json(
      {
        rows: (data ?? []) as unknown as CustomerBaseRow[],
        total: count ?? 0,
        page,
        pageSize: CUSTOMER_BASE_PAGE_SIZE,
      },
      { headers: { 'Cache-Control': 'no-store, private' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
