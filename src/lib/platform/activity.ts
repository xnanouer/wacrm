export type PlatformPresenceStatus = 'connected' | 'inactive' | 'disconnected';

export interface PlatformActivityMetrics {
  online_now: number;
  active_24h: number;
  active_accounts_24h: number;
  total_users: number;
  total_accounts: number;
  active_whatsapp: number;
  open_support_cases: number;
  future_bookings: number;
}

export interface PlatformActivityUser {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  account_id: string;
  account_name: string;
  plan_code: string;
  current_path: string | null;
  device_type: 'desktop' | 'mobile' | null;
  signed_in_at: string | null;
  last_seen_at: string | null;
  presence_status: PlatformPresenceStatus;
}

export interface PlatformActivitySnapshot {
  generated_at: string;
  metrics: PlatformActivityMetrics;
  users: PlatformActivityUser[];
}

export function isActiveToday(user: PlatformActivityUser): boolean {
  if (!user.last_seen_at) return false;
  return Date.now() - new Date(user.last_seen_at).getTime() <= 86_400_000;
}
