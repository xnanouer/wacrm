const INSTAGRAM_ATTACHMENT_LABELS: Record<string, string> = {
  ig_reel: 'Reel de Instagram',
  ig_post: 'Publicación de Instagram',
  story_mention: 'Historia de Instagram',
};

/**
 * Meta uses channel-specific attachment types such as `ig_reel`. Keep media
 * attachments compatible with the existing renderer while giving social
 * shares a useful label instead of exposing an internal webhook token.
 */
export function metaAttachmentFallbackText(
  channel: 'facebook' | 'instagram',
  attachmentType?: string
): string | null {
  if (!attachmentType) return null;

  const normalizedType = attachmentType.trim().toLowerCase();
  if (channel === 'instagram') {
    const label = INSTAGRAM_ATTACHMENT_LABELS[normalizedType];
    if (label) return label;

    if (!['image', 'video', 'audio', 'file'].includes(normalizedType)) {
      return 'Contenido compartido en Instagram';
    }
  }

  return `[${attachmentType}]`;
}

/** Converts historical webhook placeholders into user-facing inbox text. */
export function visibleSocialMessageText(
  value: string | null | undefined
): string | null {
  const text = value?.trim();
  if (!text) return null;

  const placeholder = text.match(/^\[([^\]]+)]$/)?.[1]?.toLowerCase();
  if (!placeholder) return text;

  return INSTAGRAM_ATTACHMENT_LABELS[placeholder] ?? text;
}

/**
 * Only allow public Instagram permalinks to become clickable. This prevents a
 * malformed webhook row from turning the inbox into an arbitrary-link surface.
 */
export function instagramPermalink(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isInstagramHost =
      host === 'instagram.com' || host.endsWith('.instagram.com');

    return url.protocol === 'https:' && isInstagramHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export function instagramShareTitle(
  url: string,
  contentText?: string | null
): string {
  const visibleText = visibleSocialMessageText(contentText);
  if (
    visibleText &&
    Object.values(INSTAGRAM_ATTACHMENT_LABELS).includes(visibleText)
  ) {
    return visibleText;
  }

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.startsWith('/reel/') || pathname.startsWith('/reels/')) {
      return 'Reel de Instagram';
    }
    if (pathname.startsWith('/p/')) return 'Publicación de Instagram';
    if (pathname.startsWith('/stories/')) return 'Historia de Instagram';
  } catch {
    // `instagramPermalink` validates the URL before this helper is called.
  }

  return 'Contenido compartido en Instagram';
}
