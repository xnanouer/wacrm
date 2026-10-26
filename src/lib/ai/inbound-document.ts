import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { matchesDeclaredFileType } from '@/lib/storage/file-signatures';
import { prepareOutboundMediaUrl } from '@/lib/storage/private-media-server';
import { aiRequestTimeoutMs } from './defaults';
import {
  normalizeDocumentFullName,
  parseLeadProfileJson,
} from './lead-profile';
import { providerHttpError, toNetworkError } from './providers/shared';
import type { AiConfig, LeadProfilePatch } from './types';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SUPPORTED_MEDIA = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

type SupportedMedia = (typeof SUPPORTED_MEDIA)[number];

interface ResponsesPayload {
  id?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

export interface LeadDocumentAnalysis {
  patch: LeadProfilePatch;
  providerRequestId: string | null;
}

function normalizeMime(value: string | null): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function detectLeadDocumentMime(
  bytes: Uint8Array,
  declaredMime: string | null
): SupportedMedia | null {
  const declared = normalizeMime(declaredMime);
  const candidates = [
    declared,
    ...SUPPORTED_MEDIA.filter((mime) => mime !== declared),
  ];
  return (
    candidates.find(
      (mime): mime is SupportedMedia =>
        (SUPPORTED_MEDIA as readonly string[]).includes(mime) &&
        matchesDeclaredFileType(bytes, mime)
    ) ?? null
  );
}

function extensionForMime(mime: SupportedMedia): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
  }
}

function responseText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && item.text)
    .map((item) => item.text)
    .join('\n');
}

/**
 * Read an inbound identity document without making it part of the customer's
 * visible conversation. Only a valid Chilean RUT is accepted. A legal name is
 * saved only when the same document also contains that valid RUT.
 */
export async function analyzeInboundLeadDocument(args: {
  db: SupabaseClient;
  accountId: string;
  config: AiConfig;
  mediaUrl: string;
}): Promise<LeadDocumentAnalysis> {
  if (args.config.provider !== 'openai') {
    return { patch: {}, providerRequestId: null };
  }

  const authorizedUrl = await prepareOutboundMediaUrl(
    args.db,
    args.accountId,
    args.mediaUrl,
    120
  );
  let mediaResponse: Response;
  try {
    mediaResponse = await fetch(authorizedUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw toNetworkError(error);
  }
  if (!mediaResponse.ok) {
    throw new Error(
      `Inbound document download failed (${mediaResponse.status}).`
    );
  }
  const declaredLength = Number(mediaResponse.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES) {
    throw new Error('Inbound document exceeds the analysis size limit.');
  }
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_DOCUMENT_BYTES) {
    throw new Error(
      'Inbound document is empty or exceeds the analysis size limit.'
    );
  }
  const mime = detectLeadDocumentMime(
    bytes,
    mediaResponse.headers.get('content-type')
  );
  if (!mime) {
    return { patch: {}, providerRequestId: null };
  }

  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  const mediaPart = mime.startsWith('image/')
    ? { type: 'input_image', image_url: dataUrl, detail: 'high' }
    : {
        type: 'input_file',
        filename: `documento.${extensionForMime(mime)}`,
        file_data: dataUrl,
        detail: 'high',
      };
  const prompt = [
    'Analiza este documento de identidad o antecedente enviado por un cliente de un CRM chileno.',
    'Extrae exclusivamente el nombre legal completo de la persona titular y su RUT chileno si ambos son legibles y pertenecen a la misma persona.',
    'No uses nombres de empresas, instituciones, ejecutivos, firmas, marcas de agua, nombres de archivo ni texto de ejemplo.',
    'No adivines letras o dígitos. Si hay varias personas, no se puede asociar el nombre al RUT, o el dato no es legible, usa null.',
    'Devuelve solo JSON válido con esta forma: {"full_name":string|null,"rut":string|null}.',
  ].join('\n');

  let providerResponse: Response;
  try {
    providerResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: args.config.model,
        store: false,
        max_output_tokens: 300,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: prompt }, mediaPart],
          },
        ],
      }),
      signal: AbortSignal.timeout(aiRequestTimeoutMs()),
    });
  } catch (error) {
    throw toNetworkError(error);
  }
  if (!providerResponse.ok) {
    throw await providerHttpError('OpenAI', providerResponse);
  }

  const payload = (await providerResponse.json()) as ResponsesPayload;
  const parsed = parseLeadProfileJson(responseText(payload));
  const rut = parsed.rut;
  const fullName = normalizeDocumentFullName(parsed.full_name);
  const patch: LeadProfilePatch = {};
  if (rut) patch.rut = rut;
  if (rut && fullName) patch.full_name = fullName;

  return {
    patch,
    providerRequestId: typeof payload.id === 'string' ? payload.id : null,
  };
}
