import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MessageStatus } from '@/types';
import {
  canAdvanceMessageStatus,
  whatsappWebAckToStatus,
} from '@/lib/whatsapp/message-status';
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';
import { isWhatsAppBridgeRequestAuthorized } from '@/lib/whatsapp/bridge-auth';

let adminClient: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return adminClient;
}

interface StatusBody {
  accountId: string;
  connectionId: string;
  messageId: string;
  ack: number;
}

export async function POST(request: Request) {
  if (!isWhatsAppBridgeRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as StatusBody;
  if (
    !/^[0-9a-f-]{36}$/i.test(body.accountId || '') ||
    !/^[0-9a-f-]{36}$/i.test(body.connectionId || '') ||
    typeof body.messageId !== 'string' ||
    !body.messageId ||
    body.messageId.length > 500 ||
    !Number.isInteger(body.ack)
  ) {
    return NextResponse.json(
      {
        error:
          'A valid accountId, connectionId, messageId and ack are required.',
      },
      { status: 400 }
    );
  }

  const nextStatus = whatsappWebAckToStatus(body.ack);
  if (!nextStatus) {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const db = admin();
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('id')
    .eq('id', body.connectionId)
    .eq('account_id', body.accountId)
    .eq('provider', 'whatsapp_web')
    .maybeSingle();
  if (configError || !config) {
    return NextResponse.json(
      { error: 'QR WhatsApp configuration not found.' },
      { status: 404 }
    );
  }

  const { data: message, error: messageError } = await db
    .from('messages')
    .select(
      'id, status, conversation_id, conversation:conversations!inner(account_id, whatsapp_config_id)'
    )
    .eq('message_id', body.messageId)
    .eq('conversation.account_id', body.accountId)
    .eq('conversation.whatsapp_config_id', config.id)
    .limit(1)
    .maybeSingle();

  if (messageError) {
    console.error('[whatsapp-web/status] lookup failed:', messageError);
    return NextResponse.json(
      { error: 'Status lookup failed.' },
      { status: 500 }
    );
  }
  if (!message) {
    // The ACK may beat the API request that persists the sent message.
    // The local bridge treats 404 as retryable for a few seconds.
    return NextResponse.json(
      { error: 'Message has not been persisted yet.' },
      { status: 404 }
    );
  }

  const currentStatus = message.status as MessageStatus;
  if (!canAdvanceMessageStatus(currentStatus, nextStatus)) {
    return NextResponse.json({ updated: false, status: currentStatus });
  }

  const { error: updateError } = await db
    .from('messages')
    .update({ status: nextStatus })
    .eq('id', message.id)
    .eq('status', currentStatus);
  if (updateError) {
    console.error('[whatsapp-web/status] update failed:', updateError);
    return NextResponse.json(
      { error: 'Status update failed.' },
      { status: 500 }
    );
  }

  await dispatchWebhookEvent(db, body.accountId, 'message.status_updated', {
    whatsapp_message_id: body.messageId,
    conversation_id: message.conversation_id,
    status: nextStatus,
  });

  return NextResponse.json({ updated: true, status: nextStatus });
}
