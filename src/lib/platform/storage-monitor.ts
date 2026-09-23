import 'server-only';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  STORAGE_ALERT_THRESHOLDS,
  usagePercent,
  type PlatformStorageAccountUsage,
  type PlatformStorageAlert,
  type PlatformStorageModuleUsage,
  type PlatformStorageOverview,
  type StorageAlertThreshold,
  type StorageResourceType,
} from './storage-monitor-shared';

export type {
  PlatformStorageAccountUsage,
  PlatformStorageAlert,
  PlatformStorageModuleUsage,
  PlatformStorageOverview,
  StorageAlertThreshold,
  StorageResourceType,
} from './storage-monitor-shared';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;
const DEFAULT_DATABASE_CAPACITY = 500 * MIB;
const DEFAULT_STORAGE_CAPACITY = GIB;
const SNAPSHOT_RETENTION_DAYS = 180;

interface SettingsRow {
  database_capacity_bytes: number | string;
  storage_capacity_bytes: number | string;
}

interface TotalRow {
  database_bytes: number | string;
  storage_bytes: number | string;
  storage_files: number | string;
}

interface ModuleRow {
  account_id: string;
  account_name: string;
  module: string;
  database_bytes: number | string;
  storage_bytes: number | string;
  file_count: number | string;
}

interface SnapshotRow {
  id: string;
  database_bytes: number | string;
  storage_bytes: number | string;
  database_capacity_bytes: number | string;
  storage_capacity_bytes: number | string;
  database_percent: number | string;
  storage_percent: number | string;
  breakdown: unknown;
  created_at: string;
}

interface AlertRow {
  id: string;
  resource_type: StorageResourceType;
  threshold: StorageAlertThreshold;
  status: 'active' | 'resolved';
  usage_bytes: number | string;
  capacity_bytes: number | string;
  usage_percent: number | string;
  top_account_id: string | null;
  top_account_name: string | null;
  top_module: string | null;
  first_triggered_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function groupUsage(rows: ModuleRow[]): {
  accounts: PlatformStorageAccountUsage[];
  modules: PlatformStorageOverview['modules'];
} {
  const accountMap = new Map<string, PlatformStorageAccountUsage>();
  const moduleMap = new Map<
    string,
    PlatformStorageOverview['modules'][number]
  >();

  for (const row of rows) {
    const usage: PlatformStorageModuleUsage = {
      accountId: row.account_id,
      accountName: row.account_name,
      module: row.module,
      databaseBytes: asNumber(row.database_bytes),
      storageBytes: asNumber(row.storage_bytes),
      fileCount: asNumber(row.file_count),
      totalBytes: asNumber(row.database_bytes) + asNumber(row.storage_bytes),
    };
    const account = accountMap.get(usage.accountId) ?? {
      accountId: usage.accountId,
      accountName: usage.accountName,
      databaseBytes: 0,
      storageBytes: 0,
      fileCount: 0,
      totalBytes: 0,
      topModule: null,
      modules: [],
    };
    account.databaseBytes += usage.databaseBytes;
    account.storageBytes += usage.storageBytes;
    account.fileCount += usage.fileCount;
    account.totalBytes += usage.totalBytes;
    account.modules.push(usage);
    accountMap.set(usage.accountId, account);

    const moduleSummary = moduleMap.get(usage.module) ?? {
      module: usage.module,
      databaseBytes: 0,
      storageBytes: 0,
      fileCount: 0,
      totalBytes: 0,
    };
    moduleSummary.databaseBytes += usage.databaseBytes;
    moduleSummary.storageBytes += usage.storageBytes;
    moduleSummary.fileCount += usage.fileCount;
    moduleSummary.totalBytes += usage.totalBytes;
    moduleMap.set(usage.module, moduleSummary);
  }

  const accounts = [...accountMap.values()]
    .map((account) => {
      account.modules.sort((a, b) => b.totalBytes - a.totalBytes);
      account.topModule = account.modules[0]?.module ?? null;
      return account;
    })
    .sort((a, b) => b.totalBytes - a.totalBytes);
  const modules = [...moduleMap.values()].sort(
    (a, b) => b.totalBytes - a.totalBytes
  );
  return { accounts, modules };
}

function mapAlert(row: AlertRow): PlatformStorageAlert {
  return {
    id: row.id,
    resourceType: row.resource_type,
    threshold: row.threshold,
    status: row.status,
    usageBytes: asNumber(row.usage_bytes),
    capacityBytes: asNumber(row.capacity_bytes),
    usagePercent: asNumber(row.usage_percent),
    topAccountId: row.top_account_id,
    topAccountName: row.top_account_name,
    topModule: row.top_module,
    firstTriggeredAt: row.first_triggered_at,
    lastSeenAt: row.last_seen_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
  };
}

async function loadSettings(): Promise<SettingsRow> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('platform_storage_settings')
    .select('database_capacity_bytes, storage_capacity_bytes')
    .eq('singleton_id', 1)
    .maybeSingle();
  if (error) throw error;
  return (
    data ?? {
      database_capacity_bytes: DEFAULT_DATABASE_CAPACITY,
      storage_capacity_bytes: DEFAULT_STORAGE_CAPACITY,
    }
  );
}

