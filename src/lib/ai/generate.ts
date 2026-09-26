import {
  AiError,
  type AiConfig,
  type ChatMessage,
  type GenerateResult,
  type LeadProfilePatch,
} from './types';
import {
  AUDIO_REPLY_SENTINEL,
  HANDOFF_SENTINEL,
  aiRequestTimeoutMs,
} from './defaults';
import { generateOpenAi } from './providers/openai';
import { generateAnthropic } from './providers/anthropic';
import {
  extractLeadProfilePatch,
  parseLeadProfileJson,
  stripLeadProfileBlock,
} from './lead-profile';

export interface GenerateArgs {
  config: AiConfig;
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string;
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[];
}

async function generateRaw(args: GenerateArgs): Promise<string> {
  const { config, systemPrompt, messages } = args;
  const timeoutMs = aiRequestTimeoutMs();
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
  };

  switch (config.provider) {
    case 'openai':
      return generateOpenAi(providerArgs);
    case 'anthropic':
      return generateAnthropic(providerArgs);
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      });
  }
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(
  args: GenerateArgs
): Promise<GenerateResult> {
  return parseGeneration(await generateRaw(args));
}

/** A small second pass used only when the reply model omitted Nexora's
 * private lead-profile block. Keeping this separate from the customer reply
 * prevents a formatting miss from losing facts the customer already gave. */
export async function generateLeadProfilePatch(
  args: GenerateArgs
): Promise<LeadProfilePatch> {
  return parseLeadProfileJson(await generateRaw(args));
}

/**
 * Split the raw model output into `{ text, handoff }`. The sentinel can
 * appear alone or trailing a partial reply; either way we treat the
 * turn as a handoff and strip the marker from any remaining text.
 */
export function parseGeneration(raw: string): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL);
  const requestedAudio = raw.includes(AUDIO_REPLY_SENTINEL);
  const leadProfilePatch = extractLeadProfilePatch(raw);
  const text = stripLeadProfileBlock(raw)
    .split(HANDOFF_SENTINEL)
    .join('')
    .split(AUDIO_REPLY_SENTINEL)
    .join('')
    .trim();
  return {
    text,
    handoff,
    replyMode: !handoff && requestedAudio ? 'audio' : 'text',
    leadProfilePatch,
  };
}
