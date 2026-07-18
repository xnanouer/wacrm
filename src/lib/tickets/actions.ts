import type { SupabaseClient } from '@supabase/supabase-js';

import type { Conversation, ConversationStatus } from '@/types';
import { isUuid } from '@/lib/validation/uuid';

export type TicketActionInput =
  | { action: 'accept' }
  | { action: 'status'; status: ConversationStatus; note?: string }
  | {
      action: 'transfer';
      assignedAgentId: string | null;
      departmentId?: string | null;
      note?: string;
    }
  | { action: 'department'; departmentId: string; note?: string };

export class TicketActionError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TicketActionError';
    this.status = status;
  }
}

const VALID_STATUSES: readonly ConversationStatus[] = [
  'pending',
  'open',
  'waiting',
  'closed',
];

function optionalNote(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new TicketActionError('note must be a string');
  }
  const note = value.trim();
  if (note.length > 1000) {
    throw new TicketActionError('note must be 1000 characters or fewer');
  }
  return note || undefined;
}

export function parseTicketAction(value: unknown): TicketActionInput {
  if (!value || typeof value !== 'object') {
    throw new TicketActionError('A ticket action is required');
  }
  const body = value as Record<string, unknown>;
  const note = optionalNote(body.note);

  if (body.action === 'accept') return { action: 'accept' };

  if (body.action === 'status') {
    if (
      typeof body.status !== 'string' ||
      !VALID_STATUSES.includes(body.status as ConversationStatus)
    ) {
      throw new TicketActionError('Invalid ticket status');
    }
    return {
      action: 'status',
      status: body.status as ConversationStatus,
      note,
    };
  }

  if (body.action === 'transfer') {
    if (body.assignedAgentId !== null && !isUuid(body.assignedAgentId)) {
      throw new TicketActionError('assignedAgentId must be a UUID or null');
    }
    if (
      body.departmentId !== undefined &&
      body.departmentId !== null &&
      !isUuid(body.departmentId)
    ) {
      throw new TicketActionError('departmentId must be a UUID');
    }
    return {
      action: 'transfer',
      assignedAgentId: body.assignedAgentId as string | null,
      departmentId: body.departmentId as string | null | undefined,
      note,
    };
  }

  if (body.action === 'department') {
    if (!isUuid(body.departmentId)) {
      throw new TicketActionError('departmentId is required');
    }
    return { action: 'department', departmentId: body.departmentId, note };
  }

  throw new TicketActionError('Unknown ticket action');
}

function mapRpcError(error: {
  message?: string;
  code?: string;
}): TicketActionError {
  const message = error.message ?? 'Ticket operation failed';
  const known: Record<string, string> = {
    ticket_not_found: 'Ticket not found',
    ticket_forbidden: 'You do not have permission to operate this ticket',
    ticket_not_pending: 'Only pending tickets can be accepted',
    ticket_already_assigned: 'This ticket was accepted by another executive',
    only_owner_can_transfer:
      'Only the assigned executive can transfer this ticket',
    invalid_target_agent: 'The selected executive is not available',
    target_not_in_department:
      'The selected executive is not in that department',
    accept_ticket_first: 'Accept the ticket before opening it',
    invalid_department: 'The selected department is not available',
    department_forbidden: 'You cannot move tickets to that department',
  };
  const key = Object.keys(known).find((candidate) =>
    message.includes(candidate)
  );
  const status =
    error.code === '42501' || message.includes('forbidden') ? 403 : 400;
  return new TicketActionError(
    key ? known[key] : 'Ticket operation failed',
    status
  );
}

export async function runTicketAction(
  db: SupabaseClient,
  conversationId: string,
  input: TicketActionInput
): Promise<Conversation> {
  let rpcName: string;
  let params: Record<string, unknown>;

  switch (input.action) {
    case 'accept':
      rpcName = 'accept_ticket';
      params = { p_conversation_id: conversationId };
      break;
    case 'status':
      rpcName = 'set_ticket_status';
      params = {
        p_conversation_id: conversationId,
        p_status: input.status,
        p_note: input.note ?? null,
      };
      break;
    case 'transfer':
      rpcName = 'transfer_ticket';
      params = {
        p_conversation_id: conversationId,
        p_assigned_agent_id: input.assignedAgentId,
        p_department_id: input.departmentId ?? null,
        p_note: input.note ?? null,
      };
      break;
    case 'department':
      rpcName = 'set_ticket_department';
      params = {
        p_conversation_id: conversationId,
        p_department_id: input.departmentId,
        p_note: input.note ?? null,
      };
      break;
  }

  const { data, error } = await db.rpc(rpcName, params);
  if (error) throw mapRpcError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row)
    throw new TicketActionError('Ticket operation returned no data', 500);
  return row as Conversation;
}
