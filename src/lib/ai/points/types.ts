export const AI_POINT_ACTIONS = [
  'automatic_text_reply',
  'follow_up_reply',
  'suggested_reply',
  'conversation_summary',
  'lead_analysis',
  'agent_coaching_analysis',
  'audio_transcription',
  'audio_generation',
] as const;

export type AiPointAction = (typeof AI_POINT_ACTIONS)[number];

export interface AiPointReservation {
  operationId: string;
  points: number;
}

export interface AiPointUsageItem {
  id: string;
  actionKey: AiPointAction;
  label: string;
  category: 'text' | 'analysis' | 'audio';
  status: 'completed' | 'released';
  points: number;
  durationMs: number | null;
  createdAt: string;
}

export interface AiPointDistributionItem {
  actionKey: AiPointAction;
  label: string;
  category: 'text' | 'analysis' | 'audio';
  points: number;
}

export interface AiUsageSummary {
  platformEnabled: boolean;
  globalEnabled: boolean;
  audioEnabled: boolean;
  disabledReason: string | null;
  planCode: string;
  monthlyPointsOverride: number | null;
  monthlyIncluded: number;
  monthlyUsed: number;
  monthlyReserved: number;
  monthlyAvailable: number;
  additionalAvailable: number;
  totalAvailable: number;
  usagePercentage: number;
  cycleStartedAt: string;
  cycleEndsAt: string;
  distribution: AiPointDistributionItem[];
  history: AiPointUsageItem[];
}
