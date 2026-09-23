import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { hasMinRole } from '@/lib/auth/roles';
import { loadContract } from '@/lib/contracts/server';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { isUuid } from '@/lib/validation/uuid';

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/contracts/[id]'>
) {
  try {
    const { id } = await context.params;
    if (!isUuid(id))
      return NextResponse.json(
        { error: 'Contrato inválido.' },
        { status: 400 }
      );
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `contract-delete:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const detail = await loadContract(ctx, id);
    const canDelete =
      hasMinRole(ctx.role, 'admin') ||
      detail.contract.createdByUserId === ctx.userId;
    if (!canDelete)
      return NextResponse.json(
        { error: 'Solo puedes eliminar los contratos que creaste.' },
        { status: 403 }
      );

    const storagePaths = detail.versions
      .map((version) => version.pdfStoragePath)
      .filter((path): path is string => Boolean(path));
    if (storagePaths.length) {
      const { error: storageError } = await ctx.supabase.storage
        .from('contract-documents')
        .remove(storagePaths);
      if (storageError) {
        console.error('[contracts] artifact delete failed:', storageError);
        return NextResponse.json(
          { error: 'No fue posible eliminar los archivos PDF del contrato.' },
          { status: 500 }
        );
      }
    }

    const { data: deletedRows, error } = await ctx.supabase
      .from('contracts')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .select('id');
    if (error) {
      console.error('[contracts] delete failed:', error);
      return NextResponse.json(
        { error: 'No fue posible eliminar el contrato.' },
        { status: 500 }
      );
    }
    if (!deletedRows?.length)
      return NextResponse.json(
        { error: 'No tienes permiso para eliminar este contrato.' },
        { status: 403 }
      );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
