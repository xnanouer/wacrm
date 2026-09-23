import 'server-only';

import { createHash } from 'node:crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import type { AccountRole } from '@/lib/auth/roles';

export const MOTIVATIONAL_CATEGORIES = [
  'general',
  'sales',
  'customer_service',
  'leadership',
] as const;
export const MOTIVATIONAL_INDUSTRIES = [
  'automotive',
  'real_estate_construction',
] as const;
export const MOTIVATIONAL_AUDIENCES = ['all', 'admins', 'agents'] as const;

export type MotivationalCategory = (typeof MOTIVATIONAL_CATEGORIES)[number];
export type MotivationalIndustry = (typeof MOTIVATIONAL_INDUSTRIES)[number];
export type MotivationalAudience = (typeof MOTIVATIONAL_AUDIENCES)[number];

export interface MotivationalQuote {
  id: string;
  text: string;
  author: string | null;
  category: MotivationalCategory;
  industry: MotivationalIndustry | null;
  audience: MotivationalAudience;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DailyMotivationalQuote {
  id: string;
  text: string;
  author: string | null;
  category: MotivationalCategory;
  industry: MotivationalIndustry | null;
  date: string;
}

type QuoteRow = {
  id: string;
  text: string;
  author: string | null;
  category: string;
  industry: string | null;
  audience: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapQuote(row: QuoteRow): MotivationalQuote {
  return {
    id: row.id,
    text: row.text,
    author: row.author,
    category: row.category as MotivationalCategory,
    industry: row.industry as MotivationalIndustry | null,
    audience: row.audience as MotivationalAudience,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMotivationalQuotes(): Promise<MotivationalQuote[]> {
  const { data, error } = await supabaseAdmin()
    .from('platform_motivational_quotes')
    .select(
      'id, text, author, category, industry, audience, is_active, created_at, updated_at'
    )
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as QuoteRow[]).map(mapQuote);
}

function chileDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function deterministicNumber(seed: string) {
  return Number.parseInt(
    createHash('sha256').update(seed).digest('hex').slice(0, 8),
    16
  );
}

function audienceForRole(role: AccountRole): 'admins' | 'agents' {
  return ['owner', 'admin', 'supervisor'].includes(role) ? 'admins' : 'agents';
}

export async function getDailyMotivationalQuote(input: {
  userId: string;
  accountId: string;
  role: AccountRole;
}): Promise<DailyMotivationalQuote | null> {
  const admin = supabaseAdmin();
  const date = chileDate();
  const { data: assigned, error: assignedError } = await admin
    .from('daily_motivational_quote_assignments')
    .select(
      'id, text_snapshot, author_snapshot, category_snapshot, industry_snapshot, quote_date'
    )
    .eq('user_id', input.userId)
    .eq('quote_date', date)
    .maybeSingle();
  if (assignedError) throw assignedError;
  if (assigned) {
    return {
      id: assigned.id,
      text: assigned.text_snapshot,
      author: assigned.author_snapshot,
      category: assigned.category_snapshot as MotivationalCategory,
      industry: assigned.industry_snapshot as MotivationalIndustry | null,
      date: assigned.quote_date,
    };
  }

  const [
    { data: account, error: accountError },
    { data: recent, error: recentError },
  ] = await Promise.all([
    admin
      .from('accounts')
      .select('industry')
      .eq('id', input.accountId)
      .single(),
    admin
      .from('daily_motivational_quote_assignments')
      .select('quote_id')
      .eq('user_id', input.userId)
      .gte(
        'quote_date',
        new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      ),
  ]);
  if (accountError || recentError) throw accountError ?? recentError;

  const audience = audienceForRole(input.role);
  const { data: rows, error: quotesError } = await admin
    .from('platform_motivational_quotes')
    .select(
      'id, text, author, category, industry, audience, is_active, created_at, updated_at'
    )
    .eq('is_active', true)
    .in('audience', ['all', audience]);
  if (quotesError) throw quotesError;

  const compatible = ((rows ?? []) as QuoteRow[]).filter(
    (quote) => !quote.industry || quote.industry === account.industry
  );
  if (!compatible.length) return null;

  const recentIds = new Set(
    (recent ?? []).map((item) => item.quote_id).filter(Boolean)
  );
  const unused = compatible.filter((quote) => !recentIds.has(quote.id));
  const poolWithoutRepeats = unused.length ? unused : compatible;
  const industryQuotes = poolWithoutRepeats.filter(
    (quote) => quote.industry === account.industry
  );
  const generalQuotes = poolWithoutRepeats.filter((quote) => !quote.industry);
  const seed = `${input.userId}:${date}`;
  const preferIndustry = deterministicNumber(`${seed}:mix`) % 10 < 7;
  const pool =
    preferIndustry && industryQuotes.length
      ? industryQuotes
      : generalQuotes.length
        ? generalQuotes
        : industryQuotes.length
          ? industryQuotes
          : poolWithoutRepeats;
  const selected = pool[deterministicNumber(seed) % pool.length];

  const assignment = {
    account_id: input.accountId,
    user_id: input.userId,
    quote_id: selected.id,
    quote_date: date,
    text_snapshot: selected.text,
    author_snapshot: selected.author,
    category_snapshot: selected.category,
    industry_snapshot: selected.industry,
  };
  const { data: created, error: createError } = await admin
    .from('daily_motivational_quote_assignments')
    .upsert(assignment, {
      onConflict: 'user_id,quote_date',
      ignoreDuplicates: true,
    })
    .select(
      'id, text_snapshot, author_snapshot, category_snapshot, industry_snapshot, quote_date'
    )
    .maybeSingle();
  if (createError) throw createError;

  const finalAssignment =
    created ??
    (
      await admin
        .from('daily_motivational_quote_assignments')
        .select(
          'id, text_snapshot, author_snapshot, category_snapshot, industry_snapshot, quote_date'
        )
        .eq('user_id', input.userId)
        .eq('quote_date', date)
        .single()
    ).data;
  if (!finalAssignment) return null;

  return {
    id: finalAssignment.id,
    text: finalAssignment.text_snapshot,
    author: finalAssignment.author_snapshot,
    category: finalAssignment.category_snapshot as MotivationalCategory,
    industry: finalAssignment.industry_snapshot as MotivationalIndustry | null,
    date: finalAssignment.quote_date,
  };
}
