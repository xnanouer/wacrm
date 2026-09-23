const OFFICE_OPEN_XML_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const LEGACY_OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false;
  return [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0)
  );
}

function isIsoBaseMedia(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && asciiAt(bytes, 4, 'ftyp');
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that the bytes agree with the MIME type supplied by the client.
 * This is intentionally a compact signature allow-list, not an antivirus.
 */
export function matchesDeclaredFileType(
  bytes: Uint8Array,
  declaredMime: string
): boolean {
  const mime = declaredMime.split(';')[0]!.trim().toLowerCase();

  switch (mime) {
    case 'image/png':
      return startsWith(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      );
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/webp':
      return asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP');
    case 'image/gif':
      return asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a');
    case 'application/pdf':
      return asciiAt(bytes, 0, '%PDF-');
    case 'video/mp4':
    case 'audio/mp4':
    case 'video/3gpp':
      return isIsoBaseMedia(bytes);
    case 'audio/ogg':
    case 'audio/opus':
      return asciiAt(bytes, 0, 'OggS');
    case 'audio/mpeg':
      return (
        asciiAt(bytes, 0, 'ID3') ||
        (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
      );
    case 'audio/aac':
      return (
        bytes.length >= 2 &&
        bytes[0] === 0xff &&
        (bytes[1] === 0xf1 || bytes[1] === 0xf9)
      );
    case 'audio/amr':
      return asciiAt(bytes, 0, '#!AMR\n');
    case 'text/plain':
      return looksLikeUtf8Text(bytes);
    default:
      if (OFFICE_OPEN_XML_MIMES.has(mime)) {
        return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
      }
      if (LEGACY_OFFICE_MIMES.has(mime)) {
        return startsWith(
          bytes,
          [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
        );
      }
      return false;
  }
}
