import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import { indexPlatformSupportDocument } from '@/lib/platform-support/knowledge';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

function validate(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const category =
    typeof body.category === 'string' ? body.category.trim() : 'general';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const status = body.status;
  if (
    title.length < 2 ||
    title.length > 180 ||
    category.length < 2 ||
    category.length > 80 ||
    content.length < 10 ||
    content.length > 100000 ||
    !['draft', 'published', 'archived'].includes(String(status))
  )
    return null;
  return {
    title,
    category,
    content,
    status: String(status),
    published_at: status === 'published' ? new Date().toISOString() : null,
  };
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `support-kb:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const values = body ? validate(body) : null;
    if (!values)
      return NextResponse.json(
        { error: 'Documento inválido.' },
        { status: 400 }
      );
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('platform_support_documents')
      .insert({ ...values, created_by: actor.userId })
      .select('id')
      .single();
    if (error) throw error;
    await indexPlatformSupportDocument(admin, data.id, values.content);
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.support_document_created',
      next_data: { id: data.id, status: values.status },
      reason: 'Documento agregado a la base de conocimiento global',
    });
    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const values = body ? validate(body) : null;
    if (!id || !values)
      return NextResponse.json(
        { error: 'Documento inválido.' },
        { status: 400 }
      );
    const admin = supabaseAdmin();
    const { error } = await admin
      .from('platform_support_documents')
      .update(values)
      .eq('id', id);
    if (error) throw error;
    await indexPlatformSupportDocument(admin, id, values.content);
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.support_document_updated',
      next_data: { id, status: values.status },
      reason: 'Base de conocimiento global actualizada',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `support-kb:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id)
      return NextResponse.json(
        { error: 'Falta el documento.' },
        { status: 400 }
      );
    const admin = supabaseAdmin();
    const { data: document, error } = await admin
      .from('platform_support_documents')
      .select('content, status')
      .eq('id', id)
      .single();
    if (error) throw error;
    await indexPlatformSupportDocument(admin, id, document.content);
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.support_document_reindexed',
      next_data: { id, status: document.status },
      reason: 'Documento global reindexado manualmente',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const id = new URL(request.url).searchParams.get('id');
    if (!id)
      return NextResponse.json(
        { error: 'Falta el documento.' },
        { status: 400 }
      );
    const admin = supabaseAdmin();
    const { error } = await admin
      .from('platform_support_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.support_document_deleted',
      next_data: { id },
      reason: 'Documento eliminado de la base de conocimiento global',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
