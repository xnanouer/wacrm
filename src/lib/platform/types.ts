export const PLATFORM_ROLES = [
  'platform_owner',
  'platform_admin',
  'platform_support',
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export interface PlatformAccountOverview {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  planCode: string;
  planName: string;
  subscriptionStatus:
    'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  users: number;
  contacts: number;
  conversations: number;
  whatsappStatus: string | null;
  whatsappProvider: string | null;
  socialChannels: number;
}

export interface SaasPlanSummary {
  code: string;
  name: string;
  monthlyPrice: number | null;
  currency: string;
  maxUsers: number | null;
  maxChannels: number | null;
  aiMonthlyPoints: number;
}

export interface PlatformMemberSummary {
  userId: string;
  name: string | null;
  email: string;
  accountRole: string;
  createdAt: string;
}

export interface PlatformDepartmentSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PlatformChannelSummary {
  id: string;
  channel: string;
  displayName: string;
  status: string;
  connectedAt: string | null;
}

export interface PlatformAuditSummary {
  id: string;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface PlatformCatalogCapacity {
  baseLimit: number;
  extraBlocks: number;
  blockSize: number;
  extraUnits: number;
  totalLimit: number;
  usedUnits: number;
  remainingUnits: number;
}

export interface PlatformChannelCapacity {
  baseLimit: number | null;
  extraChannels: number;
  totalLimit: number | null;
  usedChannels: number;
  remainingChannels: number | null;
}

export interface PlatformAccountDetail {
  overview: PlatformAccountOverview;
  members: PlatformMemberSummary[];
  departments: PlatformDepartmentSummary[];
  channels: PlatformChannelSummary[];
  audit: PlatformAuditSummary[];
  aiUsage: import('@/lib/ai/points/types').AiUsageSummary;
  catalogCapacity: PlatformCatalogCapacity;
  channelCapacity: PlatformChannelCapacity;
}
