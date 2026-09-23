const PRIVATE_MEDIA_BUCKETS = [
  'chat-media',
  'flow-media',
  'catalog-media',
] as const;

export type PrivateMediaBucket = (typeof PRIVATE_MEDIA_BUCKETS)[number];

export interface PrivateMediaReference {
  bucket: PrivateMediaBucket;
  path: string;
}

export function isPrivateMediaBucket(
  value: string
): value is PrivateMediaBucket {
  return (PRIVATE_MEDIA_BUCKETS as readonly string[]).includes(value);
}

export function buildPrivateMediaUrl(
  bucket: PrivateMediaBucket,
  path: string
): string {
  const query = new URLSearchParams({ bucket, path });
  return `/api/storage/media?${query.toString()}`;
}

/**
 * Understand both Nexora's durable private reference and the legacy public
 * Supabase URLs saved before the buckets became private. This lets existing
 * rows keep working without a destructive data rewrite.
 */
export function parsePrivateMediaReference(
  reference: string
): PrivateMediaReference | null {
  if (!reference?.trim()) return null;

  try {
    const url = new URL(reference, 'https://nexora.invalid');
    if (url.pathname === '/api/storage/media') {
      const bucket = url.searchParams.get('bucket') ?? '';
      const path = url.searchParams.get('path') ?? '';
      return isPrivateMediaBucket(bucket) && path ? { bucket, path } : null;
    }

    const match = url.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign)\/(chat-media|flow-media|catalog-media)\/(.+)$/
    );
    if (!match || !isPrivateMediaBucket(match[1])) return null;
    return {
      bucket: match[1],
      path: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function privateMediaViewUrl(reference: string): string {
  const parsed = parsePrivateMediaReference(reference);
  return parsed ? buildPrivateMediaUrl(parsed.bucket, parsed.path) : reference;
}

export function isAccountMediaPath(path: string, accountId: string): boolean {
  return path.startsWith(`account-${accountId}/`) && !path.includes('..');
}
