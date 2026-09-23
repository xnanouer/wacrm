import { NextResponse } from 'next/server';

import {
  AI_PROVIDER_DEFAULT_MODEL,
  DEFAULT_AUDIO_MODELS,
} from '@/lib/ai/defaults';
import {
  AI_CONFIG_RUNTIME_DEFAULTS,
  AiError,
  type AiProvider,
} from '@/lib/ai/types';
import { validateAiCredentials } from '@/lib/ai/validate';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';

function safeSettings(row: Record<string, unknown> | null) {
  return {
    provider: row?.text_provider === 'anthropic' ? 'anthropic' : 'openai',
    model:
      typeof row?.text_model === 'string' && row.text_model
        ? row.text_model
        : AI_PROVIDER_DEFAULT_MODEL.openai,
    hasKey: Boolean(row?.encrypted_api_key),
    keyLastFour:
      typeof row?.api_key_last_four === 'string' ? row.api_key_last_four : null,
    globalEnabled: row?.global_enabled === true,
    audioEnabled: row?.audio_enabled === true,
    transcriptionModel:
      typeof row?.transcription_model === 'string' &&
      row.transcription_model.trim()
        ? row.transcription_model
        : DEFAULT_AUDIO_MODELS.transcription,
    speechModel:
      typeof row?.speech_model === 'string' && row.speech_model.trim()
        ? row.speech_model
        : DEFAULT_AUDIO_MODELS.speech,
    speechVoice:
      typeof row?.speech_voice === 'string' && row.speech_voice.trim()
        ? row.speech_voice
        : DEFAULT_AUDIO_MODELS.voice,
  };
}

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    const admin = supabaseAdmin();
    const [settingsResult, costsResult] = await Promise.all([
      admin
        .from('platform_ai_settings')
        .select(
          'text_provider, text_model, encrypted_api_key, api_key_last_four, global_enabled, audio_enabled, transcription_model, speech_model, speech_voice'
        )
        .eq('id', 1)
        .maybeSingle(),
      admin
        .from('ai_point_action_costs')
        .select(
          'action_key, customer_label, category, billing_unit, points_per_unit, max_duration_seconds, enabled'
        )
        .order('sort_order'),
    ]);
    if (settingsResult.error || costsResult.error) {
      throw settingsResult.error ?? costsResult.error;
    }

    return NextResponse.json({
      settings: safeSettings(
        settingsResult.data as Record<string, unknown> | null
      ),
      costs: costsResult.data ?? [],
    });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `platform-ai:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Solicitud inválida.' },
        { status: 400 }
      );
    }

    const provider = body.provider as AiProvider;
    if (provider !== 'openai' && provider !== 'anthropic') {
      return NextResponse.json(
        { error: 'Proveedor inválido.' },
        { status: 400 }
      );
    }
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (!model || model.length > 120) {
      return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
    }
    const rawKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    if (rawKey.length > 1000) {
      return NextResponse.json({ error: 'API key inválida.' }, { status: 400 });
    }
    const globalEnabled = body.global_enabled === true;
    const audioEnabled = body.audio_enabled === true;
    const transcriptionModel =
      typeof body.transcription_model === 'string'
        ? body.transcription_model.trim()
        : DEFAULT_AUDIO_MODELS.transcription;
    const speechModel =
      typeof body.speech_model === 'string'
        ? body.speech_model.trim()
        : DEFAULT_AUDIO_MODELS.speech;
    const speechVoice =
      typeof body.speech_voice === 'string'
        ? body.speech_voice.trim()
        : DEFAULT_AUDIO_MODELS.voice;
    if (
      [transcriptionModel, speechModel, speechVoice].some(
        (value) => !value || value.length > 120
      )
    ) {
      return NextResponse.json(
        { error: 'La configuración de audio no es válida.' },
        { status: 400 }
      );
    }
    if (audioEnabled && (!globalEnabled || provider !== 'openai')) {
      return NextResponse.json(
        {
          error: 'El audio requiere que la IA global esté activa con OpenAI.',
        },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: existing, error: existingError } = await admin
      .from('platform_ai_settings')
      .select(
        'text_provider, text_model, encrypted_api_key, api_key_last_four, global_enabled, audio_enabled, transcription_model, speech_model, speech_voice'
      )
      .eq('id', 1)
      .maybeSingle();
    if (existingError) throw existingError;

    let plainKey = rawKey;
    if (!plainKey && existing?.encrypted_api_key) {
      try {
        plainKey = decrypt(existing.encrypted_api_key);
      } catch {
        return NextResponse.json(
          {
            error:
              'La clave guardada no se pudo descifrar. Ingresa una clave nueva.',
          },
          { status: 400 }
        );
      }
    }
    if (!plainKey) {
      return NextResponse.json(
        { error: 'Ingresa una API key antes de guardar.' },
        { status: 400 }
      );
    }

    const credentialsChanged =
      rawKey.length > 0 ||
      provider !== existing?.text_provider ||
      model !== existing?.text_model;
    if (credentialsChanged) {
      try {
        await validateAiCredentials({
          ...AI_CONFIG_RUNTIME_DEFAULTS,
          id: 'platform-validation',
          provider,
          model,
          apiKey: plainKey,
          systemPrompt: null,
          isActive: true,
          autoReplyEnabled: false,
          autoReplyMaxPerConversation: 1,
          catalogAiEnabled: false,
          catalogAiAutoSend: false,
          catalogAiMaxItems: 3,
          responseMode: 'text',
          embeddingsApiKey: null,
        });
      } catch (error) {
        if (error instanceof AiError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    const next = {
      text_provider: provider,
      text_model: model,
      global_enabled: globalEnabled,
      transcription_model: transcriptionModel,
      speech_model: speechModel,
      speech_voice: speechVoice,
      audio_enabled: audioEnabled,
      updated_by_user_id: actor.userId,
      ...(rawKey
        ? {
            encrypted_api_key: encrypt(rawKey),
            api_key_last_four: rawKey.slice(-4),
          }
        : {}),
    };
    const { error: updateError } = await admin
      .from('platform_ai_settings')
      .update(next)
      .eq('id', 1);
    if (updateError) throw updateError;

    const previousSafe = safeSettings(
      existing as Record<string, unknown> | null
    );
    const nextSafe = {
      provider,
      model,
      hasKey: true,
      keyLastFour: rawKey
        ? rawKey.slice(-4)
        : (existing?.api_key_last_four ?? null),
      globalEnabled,
      audioEnabled,
      transcriptionModel,
      speechModel,
      speechVoice,
    };
    const { error: auditError } = await admin
      .from('platform_audit_logs')
      .insert({
        actor_user_id: actor.userId,
        account_id: null,
        action: 'platform.ai_configuration_updated',
        previous_data: previousSafe,
        next_data: nextSafe,
        reason: globalEnabled
          ? 'IA global configurada por el propietario'
          : 'IA global pausada por el propietario',
      });
    if (auditError) {
      console.error('[platform/ai] audit insert failed:', auditError);
    }

    return NextResponse.json({ success: true, settings: nextSafe });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
