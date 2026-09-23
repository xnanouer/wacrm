import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  isActiveIndustry,
  sanitizeOnboardingAnswers,
  validateOnboardingAnswers,
  type BusinessSubtype,
} from '@/lib/industries/config';

const MAX_NAME_LENGTH = 80;

export async function GET() {
  try {
    const ctx = await getCurrentAccount({ allowInactive: true });
    const { data, error } = await ctx.supabase
      .from('accounts')
      .select(
        'id, name, logo_url, industry, business_subtype, onboarding_completed, onboarding_completed_at, onboarding_answers'
      )
      .eq('id', ctx.accountId)
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data, role: ctx.role });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      industry?: unknown;
      answers?: unknown;
      step?: unknown;
    } | null;
    if (!isActiveIndustry(body?.industry)) {
      return NextResponse.json(
        { error: 'Selecciona un sector disponible' },
        { status: 400 }
      );
    }
    const step =
      typeof body?.step === 'number' &&
      Number.isInteger(body.step) &&
      body.step >= 0 &&
      body.step <= 4
        ? body.step
        : 0;
    const answers = sanitizeOnboardingAnswers(body.industry, body?.answers);
    const businessSubtype =
      body.industry === 'real_estate_construction' &&
      typeof answers.business_subtype === 'string'
        ? (answers.business_subtype as BusinessSubtype)
        : null;

    const { error } = await ctx.supabase
      .from('accounts')
      .update({
        industry: body.industry,
        business_subtype: businessSubtype,
        onboarding_answers: { ...answers, _draft_step: step },
      })
      .eq('id', ctx.accountId)
      .eq('onboarding_completed', false);
    if (error) throw error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      industry?: unknown;
      answers?: unknown;
    } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: 'Ingresa un nombre de empresa válido' },
        { status: 400 }
      );
    }
    if (!isActiveIndustry(body?.industry)) {
      return NextResponse.json(
        { error: 'Selecciona un sector disponible' },
        { status: 400 }
      );
    }
    const answers = sanitizeOnboardingAnswers(body.industry, body?.answers);
    const validation = validateOnboardingAnswers(body.industry, answers);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Completa todas las preguntas antes de continuar' },
        { status: 400 }
      );
    }
    const businessSubtype =
      body.industry === 'real_estate_construction'
        ? (answers.business_subtype as BusinessSubtype)
        : null;

    const { data, error } = await ctx.supabase
      .from('accounts')
      .update({
        name,
        industry: body.industry,
        business_subtype: businessSubtype,
        onboarding_answers: answers,
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', ctx.accountId)
      .eq('onboarding_completed', false)
      .select('id, name, industry, business_subtype, logo_url')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: current } = await ctx.supabase
        .from('accounts')
        .select('id, name, industry, business_subtype, logo_url')
        .eq('id', ctx.accountId)
        .single();
      return NextResponse.json({ account: current, alreadyCompleted: true });
    }
    return NextResponse.json({ account: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
