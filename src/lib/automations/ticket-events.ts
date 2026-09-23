import { supabaseAdmin } from './admin-client';
import { runAutomationsForTrigger, type AutomationContext } from './engine';
import type { AutomationTriggerType } from '@/types';

interface TicketAutomationQueueRow {
  id: string;
  account_id: string;
  ticket_event_id: string;
  contact_id: string | null;
  trigger_type: AutomationTriggerType;
  context: AutomationContext | null;
  attempts: number;
}

export interface TicketAutomationProcessResult {
  processed: number;
  failed: number;
}

/** Drain ticket-event work claimed atomically by the database. */
export async function processTicketAutomationEvents(
  limit = 50
): Promise<TicketAutomationProcessResult> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('claim_ticket_automation_events', {
    p_limit: limit,
  });

  if (error)
    throw new Error(`ticket automation claim failed: ${error.message}`);

  let processed = 0;
  let failed = 0;

  for (const row of (data ?? []) as TicketAutomationQueueRow[]) {
    try {
      await runAutomationsForTrigger({
        accountId: row.account_id,
        triggerType: row.trigger_type,
        contactId: row.contact_id,
        context: row.context ?? {},
        ticketEventId: row.ticket_event_id,
      });

      const { error: doneError } = await db
        .from('automation_ticket_event_queue')
        .update({
          status: 'done',
          processed_at: new Date().toISOString(),
          claimed_at: null,
          error_message: null,
        })
        .eq('id', row.id)
        .eq('status', 'running');

      if (doneError) throw doneError;
      processed++;
    } catch (error) {
      const terminal = row.attempts >= 3;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from('automation_ticket_event_queue')
        .update({
          status: terminal ? 'failed' : 'pending',
          available_at: new Date(
            Date.now() + row.attempts * 60_000
          ).toISOString(),
          claimed_at: null,
          error_message: message.slice(0, 1000),
        })
        .eq('id', row.id);
      failed++;
    }
  }

  return { processed, failed };
}
