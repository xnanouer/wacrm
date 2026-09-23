export type ChatAttachmentKind = 'image' | 'video' | 'document' | 'audio';

export const CHAT_ATTACHMENT_ACCEPT: Record<
  Exclude<ChatAttachmentKind, 'audio'>,
  string
> = {
  image: 'image/png,image/jpeg,image/webp',
  video: 'video/mp4,video/3gpp',
  document:
    'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
};

const KIND_BY_MIME: Record<string, ChatAttachmentKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gpp': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'document',
  'text/plain': 'document',
  'audio/ogg': 'audio',
  'audio/mpeg': 'audio',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/amr': 'audio',
};

const KIND_BY_EXTENSION: Record<string, ChatAttachmentKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  mp4: 'video',
  '3gp': 'video',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  txt: 'document',
  ogg: 'audio',
  mp3: 'audio',
  aac: 'audio',
  m4a: 'audio',
  amr: 'audio',
};

/**
 * Classifies an attachment using the same safe allow-list as chat-media.
 * Some operating systems omit File.type during drag-and-drop, so the
 * extension is used only as a fallback.
 */
export function classifyChatAttachment(
  file: Pick<File, 'name' | 'type'>
): ChatAttachmentKind | null {
  const mime = file.type.split(';')[0]?.trim().toLowerCase();
  if (mime && KIND_BY_MIME[mime]) return KIND_BY_MIME[mime];

  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  return extension ? (KIND_BY_EXTENSION[extension] ?? null) : null;
}
