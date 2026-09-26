const MEDIA_CONTENT_TYPES = new Set(['image', 'video', 'audio', 'document']);

/**
 * Some WhatsApp Web versions expose the attachment bytes in `message.body`
 * while the actual caption is empty. Those bytes are already persisted in
 * `media_url`; treating them as a caption produces a huge base64 string in
 * the inbox and an unusable filename in the media viewer.
 */
export function isLikelyEncodedMediaPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:(?:image|video|audio)\/[\w.+-]+;base64,/i.test(trimmed)) {
    return true;
  }

  const compact = trimmed.replace(/\s+/g, '');
  if (compact.length < 128) return false;

  const hasKnownMediaSignature =
    /^(?:\/9j\/|iVBORw0KGgo|UklGR|R0lGOD|Qk[0-9A-Za-z+/]|AAAA[0-9A-Za-z+/]{4,40}(?:Z?XR5c|ZnR5c))/i.test(
      compact
    );
  if (hasKnownMediaSignature) return true;

  // WhatsApp captions are much shorter than an encoded attachment. This
  // catches payloads from future formats without hiding normal prose, URLs,
  // punctuation or filenames.
  return (
    compact.length >= 2_048 &&
    /^[A-Za-z0-9+/_=-]+$/.test(compact) &&
    compact.length % 4 <= 3
  );
}

export function visibleMediaText(
  value: string | null | undefined,
  contentType: string
): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (!MEDIA_CONTENT_TYPES.has(contentType)) return text;
  return isLikelyEncodedMediaPayload(text) ? null : text;
}
