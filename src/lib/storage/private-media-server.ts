import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isDeliverableUrl } from '@/lib/webhooks/ssrf';
import {
  isAccountMediaPath,
  parsePrivateMediaReference,
} from './private-media-reference';

const DEFAULT_SIGNED_URL_SECONDS = 10 * 60;

export async function prepareOutboundMediaUrl(
  db: SupabaseClient,
  accountId: string,
  reference: string,
  expiresIn = DEFAULT_SIGNED_URL_SECONDS
): Promise<string> {
  const parsed = parsePrivateMediaReference(reference);
  if (parsed) {
    if (!isAccountMediaPath(parsed.path, accountId)) {
      throw new Error('Media does not belong to this account.');
    }
    const { data, error } = await db.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, expiresIn);
    if (error || !data?.signedUrl) {
      throw new Error('Could not authorize the private media file.');
    }
    return data.signedUrl;
  }

  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new Error('Media URL is invalid.');
  }
  if (url.protocol !== 'https:' || !(await isDeliverableUrl(url.toString()))) {
    throw new Error('Media URL must be a public, secure HTTPS address.');
  }
  return url.toString();
}
