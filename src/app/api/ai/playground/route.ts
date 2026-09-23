import { NextResponse } from 'next/server';

import { loadAiConfig } from '@/lib/ai/config';
import { loadCatalogCandidatesByIds } from '@/lib/ai/catalog';
import { generateAgentReply } from '@/lib/ai/orchestrator';
import { AiError, type ChatMessage } from '@/lib/ai/types';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const MAX_TURNS = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function buildCatalogPreview(
  supabase: Awaited<ReturnType<typeof requireRole>>['supabase'],
  accountId: string,
  itemIds: string[]
) {
  const candidates = await loadCatalogCandidatesByIds(
    supabase,
    accountId,
    itemIds
  );

  return Promise.all(
    candidates.map(async (candidate) => {
      let imageUrl: string | null = null;
      if (candidate.primaryImagePath) {
        const { data } = await supabase.storage
          .from('catalog-media')
          .createSignedUrl(candidate.primaryImagePath, 3600);
        imageUrl = data?.signedUrl ?? null;
      }

      return {
        id: candidate.id,
        title: candidate.title,
        make: candidate.make,
        model: candidate.model,
        version: candidate.version,
        year: candidate.year,
        description: candidate.description,
        color: candidate.color,
        engine: candidate.engine,
        list_price: candidate.listPrice,
        offer_price: candidate.offerPrice,
        displayed_price: candidate.displayedPrice,
        minimum_down_payment: candidate.minimumDownPayment,
        financing_text: candidate.financingText,
        mileage: candidate.mileage,
        fuel: candidate.fuel,
        transmission: candidate.transmission,
        drivetrain: candidate.drivetrain,
        location: candidate.location,
        image_url: imageUrl,
      };
    })
  );
}

/**
 * Safe admin-only simulation. It uses the real provider and tenant-scoped
 * knowledge, but never sends messages, mutates CRM data or reserves points.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `ai-playground:${userId}`,
      RATE_LIMITS.aiDraft
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
    const requestId =
      typeof body?.request_id === 'string' ? body.request_id : '';
    if (!rawMessages || !UUID_PATTERN.test(requestId)) {
      return NextResponse.json(
        { error: 'messages y request_id son obligatorios.' },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = rawMessages
      .filter(
        (message: unknown): message is ChatMessage =>
          Boolean(message) &&
          typeof message === 'object' &&
          ((message as ChatMessage).role === 'user' ||
            (message as ChatMessage).role === 'assistant') &&
          typeof (message as ChatMessage).content === 'string' &&
          (message as ChatMessage).content.trim().length > 0
      )
      .slice(-MAX_TURNS);
    if (!messages.length) {
      return NextResponse.json(
        { error: 'Escribe un mensaje para probar el agente.' },
        { status: 400 }
      );
    }

    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch((error) => {
      console.error('[ai/playground] load config error:', error);
      throw new AiError('No se pudo cargar la configuración protegida.', {
        code: 'key_decrypt_failed',
        status: 400,
      });
    });
    if (!config) {
      return NextResponse.json(
        {
          error:
            'El agente todavía no está configurado o Nexora no ha habilitado la IA para esta empresa.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }
    if (!config.permissions.generate_suggestions) {
      return NextResponse.json(
        {
          error: 'Las sugerencias están desactivadas para este agente.',
          code: 'ai_suggestions_disabled',
        },
        { status: 403 }
      );
    }

    const result = await generateAgentReply({
      db: supabase,
      accountId,
      config,
      messages,
      mode: 'draft',
      simulateCatalogDelivery: true,
    });
    const catalogPreview = result.catalogMatches.length
      ? await buildCatalogPreview(
          supabase,
          accountId,
          result.catalogMatches.map((candidate) => candidate.id)
        )
      : [];
    const warnings = catalogPreview.length ? [] : result.warnings;

    return NextResponse.json({
      reply: result.text,
      handoff: result.handoff,
      mode: 'suggestion',
      tone: result.tone,
      information_used: result.informationUsed,
      actions_requested: [],
      points_estimated: 1,
      points_used: 0,
      warnings: [
        'Prueba segura: no envió mensajes ni modificó datos.',
        ...(catalogPreview.length
          ? [
              'Vista previa del catálogo: las fichas se muestran como en WhatsApp, pero no fueron enviadas a ningún cliente.',
            ]
          : []),
        ...warnings,
      ],
      handoff_reason: result.handoff
        ? 'La consulta requiere revisión o intervención humana.'
        : null,
      catalog_matches: result.catalogMatches,
      catalog_preview: catalogPreview,
    });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
