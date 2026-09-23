import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const { data, error } = await ctx.supabase
      .from('platform_support_conversations')
      .select(
        'id, status, resolution_type, current_path, feedback, escalated_at, closed_at, created_at, updated_at, platform_support_messages(id, sender_type, content, metadata, created_at)'
      )
      .eq('user_id', ctx.userId)
      .eq('account_id', ctx.accountId)
      .order('updated_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    return NextResponse.json(
      { conversations: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const feedback = body?.feedback;
    if (
      !id ||
      !['resolved', 'partial', 'needs_support'].includes(String(feedback))
    ) {
      return NextResponse.json(
        { error: 'Evaluación inválida.' },
        { status: 400 }
      );
    }
    const { data: owned } = await ctx.supabase
      .from('platform_support_conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', ctx.userId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!owned)
      return NextResponse.json(
        { error: 'Conversación no encontrada.' },
        { status: 404 }
      );
    const { error } = await supabaseAdmin()
      .from('platform_support_conversations')
      .update({
        feedback,
        ...(feedback === 'resolved'
          ? {
              status: 'resolved',
              resolution_type: 'ai_resolved',
              closed_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const id = new URL(request.url).searchParams.get('id');
    if (!id)
      return NextResponse.json(
        { error: 'Falta la conversación.' },
        { status: 400 }
      );
    const { data: owned } = await ctx.supabase
      .from('platform_support_conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', ctx.userId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!owned)
      return NextResponse.json(
        { error: 'Conversación no encontrada.' },
        { status: 404 }
      );
    const { error } = await supabaseAdmin()
      .from('platform_support_conversations')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
