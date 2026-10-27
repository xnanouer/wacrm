import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildCatalogContext,
  findCatalogCandidates,
  hasCatalogCardsInConversation,
  isCatalogMediaRequest,
  isCatalogSelection,
} from './catalog';
import { buildSystemPrompt } from './defaults';
import { generateLeadProfilePatch, generateReply } from './generate';
import { retrieveKnowledge } from './knowledge';
import {
  buildLeadProfileExtractionPrompt,
  buildLeadQualificationContext,
  loadConversationLeadProfile,
  shouldExtractLeadProfile,
} from './lead-profile';
import { latestUserMessage } from './query';
import type { AiConfig, ChatMessage, LeadProfilePatch } from './types';

const TONE_LABELS: Record<string, string> = {
  professional: 'profesional, claro y cordial',
  friendly: 'cercano, amable y natural',
  direct: 'directo, breve y preciso',
  formal: 'formal y respetuoso',
  commercial: 'comercial, útil y orientado a ayudar sin presionar',
  technical: 'técnico, exacto y fácil de entender',
};

const OBJECTIVE_LABELS: Record<string, string> = {
  answer_faqs: 'responder preguntas frecuentes con información autorizada',
  capture_customer_data: 'recopilar progresivamente datos relevantes',
  qualify_leads: 'entender y calificar progresivamente la necesidad del lead',
  create_opportunities: 'detectar una posible oportunidad comercial',
  get_visit: 'ayudar a preparar una futura visita sin crear citas',
  handoff: 'identificar cuándo debe continuar un ejecutivo humano',
  catalog_support: 'apoyar consultas usando únicamente el catálogo autorizado',
  follow_up: 'ayudar al ejecutivo a preparar seguimientos',
};

function lines(title: string, values: string[]): string | null {
  return values.length ? `${title}: ${values.join('; ')}` : null;
}