async function loadActiveAlerts(): Promise<PlatformStorageAlert[]> {
  const { data, error } = await supabaseAdmin()
    .from('platform_storage_alerts')
    .select(
      'id, resource_type, threshold, status, usage_bytes, capacity_bytes, usage_percent, top_account_id, top_account_name, top_module, first_triggered_at, last_seen_at, acknowledged_at, resolved_at'
    )
    .eq('status', 'active')
    .order('threshold', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AlertRow[]).map(mapAlert);
}

async function reconcileAlerts(input: {
  databaseBytes: number;
  storageBytes: number;
  databaseCapacityBytes: number;
  storageCapacityBytes: number;
  databasePercent: number;
  storagePercent: number;
  accounts: PlatformStorageAccountUsage[];
}) {
  const admin = supabaseAdmin();
  const { data: currentRows, error } = await admin
    .from('platform_storage_alerts')
    .select(
      'id, resource_type, threshold, status, usage_bytes, capacity_bytes, usage_percent, top_account_id, top_account_name, top_module, first_triggered_at, last_seen_at, acknowledged_at, resolved_at'
    )
    .eq('status', 'active');
  if (error) throw error;

  const active = new Map(
    ((currentRows ?? []) as AlertRow[]).map((row) => [
      `${row.resource_type}:${row.threshold}`,
      row,
    ])
  );
  const now = new Date().toISOString();

  for (const resourceType of ['database', 'storage'] as const) {
    const usageBytes =
      resourceType === 'database' ? input.databaseBytes : input.storageBytes;
    const capacityBytes =
      resourceType === 'database'
        ? input.databaseCapacityBytes
        : input.storageCapacityBytes;
    const percent =
      resourceType === 'database'
        ? input.databasePercent
        : input.storagePercent;
    const accountUsage = (account: PlatformStorageAccountUsage) =>
      resourceType === 'database'
        ? account.databaseBytes
        : account.storageBytes;
    const moduleUsage = (module: PlatformStorageModuleUsage) =>
      resourceType === 'database' ? module.databaseBytes : module.storageBytes;
    const rankedAccounts = [...input.accounts].sort(
      (left, right) => accountUsage(right) - accountUsage(left)
    );
    const topAccount = rankedAccounts[0] ?? null;
    const topModule = topAccount
      ? ([...topAccount.modules].sort(
          (left, right) => moduleUsage(right) - moduleUsage(left)
        )[0]?.module ?? null)
      : null;

    for (const threshold of STORAGE_ALERT_THRESHOLDS) {
      const key = `${resourceType}:${threshold}`;
      const existing = active.get(key);
      if (percent >= threshold) {
        const values = {
          usage_bytes: usageBytes,
          capacity_bytes: capacityBytes,
          usage_percent: percent,
          top_account_id: topAccount?.accountId ?? null,
          top_account_name: topAccount?.accountName ?? null,
          top_module: topModule,
          details: {
            top_accounts: rankedAccounts.slice(0, 5).map((account) => ({
              account_id: account.accountId,
              account_name: account.accountName,
              resource_bytes: accountUsage(account),
              top_module:
                [...account.modules].sort(
                  (left, right) => moduleUsage(right) - moduleUsage(left)
                )[0]?.module ?? null,
            })),
          },
          last_seen_at: now,
        };
        if (existing) {
          const update = await admin
            .from('platform_storage_alerts')
            .update(values)
            .eq('id', existing.id);
          if (update.error) throw update.error;
        } else {
          const insert = await admin.from('platform_storage_alerts').insert({
            resource_type: resourceType,
            threshold,
            status: 'active',
            ...values,
          });
          if (insert.error && insert.error.code !== '23505') throw insert.error;
        }
      } else if (existing) {
        const resolved = await admin
          .from('platform_storage_alerts')
          .update({ status: 'resolved', resolved_at: now, last_seen_at: now })
          .eq('id', existing.id);
        if (resolved.error) throw resolved.error;
      }
    }
  }
}

