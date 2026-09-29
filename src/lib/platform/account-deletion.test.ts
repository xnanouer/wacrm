import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  accountStorageTargets,
  isAccountDeletionConfirmation,
  removeAccountStorage,
} from './account-deletion';

describe('platform account deletion safeguards', () => {
  it('requires the exact company name after trimming surrounding spaces', () => {
    expect(
      isAccountDeletionConfirmation(
        'Salgado Automotriz',
        ' Salgado Automotriz '
      )
    ).toBe(true);
    expect(
      isAccountDeletionConfirmation('Salgado Automotriz', 'salgado automotriz')
    ).toBe(false);
    expect(isAccountDeletionConfirmation('Salgado Automotriz', null)).toBe(
      false
    );
  });

  it('targets every account-scoped bucket and deduplicates member avatars', () => {
    const targets = accountStorageTargets('account-id', [
      'owner-id',
      'agent-id',
      'owner-id',
    ]);

    expect(targets).toEqual(
      expect.arrayContaining([
        { bucket: 'chat-media', prefix: 'account-account-id' },
        { bucket: 'flow-media', prefix: 'account-account-id' },
        { bucket: 'catalog-media', prefix: 'account-account-id' },
        { bucket: 'quotation-documents', prefix: 'account-account-id' },
        { bucket: 'contract-documents', prefix: 'account-account-id' },
        { bucket: 'company-logos', prefix: 'account-id' },
        { bucket: 'avatars', prefix: 'owner-id' },
        { bucket: 'avatars', prefix: 'agent-id' },
      ])
    );
    expect(
      targets.filter(
        (target) => target.bucket === 'avatars' && target.prefix === 'owner-id'
      )
    ).toHaveLength(1);
  });

  it('removes files nested below an account storage prefix', async () => {
    const list = vi.fn(async (prefix: string) => {
      if (prefix === 'account-company') {
        return {
          data: [
            { id: 'root-id', name: 'root.jpg', metadata: {} },
            { id: null, name: 'nested', metadata: null },
          ],
          error: null,
        };
      }
      if (prefix === 'account-company/nested') {
        return {
          data: [{ id: 'nested-id', name: 'document.pdf', metadata: {} }],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    const remove = vi.fn(async () => ({ data: [], error: null }));
    const client = {
      storage: { from: vi.fn(() => ({ list, remove })) },
    } as unknown as SupabaseClient;

    const result = await removeAccountStorage(client, [
      { bucket: 'chat-media', prefix: 'account-company' },
    ]);

    expect(remove).toHaveBeenCalledWith([
      'account-company/root.jpg',
      'account-company/nested/document.pdf',
    ]);
    expect(result).toEqual({ removedObjects: 2, warnings: [] });
  });
});
