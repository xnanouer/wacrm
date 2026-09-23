export const STORAGE_ALERT_THRESHOLDS = [60, 80, 90] as const;
export type StorageAlertThreshold = (typeof STORAGE_ALERT_THRESHOLDS)[number];
export type StorageResourceType = 'database' | 'storage';

export interface PlatformStorageModuleUsage {
  accountId: string;
  accountName: string;
  module: string;
  databaseBytes: number;
  storageBytes: number;
  fileCount: number;
  totalBytes: number;
}

export interface PlatformStorageAccountUsage {
  accountId: string;
  accountName: string;
  databaseBytes: number;
  storageBytes: number;
  fileCount: number;
  totalBytes: number;
  topModule: string | null;
  modules: PlatformStorageModuleUsage[];
}

export interface PlatformStorageAlert {
  id: string;
  resourceType: StorageResourceType;
  threshold: StorageAlertThreshold;
  status: 'active' | 'resolved';
  usageBytes: number;
  capacityBytes: number;
  usagePercent: number;
  topAccountId: string | null;
  topAccountName: string | null;
  topModule: string | null;
  firstTriggeredAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface PlatformStorageOverview {
  snapshotId: string;
  measuredAt: string;
  databaseBytes: number;
  storageBytes: number;
  storageFiles: number;
  databaseCapacityBytes: number;
  storageCapacityBytes: number;
  databasePercent: number;
  storagePercent: number;
  accounts: PlatformStorageAccountUsage[];
  modules: Array<{
    module: string;
    databaseBytes: number;
    storageBytes: number;
    fileCount: number;
    totalBytes: number;
  }>;
  activeAlerts: PlatformStorageAlert[];
}

export function usagePercent(usedBytes: number, capacityBytes: number): number {
  if (!Number.isFinite(capacityBytes) || capacityBytes <= 0) return 0;
  return Math.round((usedBytes / capacityBytes) * 100_000) / 1_000;
}

export function storageAlertLevel(percent: number): StorageAlertThreshold | 0 {
  if (percent >= 90) return 90;
  if (percent >= 80) return 80;
  if (percent >= 60) return 60;
  return 0;
}
