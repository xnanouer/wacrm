import crypto from 'crypto';
import { after, NextResponse } from 'next/server';

import { getMetaWebhookVerifyToken } from '@/lib/meta/config';
import { processMetaWebhook } from '@/lib/meta/inbound';
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature';

export const maxDuration = 60;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get('hub.mode');
  const challenge = params.get('hub.challenge');
  const presented = params.get('hub.verify_token');
  let expected: string;
  try {
    expected = getMetaWebhookVerifyToken();
  } catch (error) {
    console.error('[meta webhook] verify token missing:', error);
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 }
    );
  }
  if (
    mode !== 'subscribe' ||
    !challenge ||
    !presented ||
    !safeEqual(presented, expected)
  ) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  after(() => processMetaWebhook(payload));
  return NextResponse.json({ received: true });
}
