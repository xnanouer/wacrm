import type { SupabaseClient } from '@supabase/supabase-js';

import { chunkText } from '@/lib/ai/chunk';

interface SupportMatch {
  id: string;
  document_id: string;
  title: string;
  content: string;
  rank: number;
}

export async function indexPlatformSupportDocument(
  db: SupabaseClient,
  documentId: string,
  content: string
) {
  const chunks = chunkText(content);
  const { error: deleteError } = await db
    .from('platform_support_chunks')
    .delete()
    .eq('document_id', documentId);
  if (deleteError) throw deleteError;
  if (!chunks.length) return;
  const { error } = await db.from('platform_support_chunks').insert(
    chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk,
    }))
  );
  if (error) throw error;
}

export async function retrievePlatformSupportKnowledge(
  db: SupabaseClient,
  query: string,
  limit = 5
): Promise<SupportMatch[]> {
  if (!query.trim()) return [];
  const stopWords = new Set([
    'para',
    'pero',
    'como',
    'porque',
    'desde',
    'esta',
    'este',
    'esto',
    'tengo',
    'puedo',
    'quiero',
    'necesito',
    'ayuda',
  ]);
  const terms = Array.from(
    new Set(query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
  )
    .filter((term) => !stopWords.has(term))
    .slice(0, 8);
  const lexicalQuery = terms.length ? terms.join(' OR ') : query.trim();
  const { data, error } = await db.rpc('match_platform_support_fts', {
    p_query: lexicalQuery,
    p_match_count: Math.min(10, Math.max(1, limit)),
  });
  if (error) {
    console.error(
      '[platform support] knowledge retrieval failed:',
      error.message
    );
    return [];
  }
  const matches = (data ?? []) as SupportMatch[];
  if (matches.length) return matches;

  // A greeting or very broad question may have no lexical token in common
  // with a document. Ground it with a small published overview instead of
  // treating a harmless first message as an automatic escalation.
  const { data: fallback, error: fallbackError } = await db
    .from('platform_support_documents')
    .select('id, title, content')
    .eq('status', 'published')
    .in('category', ['Primeros pasos', 'Problemas frecuentes'])
    .order('updated_at', { ascending: false })
    .limit(2);
  if (fallbackError) return [];
  return (fallback ?? []).map((document) => ({
    id: document.id,
    document_id: document.id,
    title: document.title,
    content: document.content,
    rank: 0,
  }));
}
