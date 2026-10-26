import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  CATALOG_IMPORT_MAX_ROWS,
  type CatalogImportIssue,
} from '@/lib/catalog/import';
import {
  parseCatalogVehicleInput,
  toCatalogVehiclePayload,
} from '@/lib/catalog/payload';
import { loadCatalogData } from '@/lib/catalog/server';
import type { CatalogVehicleInput } from '@/lib/catalog/types';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

interface ParsedImportRow {
  rowNumber: number;
  input: CatalogVehicleInput;
}

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function mutationErrorMessage(error: {
  code?: string;
  message?: string;
}): string {
  const message = error.message ?? '';
  if (message.includes('catalog_possible_duplicate')) {
    return 'Ya existe una unidad con la misma patente.';
  }
  if (message.includes('catalog_capacity_reached')) {
    return 'Se alcanzó el límite de unidades activas del catálogo.';
  }
  if (error.code === '23505') {
    return 'El código interno ya está siendo utilizado.';
  }
  return 'No fue posible guardar esta fila.';
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `catalog-import:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      vehicles?: unknown[];
    } | null;
    if (!Array.isArray(body?.vehicles) || body.vehicles.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron vehículos para importar.' },
        { status: 400 }
      );
    }
    if (body.vehicles.length > CATALOG_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Solo puedes importar hasta ${CATALOG_IMPORT_MAX_ROWS} vehículos por archivo.`,
        },
        { status: 400 }
      );
    }

    const parsedRows: ParsedImportRow[] = [];
    const issues: CatalogImportIssue[] = [];
    body.vehicles.forEach((entry, index) => {
      const source =
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : {};
      const rowNumber =
        typeof source.rowNumber === 'number' &&
        Number.isInteger(source.rowNumber) &&
        source.rowNumber > 1
          ? source.rowNumber
          : index + 2;
      const parsed = parseCatalogVehicleInput(source.input);
      if (!parsed.ok) {
        issues.push({ rowNumber, message: parsed.error });
        return;
      }
      parsedRows.push({ rowNumber, input: parsed.value });
    });

    const seenCodes = new Map<string, number>();
    const seenPlates = new Map<string, number>();
    for (const row of parsedRows) {
      const code = row.input.internalCode.toLocaleLowerCase('es');
      const previousCodeRow = seenCodes.get(code);
      if (previousCodeRow) {
        issues.push({
          rowNumber: row.rowNumber,
          message: `El código interno también aparece en la fila ${previousCodeRow}.`,
        });
      } else {
        seenCodes.set(code, row.rowNumber);
      }

      const plate = normalizePlate(row.input.licensePlate);
      const previousPlateRow = plate ? seenPlates.get(plate) : undefined;
      if (previousPlateRow) {
        issues.push({
          rowNumber: row.rowNumber,
          message: `La patente también aparece en la fila ${previousPlateRow}.`,
        });
      } else if (plate) {
        seenPlates.set(plate, row.rowNumber);
      }
    }

    if (issues.length > 0) {
      return NextResponse.json(
        { error: 'Corrige las filas indicadas antes de importar.', issues },
        { status: 400 }
      );
    }

    const catalog = await loadCatalogData(ctx);
    if (parsedRows.length > catalog.usage.remaining) {
      return NextResponse.json(
        {
          error: `El archivo contiene ${parsedRows.length} vehículos, pero quedan ${catalog.usage.remaining} espacios disponibles.`,
        },
        { status: 409 }
      );
    }

    const existingCodes = new Set(
      catalog.vehicles.map((vehicle) =>
        vehicle.internalCode.toLocaleLowerCase('es')
      )
    );
    const existingPlates = new Set(
      catalog.vehicles
        .map((vehicle) => normalizePlate(vehicle.licensePlate))
        .filter((plate) => plate && plate !== 'SINPATENTE')
    );
    for (const row of parsedRows) {
      if (existingCodes.has(row.input.internalCode.toLocaleLowerCase('es'))) {
        issues.push({
          rowNumber: row.rowNumber,
          message: 'El código interno ya existe en el catálogo.',
        });
      }
      const plate = normalizePlate(row.input.licensePlate);
      if (plate && existingPlates.has(plate)) {
        issues.push({
          rowNumber: row.rowNumber,
          message: 'La patente ya existe en el catálogo.',
        });
      }
    }
    if (issues.length > 0) {
      return NextResponse.json(
        { error: 'Hay datos que ya existen en el catálogo.', issues },
        { status: 409 }
      );
    }

    const importedIds: string[] = [];
    const failedRows: CatalogImportIssue[] = [];
    for (const row of parsedRows) {
      const { data, error } = await ctx.supabase.rpc(
        'import_catalog_text_vehicle',
        {
          p_payload: toCatalogVehiclePayload(row.input),
          p_confirm_possible_duplicate: false,
        }
      );
      if (error) {
        console.error('[catalog import] row failed:', {
          rowNumber: row.rowNumber,
          code: error.code,
          message: error.message,
        });
        failedRows.push({
          rowNumber: row.rowNumber,
          message: mutationErrorMessage(error),
        });
      } else if (typeof data === 'string') {
        importedIds.push(data);
      }
    }

    return NextResponse.json(
      {
        imported: importedIds.length,
        ids: importedIds,
        issues: failedRows,
        message:
          failedRows.length === 0
            ? ctx.role === 'owner' || ctx.role === 'admin'
              ? `${importedIds.length} vehículos incorporados al catálogo de texto y disponibles para compartir.`
              : `${importedIds.length} vehículos incorporados como catálogo de texto y enviados a aprobación.`
            : `${importedIds.length} vehículos importados y ${failedRows.length} filas con problemas.`,
      },
      { status: failedRows.length > 0 ? 207 : 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
