import { getWhatsAppBridgeSecret } from '@/lib/whatsapp/bridge-auth';

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:3001';

export type WhatsAppWebStatus =
  | 'idle'
  | 'starting'
  | 'qr_ready'
  | 'authenticated'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface WhatsAppWebSessionStatus {
  status: WhatsAppWebStatus;
  qrDataUrl: string | null;
  phone: string | null;
  displayName: string | null;
  lastError: string | null;
  updatedAt: string;
}

function serviceUrl(): string {
  return (process.env.WHATSAPP_WEB_SERVICE_URL || DEFAULT_SERVICE_URL).replace(
    /\/$/,
    ''
  );
}

export async function callWhatsAppWebService<T>(
  accountId: string,
  connectionId: string,
  path = '',
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${serviceUrl()}/sessions/${encodeURIComponent(accountId)}/${encodeURIComponent(connectionId)}${path}`,
    {
      ...init,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        'x-nexora-bridge-secret': getWhatsAppBridgeSecret(),
        ...(init.headers || {}),
      },
    }
  );

  const data = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(
      data?.error || `WhatsApp Web service returned ${response.status}.`
    );
  }
  return data as T;
}

export function isWhatsAppWebServiceOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|service.*offline/i.test(message);
}

export async function sendWhatsAppWebMessage(args: {
  accountId: string;
  connectionId: string;
  to: string;
  messageType: string;
  text?: string | null;
  mediaUrl?: string | null;
  filename?: string | null;
  quotedMessageId?: string;
  participantJid?: string | null;
}): Promise<{ messageId: string; ack: number | null }> {
  return callWhatsAppWebService<{ messageId: string; ack: number | null }>(
    args.accountId,
    args.connectionId,
    '/send',
    {
      method: 'POST',
      body: JSON.stringify({
        to: args.to,
        messageType: args.messageType,
        text: args.text || '',
        mediaUrl: args.mediaUrl || null,
        filename: args.filename || null,
        caption: args.messageType === 'audio' ? null : args.text || null,
        quotedMessageId: args.quotedMessageId || null,
        participantJid: args.participantJid || null,
      }),
    }
  );
}

export async function resolveWhatsAppWebIdentity(args: {
  accountId: string;
  connectionId: string;
  phone?: string | null;
  participantJid?: string | null;
}): Promise<{ phone: string; participantJid: string }> {
  return callWhatsAppWebService<{
    phone: string;
    participantJid: string;
  }>(args.accountId, args.connectionId, '/resolve', {
    method: 'POST',
    body: JSON.stringify({
      phone: args.phone || null,
      participantJid: args.participantJid || null,
    }),
  });
}
