'use client';

import { useAuth } from '@/hooks/use-auth';
import type { ActiveIndustry } from '@/lib/industries/config';

export function useAccountIndustry(): ActiveIndustry | null {
  return useAuth().account?.industry ?? null;
}
