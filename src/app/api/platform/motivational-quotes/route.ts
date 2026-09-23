import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  MOTIVATIONAL_AUDIENCES,
  MOTIVATIONAL_CATEGORIES,
  MOTIVATIONAL_INDUSTRIES,
  listMotivationalQuotes,
  type MotivationalAudience,
  type MotivationalCategory,
  type MotivationalIndustry,
} from '@/lib/motivational-quotes';
import {
  requirePlatformRole,
  toPlatformErrorResponse,
} from '@/lib/platform/auth';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function includes<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function validateQuote(input: Record<string, unknown>) {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const author = typeof input.author === 'string' ? input.author.trim() : '';
  const category = input.category;
  const audience = input.audience;
  const industry = input.industry || null;
  if (
    text.length < 8 ||
    text.length > 500 ||
    author.length > 120 ||
    !includes(MOTIVATIONAL_CATEGORIES, category) ||
    !includes(MOTIVATIONAL_AUDIENCES, audience) ||
    (industry !== null && !includes(MOTIVATIONAL_INDUSTRIES, industry))
  ) {
    return null;
  }
  return {
    text,
    author: author || null,
    category: category as MotivationalCategory,
    industry: industry as MotivationalIndustry | null,
    audience: audience as MotivationalAudience,
    is_active: input.isActive !== false,
  };
}

export async function GET() {
  try {
    await requirePlatformRole('platform_owner');
    return NextResponse.json({ quotes: await listMotivationalQuotes() });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const limit = checkRateLimit(
      `motivational-quotes:${actor.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const rawQuotes = Array.isArray(body?.quotes)
      ? body.quotes
      : body
        ? [body]
        : [];
    if (!rawQuotes.length || rawQuotes.length > 500) {
      return NextResponse.json(
        { error: 'Puedes cargar entre 1 y 500 frases por vez.' },
        { status: 400 }
      );
    }
    const quotes = rawQuotes.map((item) =>
      item && typeof item === 'object'
        ? validateQuote(item as Record<string, unknown>)
        : null
    );
    if (quotes.some((quote) => !quote)) {
      return NextResponse.json(
        { error: 'Una o más frases contienen datos inválidos.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from('platform_motivational_quotes')
      .insert(
        quotes.map((quote) => ({
          ...quote!,
          created_by_user_id: actor.userId,
        }))
      )
      .select('id');
    if (error) throw error;
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.motivational_quotes_created',
      next_data: {
        ids: (data ?? []).map((item) => item.id),
        count: data?.length ?? 0,
      },
      reason: rawQuotes.length > 1 ? 'Carga masiva de frases' : 'Frase creada',
    });
    return NextResponse.json({ success: true, count: data?.length ?? 0 });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!body || !UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Frase inválida.' }, { status: 400 });
    }
    const values = validateQuote(body);
    if (!values) {
      return NextResponse.json(
        { error: 'Revisa los datos de la frase.' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: previous, error: previousError } = await admin
      .from('platform_motivational_quotes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (previousError) throw previousError;
    if (!previous)
      return NextResponse.json(
        { error: 'Frase no encontrada.' },
        { status: 404 }
      );
    const { error } = await admin
      .from('platform_motivational_quotes')
      .update(values)
      .eq('id', id);
    if (error) throw error;
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.motivational_quote_updated',
      previous_data: previous,
      next_data: { id, ...values },
      reason: values.is_active ? 'Frase actualizada' : 'Frase desactivada',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requirePlatformRole('platform_owner');
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Frase inválida.' }, { status: 400 });
    }
    const admin = supabaseAdmin();
    const { data: previous, error: previousError } = await admin
      .from('platform_motivational_quotes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (previousError) throw previousError;
    if (!previous)
      return NextResponse.json(
        { error: 'Frase no encontrada.' },
        { status: 404 }
      );
    const { error } = await admin
      .from('platform_motivational_quotes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await admin.from('platform_audit_logs').insert({
      actor_user_id: actor.userId,
      action: 'platform.motivational_quote_deleted',
      previous_data: previous,
      next_data: { id },
      reason: 'Frase eliminada del catálogo global',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return toPlatformErrorResponse(error);
  }
}
