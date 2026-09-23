import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { loadEmbeddingsKey } from '@/lib/ai/config';
import { ingestDocument } from '@/lib/ai/knowledge';
import { AiError } from '@/lib/ai/types';

/**
 * GET /api/ai/knowledge
 *
 * List the account's knowledge-base documents (any member).
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const type = new URL(request.url).searchParams.get('type');
    let query = supabase
      .from('ai_knowledge_documents')
      .select(
        'id, title, document_type, is_active, tags, created_by, updated_by_user_id, created_at, updated_at'
      )
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false });
    if (type === 'faq' || type === 'document') {
      query = query.eq('document_type', type);
    }
    const { data, error } = await query;
    if (error) {
      console.error('[ai/knowledge GET] error:', error);
      return NextResponse.json(
        { error: 'Failed to load knowledge base' },
        { status: 500 }
      );
    }
    return NextResponse.json({ documents: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/ai/knowledge  (admin+)
 *
 * Create a document, then chunk + (optionally) embed it. If indexing
 * fails the document is still saved so the admin can retry via reindex.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content =
      typeof body?.content === 'string' ? body.content.trim() : '';
    const documentType = body?.document_type === 'faq' ? 'faq' : 'document';
    const isActive = body?.is_active !== false;
    const tags = Array.isArray(body?.tags)
      ? [
          ...new Set(
            body.tags
              .filter((tag: unknown): tag is string => typeof tag === 'string')
              .map((tag: string) => tag.trim())
              .filter(Boolean)
          ),
        ].slice(0, 20)
      : [];
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    const { data: doc, error } = await supabase
      .from('ai_knowledge_documents')
      .insert({
        account_id: accountId,
        created_by: userId,
        updated_by_user_id: userId,
        title,
        content,
        document_type: documentType,
        is_active: isActive,
        tags,
      })
      .select('id')
      .single();
    if (error || !doc) {
      console.error('[ai/knowledge POST] insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 }
      );
    }

    if (!isActive) {
      return NextResponse.json({ success: true, id: doc.id });
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId
    );
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content
      );
    } catch (err) {
      const message = err instanceof AiError ? err.message : 'indexing failed';
      console.error('[ai/knowledge POST] ingest error:', err);
      return NextResponse.json(
        {
          success: true,
          id: doc.id,
          warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
        },
        { status: 200 }
      );
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning:
          'Saved with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).',
      });
    }
    return NextResponse.json({ success: true, id: doc.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
