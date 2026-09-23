import { describe, expect, it } from 'vitest';

import type { QuickReply } from '@/types';
import { filterQuickReplies, quickReplySlashQuery } from './filter';

const replies = [
  { id: '1', title: 'Lead aprobado', shortcut: '/aprobado', body: 'Sí' },
  { id: '2', title: 'Saludo inicial', shortcut: '/hola', body: 'Hola' },
] as QuickReply[];

describe('quick reply slash filter', () => {
  it('opens for / and filters by shortcut or title', () => {
    expect(filterQuickReplies(replies, '/')).toHaveLength(2);
    expect(filterQuickReplies(replies, '/apro')[0]?.id).toBe('1');
    expect(filterQuickReplies(replies, '/saludo')[0]?.id).toBe('2');
  });

  it('closes after normal prose or whitespace', () => {
    expect(quickReplySlashQuery('hola')).toBeNull();
    expect(quickReplySlashQuery('/hola cliente')).toBeNull();
  });
});
