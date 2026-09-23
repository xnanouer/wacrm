import type { QuickReply } from '@/types';

export function quickReplySlashQuery(text: string): string | null {
  if (!text.startsWith('/') || /\s/.test(text)) return null;
  return text.toLocaleLowerCase();
}

export function filterQuickReplies(
  replies: readonly QuickReply[],
  text: string,
  limit = 6
): QuickReply[] {
  const query = quickReplySlashQuery(text);
  if (query === null) return [];
  const term = query.slice(1);
  return replies
    .filter((reply) => {
      const shortcut = (reply.shortcut ?? '').toLocaleLowerCase();
      const title = reply.title.toLocaleLowerCase();
      return !term || shortcut.startsWith(`/${term}`) || title.includes(term);
    })
    .slice(0, limit);
}
