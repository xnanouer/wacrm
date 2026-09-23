import type { Metadata } from 'next';

import { QuotationEditor } from '@/components/quotes/quotation-editor';
import { requireRole } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Nueva cotización | Nexora' };

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string | string[] }>;
}) {
  await requireRole('agent');
  const params = await searchParams;
  const conversationId =
    typeof params.conversationId === 'string' ? params.conversationId : null;
  return <QuotationEditor conversationId={conversationId} />;
}
