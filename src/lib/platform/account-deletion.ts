import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;
const MAX_STORAGE_DEPTH = 20;

export interface AccountStorageTarget {
  bucket: string;
  prefix: string;
}

export interface StorageCleanupResult {
  removedObjects: number;
  warnings: string[];
}

export function isAccountDeletionConfirmation(
  accountName: string,
  confirmation: unknown
): boolean {
  return (
    typeof confirmation === 'string' && confirmation.trim() === accountName
  );
}

export function accountStorageTargets(
  accountId: string,
  memberUserIds: string[]
): AccountStorageTarget[] {
  const accountPrefix = `account-${accountId}`;
  const targets: AccountStorageTarget[] = [
    { bucket: 'chat-media', prefix: accountPrefix },
    { bucket: 'flow-media', prefix: accountPrefix },
    { bucket: 'catalog-media', prefix: accountPrefix },
    { bucket: 'quotation-documents', prefix: accountPrefix },
    { bucket: 'contract-documents', prefix: accountPrefix },
    { bucket: 'company-logos', prefix: accountId },
  ];

  for (const userId of [...new Set(memberUserIds)]) {
    targets.push({ bucket: 'avatars', prefix: userId });
  }

  return targets;
}

async function collectStorageFiles(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
  depth = 0
): Promise<string[]> {
  if (depth > MAX_STORAGE_DEPTH) {
    throw new Error(`Storage path is too deep: ${bucket}/${prefix}`);
  }

  const files: string[] = [];
  let offset = 0;
  const storage = client.storage.from(bucket);

  while (true) {
    const { data, error } = await storage.list(prefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;

    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id || entry.metadata) {
        files.push(path);
      } else {
        files.push(
          ...(await collectStorageFiles(client, bucket, path, depth + 1))
        );
      }
    }

    if (entries.length < STORAGE_PAGE_SIZE) break;
    offset += entries.length;
  }

  return files;
}

export async function removeAccountStorage(
  client: SupabaseClient,
  targets: AccountStorageTarget[]
): Promise<StorageCleanupResult> {
  let removedObjects = 0;
  const warnings: string[] = [];

  for (const target of targets) {
    try {
      const files = await collectStorageFiles(
        client,
        target.bucket,
        target.prefix
      );
      const storage = client.storage.from(target.bucket);
      for (
        let index = 0;
        index < files.length;
        index += STORAGE_REMOVE_BATCH_SIZE
      ) {
        const batch = files.slice(index, index + STORAGE_REMOVE_BATCH_SIZE);
        const { error } = await storage.remove(batch);
        if (error) throw error;
        removedObjects += batch.length;
      }
    } catch (error) {
      warnings.push(
        `${target.bucket}/${target.prefix}: ${
          error instanceof Error ? error.message : 'storage cleanup failed'
        }`
      );
    }
  }

  return { removedObjects, warnings };
}
