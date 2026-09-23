import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/automations/admin-client';
import { isAuthorizedCronRequest, isCronConfigured } from '@/lib/cron/auth';
import type { QuotationStatus } from '@/lib/quotes/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const now = new Date();

  await admin
    .from('quotations')
    .update({ status: 'expired' })
    .in('status', ['generated', 'sent', 'negotiating'])
    .lt('valid_until', now.toISOString().slice(0, 10));

  const { data: rows, error } = await admin
    .from('quotations')
    .select('id, account_id, status, scheduled_deletion_at, deletion_hold')
    .eq('deletion_hold', false)
    .not('scheduled_deletion_at', 'is', null)
    .order('scheduled_deletion_at', { ascending: true })
    .limit(1000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (rows ?? []).map((row) => row.id as string);
  const [{ data: versions }, { data: warnings }] = await Promise.all([
    ids.length
      ? admin
          .from('quotation_versions')
          .select('quotation_id, pdf_storage_path, png_storage_path')
          .in('quotation_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? admin
          .from('quotation_events')
          .select('quotation_id')
          .eq('event_type', 'retention_warning')
          .in('quotation_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const warned = new Set(
    (warnings ?? []).map((row) => row.quotation_id as string)
  );
  const pathsByQuote = new Map<string, string[]>();
  for (const version of versions ?? []) {
    const quoteId = version.quotation_id as string;
    const paths = pathsByQuote.get(quoteId) ?? [];
    if (version.pdf_storage_path)
      paths.push(version.pdf_storage_path as string);
    if (version.png_storage_path)
      paths.push(version.png_storage_path as string);
    pathsByQuote.set(quoteId, paths);
  }

  let warnedCount = 0;
  let deleted = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const row of rows ?? []) {
    const status = row.status as QuotationStatus;
    const scheduledDeletion = new Date(String(row.scheduled_deletion_at));
    if (Number.isNaN(scheduledDeletion.getTime())) continue;
    const quoteId = row.id as string;
    if (scheduledDeletion.getTime() <= now.getTime()) {
      const paths = pathsByQuote.get(quoteId) ?? [];
      if (paths.length) {
        const { error: storageError } = await admin.storage
          .from('quotation-documents')
          .remove(paths);
        if (storageError) {
          failures.push({ id: quoteId, error: storageError.message });
          continue;
        }
      }
      const { error: deleteError } = await admin
        .from('quotations')
        .delete()
        .eq('id', quoteId)
        .eq('deletion_hold', false)
        .neq('status', 'financing_pending');
      if (deleteError)
        failures.push({ id: quoteId, error: deleteError.message });
      else deleted += 1;
      continue;
    }
    if (
      scheduledDeletion.getTime() <= now.getTime() + 3 * 86_400_000 &&
      !warned.has(quoteId)
    ) {
      const { error: warningError } = await admin
        .from('quotation_events')
        .insert({
          account_id: row.account_id,
          quotation_id: quoteId,
          event_type: 'retention_warning',
          actor_user_id: null,
          metadata: {
            status,
            scheduled_delete_at: scheduledDeletion.toISOString(),
          },
        });
      if (!warningError) warnedCount += 1;
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    warned: warnedCount,
    deleted,
    failures,
  });
}