function overviewFromSnapshot(
  row: SnapshotRow,
  activeAlerts: PlatformStorageAlert[]
): PlatformStorageOverview {
  const breakdown = (Array.isArray(row.breakdown) ? row.breakdown : []) as {
    accounts?: PlatformStorageAccountUsage[];
    modules?: PlatformStorageOverview['modules'];
    storageFiles?: number;
  }[];
  const payload = breakdown[0] ?? {};
  return {
    snapshotId: row.id,
    measuredAt: row.created_at,
    databaseBytes: asNumber(row.database_bytes),
    storageBytes: asNumber(row.storage_bytes),
    storageFiles: asNumber(payload.storageFiles),
    databaseCapacityBytes: asNumber(row.database_capacity_bytes),
    storageCapacityBytes: asNumber(row.storage_capacity_bytes),
    databasePercent: asNumber(row.database_percent),
    storagePercent: asNumber(row.storage_percent),
    accounts: payload.accounts ?? [],
    modules: payload.modules ?? [],
    activeAlerts,
  };
}

export async function runPlatformStorageMonitor(): Promise<PlatformStorageOverview> {
  const admin = supabaseAdmin();
  const [settings, totalsResult, moduleResult] = await Promise.all([
    loadSettings(),
    admin.rpc('platform_storage_totals'),
    admin.rpc('platform_storage_module_usage'),
  ]);
  if (totalsResult.error) throw totalsResult.error;
  if (moduleResult.error) throw moduleResult.error;

  const totals = (totalsResult.data?.[0] ?? {}) as TotalRow;
  const databaseBytes = asNumber(totals.database_bytes);
  const storageBytes = asNumber(totals.storage_bytes);
  const storageFiles = asNumber(totals.storage_files);
  const databaseCapacityBytes = asNumber(settings.database_capacity_bytes);
  const storageCapacityBytes = asNumber(settings.storage_capacity_bytes);
  const databasePercent = usagePercent(databaseBytes, databaseCapacityBytes);
  const storagePercent = usagePercent(storageBytes, storageCapacityBytes);
  const grouped = groupUsage((moduleResult.data ?? []) as ModuleRow[]);

  const inserted = await admin
    .from('platform_storage_snapshots')
    .insert({
      database_bytes: databaseBytes,
      storage_bytes: storageBytes,
      database_capacity_bytes: databaseCapacityBytes,
      storage_capacity_bytes: storageCapacityBytes,
      database_percent: databasePercent,
      storage_percent: storagePercent,
      breakdown: [
        {
          storageFiles,
          accounts: grouped.accounts,
          modules: grouped.modules,
        },
      ],
    })
    .select(
      'id, database_bytes, storage_bytes, database_capacity_bytes, storage_capacity_bytes, database_percent, storage_percent, breakdown, created_at'
    )
    .single();
  if (inserted.error) throw inserted.error;

  await reconcileAlerts({
    databaseBytes,
    storageBytes,
    databaseCapacityBytes,
    storageCapacityBytes,
    databasePercent,
    storagePercent,
    accounts: grouped.accounts,
  });

  const cutoff = new Date(
    Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000
  ).toISOString();
  const cleanup = await admin
    .from('platform_storage_snapshots')
    .delete()
    .lt('created_at', cutoff);
  if (cleanup.error)
    console.warn('[platform storage] snapshot cleanup failed:', cleanup.error);

  return overviewFromSnapshot(
    inserted.data as SnapshotRow,
    await loadActiveAlerts()
  );
}

export async function getPlatformStorageOverview(): Promise<PlatformStorageOverview> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('platform_storage_snapshots')
    .select(
      'id, database_bytes, storage_bytes, database_capacity_bytes, storage_capacity_bytes, database_percent, storage_percent, breakdown, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return runPlatformStorageMonitor();
  return overviewFromSnapshot(data as SnapshotRow, await loadActiveAlerts());
}

export async function updatePlatformStorageCapacity(input: {
  databaseCapacityBytes: number;
  storageCapacityBytes: number;
  userId: string;
}): Promise<PlatformStorageOverview> {
  const minimum = 10 * MIB;
  const maximum = 10 * 1024 * GIB;
  if (
    !Number.isSafeInteger(input.databaseCapacityBytes) ||
    !Number.isSafeInteger(input.storageCapacityBytes) ||
    input.databaseCapacityBytes < minimum ||
    input.storageCapacityBytes < minimum ||
    input.databaseCapacityBytes > maximum ||
    input.storageCapacityBytes > maximum
  ) {
    throw new Error('INVALID_STORAGE_CAPACITY');
  }
  const { error } = await supabaseAdmin()
    .from('platform_storage_settings')
    .update({
      database_capacity_bytes: input.databaseCapacityBytes,
      storage_capacity_bytes: input.storageCapacityBytes,
      updated_by_user_id: input.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton_id', 1);
  if (error) throw error;
  return runPlatformStorageMonitor();
}