export function buildStructuredAgentContext(
  config: AiConfig,
  accountName: string | null
): string {
  const tone =
    config.tone === 'custom'
      ? config.customTone
      : TONE_LABELS[config.tone] || TONE_LABELS.professional;
  const objective =
    config.primaryObjective === 'custom'
      ? config.customObjective
      : OBJECTIVE_LABELS[config.primaryObjective] ||
        OBJECTIVE_LABELS.answer_faqs;

  return [
    `Empresa: ${accountName || 'empresa configurada en Nexora'}.`,
    `Identidad: ${config.agentName}, ${config.agentTitle}. Idioma preferido: ${config.language}.`,
    `Tono: ${tone}.`,
    `Objetivo principal: ${objective}.`,
    config.introductionEnabled && config.introductionText
      ? `Presentación autorizada (úsala solo cuando corresponda, no en cada mensaje): ${config.introductionText}`
      : null,
    config.businessDescription
      ? `Descripción del negocio: ${config.businessDescription}`
      : null,
    config.businessIndustry ? `Rubro: ${config.businessIndustry}` : null,
    lines('Direcciones autorizadas', config.businessAddresses),
    lines('Teléfonos autorizados', config.businessPhones),
    lines('Correos autorizados', config.businessEmails),
    lines('Zonas de atención', config.businessServiceAreas),
    lines('Medios de atención', config.businessChannels),
    config.generalPolicies
      ? `Políticas autorizadas: ${config.generalPolicies}`
      : null,
    config.generalRequirements
      ? `Requisitos generales: ${config.generalRequirements}`
      : null,
    config.authorizedCommercialInfo
      ? `Información comercial autorizada: ${config.authorizedCommercialInfo}`
      : null,
    config.leadFields.length
      ? `Datos deseados para calificar el lead: ${config.leadFields.join(
          ', '
        )}. Solicítalos progresivamente; nunca todos en un solo mensaje. No modifiques el contacto.`
      : null,
    config.escalationRules.length
      ? `Recomienda derivación humana cuando ocurra: ${config.escalationRules.join(
          '; '
        )}. Respeta siempre al ejecutivo asignado.`
      : null,
    config.additionalInstructions
      ? `Instrucciones adicionales de la empresa: ${config.additionalInstructions}`
      : null,
    config.catalogAiEnabled
      ? 'Comportamiento de asesor comercial: identifica progresivamente el modelo o tipo de vehículo, el presupuesto o precio máximo y el pie disponible. Cuando el cliente solicite el catálogo o describa un vehículo concreto, consulta exclusivamente el catálogo autorizado de esta empresa, compara esos requisitos con las unidades encontradas y presenta opciones reales. Filtra por el pie solamente cuando la unidad tenga un pie mínimo confirmado; si ese dato no existe, no afirmes que el pie alcanza y explica que el financiamiento queda sujeto a evaluación. Si la necesidad todavía es general, formula una sola pregunta útil para conocer modelo o tipo, presupuesto o pie; no interrogues ni repitas preguntas ya respondidas.'
      : null,
    config.catalogAiAutoSend
      ? 'Reglas obligatorias de Nexora: no inventes información, precios, disponibilidad, descuentos ni aprobaciones; no cambies datos, asignaciones, permisos o configuraciones; no ejecutes acciones en la base de datos; solo puedes ofrecer las unidades aprobadas que Nexora incluya en el contexto del catálogo.'
      : 'Reglas obligatorias de Nexora: no inventes información, precios, disponibilidad, descuentos ni aprobaciones; no cambies datos, asignaciones, permisos o configuraciones; no ejecutes acciones en la base de datos; no envíes productos automáticamente; una sugerencia siempre debe ser revisada y enviada por una persona.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface AgentReplyResult {
  text: string;
  handoff: boolean;
  replyMode: 'text' | 'audio';
  tone: string;
  informationUsed: string[];
  catalogMatches: Array<{ id: string; label: string }>;
  warnings: string[];
  leadProfilePatch: LeadProfilePatch;
}

export async function generateAgentReply(args: {
  db: SupabaseClient;
  accountId: string;
  config: AiConfig;
  messages: ChatMessage[];
  mode: 'draft' | 'auto_reply';
  conversationId?: string;
  contactId?: string;
  simulateCatalogDelivery?: boolean;
}): Promise<AgentReplyResult> {
  const {
    db,
    accountId,
    config,
    messages,
    mode,
    conversationId,
    contactId,
    simulateCatalogDelivery = false,
  } = args;
  if (!config.permissions.generate_suggestions) {
    throw new Error('AI_SUGGESTIONS_DISABLED');
  }

  const customerMessage = latestUserMessage(messages);
  const [{ data: account }, knowledge, leadProfile] = await Promise.all([
    db.from('accounts').select('name').eq('id', accountId).maybeSingle(),
    retrieveKnowledge(db, accountId, config, customerMessage),
    config.permissions.classify_leads &&
    config.leadFields.length > 0 &&
    conversationId &&
    contactId
      ? loadConversationLeadProfile({
          db,
          accountId,
          conversationId,
          contactId,
        })
      : Promise.resolve(null),
  ]);
  const mayUseCatalog =
    config.catalogAiEnabled &&
    config.permissions.query_catalog &&
    config.permissions.suggest_catalog_items;
  const catalogWasAlreadyShown = hasCatalogCardsInConversation(
    messages.slice(0, -1)
  );
  const catalogRankingContext = [
    customerMessage,
    leadProfile?.vehicle_interest
      ? `modelo ${leadProfile.vehicle_interest}`
      : null,
    leadProfile?.vehicle_price
      ? `presupuesto ${leadProfile.vehicle_price}`
      : null,
    leadProfile?.down_payment ? `pie ${leadProfile.down_payment}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const catalog = mayUseCatalog
    ? await findCatalogCandidates(
        db,
        accountId,
        customerMessage,
        config.catalogAiMaxItems,
        {
          allowSelection: catalogWasAlreadyShown,
          previousMessages: messages,
          rankingContext: catalogRankingContext,
        }
      )
    : { requested: false, candidates: [] };
  const automaticCatalogCardsWillFollow =
    mode === 'auto_reply' &&
    config.catalogAiAutoSend &&
    (config.catalogDeliveryMode === 'photos_immediately' ||
      ((isCatalogMediaRequest(customerMessage) ||
        isCatalogSelection(customerMessage)) &&
        catalog.candidates.length === 1));
  const catalogCardsWillFollow =
    (simulateCatalogDelivery || automaticCatalogCardsWillFollow) &&
    catalog.candidates.length > 0;

  const systemPrompt = buildSystemPrompt({
    userPrompt: config.systemPrompt,
    structuredContext: [
      buildStructuredAgentContext(
        config,
        typeof account?.name === 'string' ? account.name : null
      ),
      leadProfile
        ? buildLeadQualificationContext(leadProfile, config.leadFields)
        : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    mode,
    knowledge,
    catalogContext: catalog.requested
      ? buildCatalogContext(catalog.candidates)
      : null,
    catalogCardsWillFollow,
    allowAudioDecision:
      mode === 'auto_reply' &&
      config.audioEnabled &&
      config.permissions.generate_audio,
  });
  const generated = await generateReply({ config, systemPrompt, messages });
  let leadProfilePatch = generated.leadProfilePatch;

  if (
    leadProfile &&
    Object.keys(leadProfilePatch).length === 0 &&
    shouldExtractLeadProfile(messages)
  ) {
    try {
      leadProfilePatch = await generateLeadProfilePatch({
        config,
        systemPrompt: buildLeadProfileExtractionPrompt(
          leadProfile,
          config.leadFields
        ),
        messages,
      });
    } catch (error) {
      // A failed extraction must never suppress the valid customer reply.
      console.error('[ai] lead profile extraction failed:', error);
    }
  }

  const informationUsed = ['configuración del agente', 'conversación reciente'];
  if (knowledge.length) informationUsed.push('conocimiento y FAQs activas');
  if (catalog.candidates.length) {
    informationUsed.push('catálogo aprobado de esta empresa');
  }

  return {
    ...generated,
    leadProfilePatch,
    tone:
      config.tone === 'custom'
        ? config.customTone || 'personalizado'
        : TONE_LABELS[config.tone] || TONE_LABELS.professional,
    informationUsed,
    catalogMatches: catalog.candidates.map((candidate) => ({
      id: candidate.id,
      label: `${candidate.make} ${candidate.model} ${candidate.year}`.trim(),
    })),
    warnings: catalog.requested
      ? catalogCardsWillFollow
        ? [
            'Nexora enviará automáticamente las fichas aprobadas después de esta respuesta.',
          ]
        : [
            'Los vehículos encontrados son sugerencias. Un ejecutivo debe seleccionar y enviar la ficha.',
          ]
      : [],
  };
}
