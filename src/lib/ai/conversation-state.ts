import type { Conversation } from '@/types';

export interface ConversationAiIndicator {
  label: string;
  detail: string;
  tone: 'purple' | 'amber' | 'emerald' | 'slate' | 'red';
  active: boolean;
}

export function getConversationAiIndicator(
  conversation: Pick<
    Conversation,
    'ai_state' | 'ai_pause_reason' | 'assigned_agent_id'
  >
): ConversationAiIndicator | null {
  if (
    conversation.ai_pause_reason === 'insufficient_points' ||
    conversation.ai_pause_reason === 'coverage_points_limit'
  ) {
    return {
      label: 'Sin puntos IA',
      detail: 'La conversación quedó disponible para el equipo.',
      tone: 'red',
      active: false,
    };
  }

  switch (conversation.ai_state) {
    case 'ai_after_hours':
      return {
        label: 'Cubierto por IA',
        detail: 'El ejecutivo asignado está fuera de horario o no disponible.',
        tone: 'purple',
        active: true,
      };
    case 'ai_active':
      return {
        label: 'Atendido por IA',
        detail: 'El chat fue delegado temporalmente al Agente IA.',
        tone: 'purple',
        active: true,
      };
    case 'waiting_for_human':
      return {
        label: 'Esperando humano',
        detail: 'La IA se detuvo y solicitó apoyo del equipo.',
        tone: 'amber',
        active: false,
      };
    case 'ai_paused':
      return {
        label: 'IA pausada',
        detail: 'La IA no responderá nuevos mensajes en este chat.',
        tone: 'slate',
        active: false,
      };
    case 'human_active':
      return {
        label: 'Tomado por humano',
        detail: 'El ejecutivo retomó la conversación y la IA está pausada.',
        tone: 'emerald',
        active: false,
      };
    default:
      return null;
  }
}
