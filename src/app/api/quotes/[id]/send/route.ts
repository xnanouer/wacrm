import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { formatClp } from '@/lib/quotes/calculations';
import { loadQuotation } from '@/lib/quotes/server';
import type { QuotationAttachmentFormat } from '@/lib/quotes/types';
import { renderQuotationMessage } from '@/lib/quotes/validation';
import { isUuid } from '@/lib/validation/uuid';
import {
  SendMessageError,
  sendMessageToConversation,
} from '@/lib/whatsapp/send-message';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

interface SendBody {
  format?: unknown;
  idempotencyKey?: unknown;
  messageText?: unknown;
  recipientContactId?: unknown;
}

function safeFilename(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'cotizacion'
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Cotización inválida.' },
        { status: 400 }
      );
    }
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `quotation-send:${ctx.userId}`,
      RATE_LIMITS.send
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as SendBody | null;
    const idempotencyKey =
      typeof body?.idempotencyKey === 'string'
        ? body.idempotencyKey.trim()
        : '';
    const format =
      body?.format === 'png' || body?.format === 'both'
        ? (body.format as QuotationAttachmentFormat)
        : 'pdf';
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
      return NextResponse.json(
        { error: 'La clave de seguridad del envío no es válida.' },
        { status: 400 }
      );
    }

    const detail = await loadQuotation(ctx, id);
    const { quotation } = detail;
    const recipientContactId =
      typeof body?.recipientContactId === 'string'
        ? body.recipientContactId.trim()
        : '';
    if (recipientContactId && !isUuid(recipientContactId)) {
      return NextResponse.json(
        { error: 'El contacto seleccionado no es válido.' },
        { status: 400 }
      );
    }

    let conversationId = quotation.conversationId;
    if (recipientContactId) {
      const { data: recipient, error: recipientError } = await ctx.supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('account_id', ctx.accountId)
        .eq('id', recipientContactId)
        .maybeSingle();
      if (recipientError) throw recipientError;
      if (!recipient?.phone) {
        return NextResponse.json(
          { error: 'El contacto no existe o no tiene un teléfono válido.' },
          { status: 404 }
        );
      }

      try {
        const resolved = await resolveConversationByPhone(
          ctx.supabase,
          ctx.accountId,
          recipient.phone,
          recipient.name
        );
        conversationId = resolved.conversationId;
        const { error: linkError } = await ctx.supabase
          .from('quotations')
          .update({
            contact_id: recipient.id,
            conversation_id: conversationId,
            updated_by_user_id: ctx.userId,
          })
          .eq('account_id', ctx.accountId)
          .eq('id', quotation.id);
        if (linkError) throw linkError;
      } catch (error) {
        if (error instanceof SendMessageError) {
          const message =
            error.code === 'whatsapp_not_configured'
              ? 'Conecta WhatsApp antes de enviar la cotización.'
              : error.code === 'bad_request'
                ? 'El teléfono del contacto no es válido. Corrígelo y vuelve a intentar.'
                : 'No fue posible abrir la conversación de WhatsApp del contacto.';
          return NextResponse.json(
            { error: message },
            { status: error.status }
          );
        }
        throw error;
      }
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Selecciona el contacto que recibirá la cotización.' },
        { status: 409 }
      );
    }
    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('id, channel')
      .eq('account_id', ctx.accountId)
      .eq('id', conversationId)
      .maybeSingle();
    if (!conversation || (conversation.channel ?? 'whatsapp') !== 'whatsapp') {
      return NextResponse.json(
        {
          error:
            'El envío de cotizaciones está habilitado para conversaciones de WhatsApp.',
        },
        { status: 409 }
      );
    }
    const version = detail.versions.find(
      (item) => item.generationStatus === 'ready'
    );
    if (!version) {
      return NextResponse.json(
        { error: 'Primero genera una versión PDF/PNG.' },
        { status: 409 }
      );
    }
    if (
      (format === 'pdf' && !version.pdfStoragePath) ||
      (format === 'png' && !version.pngStoragePath) ||
      (format === 'both' &&
        (!version.pdfStoragePath || !version.pngStoragePath))
    ) {
      return NextResponse.json(
        { error: 'La versión no contiene todos los archivos solicitados.' },
        { status: 409 }
      );
    }

    const { data: sendRow, error: sendInsertError } = await ctx.supabase
      .from('quotation_sends')
      .insert({
        account_id: ctx.accountId,
        quotation_id: id,
        quotation_version_id: version.id,
        conversation_id: conversationId,
        idempotency_key: idempotencyKey,
        attachment_format: format,
        status: 'pending',
        requested_by_user_id: ctx.userId,
      })
      .select('*')
      .single();
    if (sendInsertError) {
      if (sendInsertError.code === '23505') {
        const { data: existing } = await ctx.supabase
          .from('quotation_sends')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        return NextResponse.json({
          success: existing?.status === 'sent',
          idempotent: true,
          status: existing?.status ?? 'pending',
          sendId: existing?.id,
          error: existing?.error_message ?? undefined,
        });
      }
      throw sendInsertError;
    }
    const sendId = sendRow.id as string;
    await ctx.supabase
      .from('quotation_sends')
      .update({ status: 'sending', started_at: new Date().toISOString() })
      .eq('id', sendId);

    const snapshot = version.snapshot;
    const vehicle = [
      quotation.vehicleMake,
      quotation.vehicleModel,
      quotation.vehicleVersion,
    ]
      .filter(Boolean)
      .join(' ');
    const defaultMessage = renderQuotationMessage(
      snapshot.settings.messageTemplate,
      {
        cliente: quotation.clientName,
        numero: quotation.quoteNumber,
        vehiculo: vehicle,
        precio: formatClp(quotation.finalPrice),
        vigencia: quotation.validUntil,
        ejecutivo: quotation.executiveName,
      }
    ).text;
    const messageText =
      typeof body?.messageText === 'string' && body.messageText.trim()
        ? body.messageText.trim()
        : quotation.messageText.trim() || defaultMessage;

    const errors: Array<{ code: string; message: string }> = [];
    const sentMessages: string[] = [];
    const updateTrace = async (messageId: string, durableMediaUrl?: string) => {
      sentMessages.push(messageId);
      await ctx.supabase
        .from('messages')
        .update({
          quotation_id: quotation.id,
          quotation_version_id: version.id,
          ...(durableMediaUrl ? { media_url: durableMediaUrl } : {}),
        })
        .eq('id', messageId)
        .eq('conversation_id', conversationId);
    };
    const capture = (error: unknown) => {
      errors.push({
        code: error instanceof SendMessageError ? error.code : 'send_failed',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    };

    let textMessageId: string | null = null;
    let pdfMessageId: string | null = null;
    let pngMessageId: string | null = null;
    try {
      const result = await sendMessageToConversation(
        ctx.supabase,
        ctx.accountId,
        {
          conversationId,
          messageType: 'text',
          contentText: messageText,
          senderType: 'agent',
          pauseFlows: true,
        }
      );
      textMessageId = result.messageId;
      await updateTrace(result.messageId);
    } catch (error) {
      capture(error);
    }

    if (format === 'pdf' || format === 'both') {
      const { data: signed } = await ctx.supabase.storage
        .from('quotation-documents')
        .createSignedUrl(version.pdfStoragePath!, 900);
      if (!signed?.signedUrl) {
        errors.push({
          code: 'pdf_url_failed',
          message: 'No se pudo firmar el PDF.',
        });
      } else {
        try {
          const result = await sendMessageToConversation(
            ctx.supabase,
            ctx.accountId,
            {
              conversationId,
              messageType: 'document',
              mediaUrl: signed.signedUrl,
              filename: `${safeFilename(quotation.quoteNumber)}.pdf`,
              contentText: `Cotización ${quotation.quoteNumber}`,
              senderType: 'agent',
              pauseFlows: true,
            }
          );
          pdfMessageId = result.messageId;
          await updateTrace(
            result.messageId,
            `/api/quotes/${quotation.id}/artifact?format=pdf&version=${version.versionNumber}`
          );
        } catch (error) {
          capture(error);
        }
      }
    }

    if (format === 'png' || format === 'both') {
      const { data: signed } = await ctx.supabase.storage
        .from('quotation-documents')
        .createSignedUrl(version.pngStoragePath!, 900);
      if (!signed?.signedUrl) {
        errors.push({
          code: 'png_url_failed',
          message: 'No se pudo firmar la imagen.',
        });
      } else {
        try {
          const result = await sendMessageToConversation(
            ctx.supabase,
            ctx.accountId,
            {
              conversationId,
              messageType: 'image',
              mediaUrl: signed.signedUrl,
              contentText: `Cotización ${quotation.quoteNumber}`,
              senderType: 'agent',
              pauseFlows: true,
            }
          );
          pngMessageId = result.messageId;
          await updateTrace(
            result.messageId,
            `/api/quotes/${quotation.id}/artifact?format=png&version=${version.versionNumber}`
          );
        } catch (error) {
          capture(error);
        }
      }
    }

    const expectedCount = 1 + (format === 'both' ? 2 : 1);
    const status =
      sentMessages.length === expectedCount
        ? 'sent'
        : sentMessages.length > 0
          ? 'partial'
          : 'failed';
    const firstError = errors[0];
    await ctx.supabase
      .from('quotation_sends')
      .update({
        status,
        text_message_id: textMessageId,
        pdf_message_id: pdfMessageId,
        png_message_id: pngMessageId,
        error_code: firstError?.code ?? null,
        error_message: errors.map((item) => item.message).join(' | ') || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', sendId);

    if (sentMessages.length > 0) {
      await ctx.supabase
        .from('quotations')
        .update({
          last_sent_at: new Date().toISOString(),
          updated_by_user_id: ctx.userId,
        })
        .eq('id', quotation.id);
      if (
        ['generated', 'negotiating', 'financing_pending'].includes(
          quotation.status
        )
      ) {
        await ctx.supabase.rpc('set_quotation_status', {
          p_quotation_id: quotation.id,
          p_status: 'sent',
        });
      }
      await ctx.supabase.from('quotation_events').insert({
        account_id: ctx.accountId,
        quotation_id: quotation.id,
        event_type: quotation.lastSentAt ? 'resent' : 'sent',
        actor_user_id: ctx.userId,
        metadata: {
          send_id: sendId,
          version: version.versionNumber,
          format,
          status,
          message_ids: sentMessages,
        },
      });
    }

    return NextResponse.json(
      {
        success: status === 'sent',
        status,
        sendId,
        errors,
      },
      { status: status === 'failed' ? 502 : 200 }
    );
  } catch (error) {
    console.error('[quotes] send failed:', error);
    return toErrorResponse(error);
  }
}
