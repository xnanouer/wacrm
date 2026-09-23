import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

/**
 * Tenant administrators no longer handle provider credentials. Keeping this
 * explicit response prevents an older cached client from testing or replacing
 * Nexora's platform-owned key.
 */
export async function POST() {
  try {
    await requireRole('admin');
    return NextResponse.json(
      {
        error:
          'La conexión con el proveedor es administrada por Nexora y no está disponible en las cuentas de empresa.',
        code: 'ai_managed_by_platform',
      },
      { status: 410 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
