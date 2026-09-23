'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CarFront,
  Check,
  HeartPulse,
  Hotel,
  Loader2,
  LockKeyhole,
  Store,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { BrandLockup } from '@/components/brand/brand-mark';
import { CompanyLogoPicker } from '@/components/account/company-logo-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  INDUSTRY_CONFIGS,
  getIndustryConfig,
  isActiveIndustry,
  sanitizeOnboardingAnswers,
  type ActiveIndustry,
  type IndustryQuestion,
  type OnboardingAnswers,
} from '@/lib/industries/config';

const ICONS = {
  car: CarFront,
  building: Building2,
  utensils: UtensilsCrossed,
  health: HeartPulse,
  store: Store,
  hotel: Hotel,
  tools: Wrench,
  briefcase: BriefcaseBusiness,
} as const;

const STEP_LABELS = [
  'Tu sector',
  'Tu negocio',
  'Tu operación',
  'Identidad',
  'Todo listo',
] as const;

function questionComplete(
  question: IndustryQuestion,
  answers: OnboardingAnswers
) {
  const value = answers[question.id];
  return question.type === 'multiple'
    ? Array.isArray(value) && value.length > 0
    : typeof value === 'string' && value.length > 0;
}

export function OnboardingWizard({
  accountId,
  initialName,
  initialLogoUrl,
  initialIndustry,
  initialAnswers,
  previewMode = false,
}: {
  accountId: string;
  initialName: string;
  initialLogoUrl: string | null;
  initialIndustry: string | null;
  initialAnswers: Record<string, unknown>;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const initialActiveIndustry = isActiveIndustry(initialIndustry)
    ? initialIndustry
    : null;
  const draftStep = Number(initialAnswers._draft_step);
  const [step, setStep] = useState(
    Number.isInteger(draftStep) && draftStep >= 0 && draftStep <= 3
      ? draftStep
      : 0
  );
  const [industry, setIndustry] = useState<ActiveIndustry | null>(
    initialActiveIndustry
  );
  const [answers, setAnswers] = useState<OnboardingAnswers>(() =>
    initialActiveIndustry
      ? sanitizeOnboardingAnswers(initialActiveIndustry, initialAnswers)
      : {}
  );
  const [companyName, setCompanyName] = useState(initialName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const storageKey = previewMode
    ? `nexora-onboarding-preview:${accountId}`
    : `nexora-onboarding:${accountId}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        industry?: unknown;
        answers?: unknown;
        name?: unknown;
        step?: unknown;
      };
      if (isActiveIndustry(parsed.industry)) {
        setIndustry(parsed.industry);
        setAnswers(sanitizeOnboardingAnswers(parsed.industry, parsed.answers));
      }
      if (typeof parsed.name === 'string') setCompanyName(parsed.name);
      if (
        typeof parsed.step === 'number' &&
        Number.isInteger(parsed.step) &&
        parsed.step >= 0 &&
        parsed.step <= 3
      )
        setStep(parsed.step);
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!industry) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ industry, answers, name: companyName, step })
    );
  }, [answers, companyName, industry, step, storageKey]);

  const config = industry ? getIndustryConfig(industry) : null;
  const businessQuestions = useMemo(
    () =>
      config?.questions.filter((question) => question.group === 'business') ??
      [],
    [config]
  );
  const operationQuestions = useMemo(
    () =>
      config?.questions.filter((question) => question.group === 'operation') ??
      [],
    [config]
  );
  const currentQuestions = step === 1 ? businessQuestions : operationQuestions;
  const canContinue =
    step === 0
      ? Boolean(industry)
      : step === 1 || step === 2
        ? currentQuestions.every((question) =>
            questionComplete(question, answers)
          )
        : step === 3
          ? companyName.trim().length > 0 && companyName.trim().length <= 80
          : true;

  function chooseIndustry(next: ActiveIndustry) {
    if (next !== industry) {
      setIndustry(next);
      setAnswers({});
      setStep(0);
    }
  }

  function setAnswer(question: IndustryQuestion, value: string) {
    setAnswers((current) => {
      if (question.type === 'single')
        return { ...current, [question.id]: value };
      const selected = Array.isArray(current[question.id])
        ? (current[question.id] as string[])
        : [];
      return {
        ...current,
        [question.id]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
  }

  async function saveDraft(nextStep: number) {
    if (!industry) return;
    if (previewMode) return;
    setSavingDraft(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, answers, step: nextStep }),
      });
      if (!response.ok) throw new Error();
    } catch {
      toast.error('Guardamos tu avance en este dispositivo', {
        description: 'Nexora volverá a intentar sincronizarlo al continuar.',
      });
    } finally {
      setSavingDraft(false);
    }
  }

  async function next() {
    if (!canContinue || !industry || savingDraft) return;
    const nextStep = Math.min(step + 1, 4);
    await saveDraft(nextStep);
    setStep(nextStep);
  }

  async function finish() {
    if (!industry || finishing) return;
    if (previewMode) {
      localStorage.removeItem(storageKey);
      router.push('/dashboard');
      return;
    }
    setFinishing(true);
    try {
      if (logoFile) {
        const form = new FormData();
        form.set('logo', logoFile);
        const upload = await fetch('/api/account/logo', {
          method: 'POST',
          body: form,
        });
        const uploaded = (await upload.json().catch(() => ({}))) as {
          logoUrl?: string;
          error?: string;
        };
        if (!upload.ok)
          throw new Error(uploaded.error ?? 'No pudimos subir el logo');
        setLogoUrl(uploaded.logoUrl ?? null);
      } else if (removeLogo && logoUrl) {
        const removal = await fetch('/api/account/logo', { method: 'DELETE' });
        if (!removal.ok) throw new Error('No pudimos quitar el logo');
      }

      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim(), industry, answers }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'No pudimos guardar la configuración');
      localStorage.removeItem(storageKey);
      router.push('/dashboard');
    } catch (error) {
      toast.error('No pudimos guardar la configuración', {
        description:
          error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      });
      setFinishing(false);
    }
  }

  return (
    <main className="subtle-grid bg-background min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <BrandLockup className="h-12 w-40" />
          <div className="flex items-center gap-2">
            {previewMode && (
              <span className="border-primary/25 bg-primary/10 text-primary rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase">
                Vista previa · No guarda cambios
              </span>
            )}
            <span className="text-muted-foreground text-xs font-semibold">
              Paso {step + 1} de 5
            </span>
          </div>
        </header>

        <div className="border-border/70 bg-card/85 overflow-hidden rounded-[28px] border shadow-2xl shadow-black/10 backdrop-blur-xl">
          <div className="border-border/70 border-b px-5 py-5 sm:px-8">
            <div className="mb-3 flex gap-1.5">
              {STEP_LABELS.map((label, index) => (
                <div key={label} className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-colors',
                      index <= step ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                  <span
                    className={cn(
                      'mt-2 hidden truncate text-[10px] font-semibold sm:block',
                      index === step ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-7 sm:px-8 sm:py-10 lg:px-12">
            <div className="mx-auto max-w-4xl">
              {step === 0 && (
                <section>
                  <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
                    Empecemos por lo esencial
                  </p>
                  <h1 className="text-foreground mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
                    Configuremos Nexora para tu empresa
                  </h1>
                  <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6 sm:text-base">
                    Cuéntanos un poco sobre tu negocio para adaptar tu espacio
                    de trabajo.
                  </p>
                  <h2 className="text-foreground mt-8 text-lg font-semibold">
                    ¿A qué sector pertenece tu empresa?
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Esto nos ayudará a preparar Nexora para tu forma de
                    trabajar.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {INDUSTRY_CONFIGS.map((item) => {
                      const Icon = ICONS[item.icon];
                      const active = industry === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={!item.enabled}
                          onClick={() =>
                            item.enabled &&
                            chooseIndustry(item.id as ActiveIndustry)
                          }
                          className={cn(
                            'relative flex min-h-36 items-start gap-4 rounded-2xl border p-5 text-left transition-all',
                            item.enabled
                              ? 'border-border bg-background/55 hover:border-primary/45 hover:-translate-y-0.5'
                              : 'border-border/50 bg-muted/20 cursor-not-allowed opacity-50',
                            active &&
                              'border-primary bg-primary/8 ring-primary/20 ring-2'
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-11 shrink-0 items-center justify-center rounded-xl',
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-primary/10 text-primary'
                            )}
                          >
                            <Icon className="size-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="text-foreground flex flex-wrap items-center gap-2 font-semibold">
                              {item.label}
                              {!item.enabled && (
                                <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase">
                                  <LockKeyhole className="size-2.5" />
                                  Próximamente
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground mt-2 block text-xs leading-5">
                              {item.description}
                            </span>
                          </span>
                          {active && (
                            <span className="bg-primary text-primary-foreground absolute top-3 right-3 flex size-5 items-center justify-center rounded-full">
                              <Check className="size-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {(step === 1 || step === 2) && config && (
                <section>
                  <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
                    {step === 1
                      ? 'Conozcamos tu negocio'
                      : 'Preparemos tu operación'}
                  </p>
                  <h1 className="text-foreground mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
                    {step === 1
                      ? `Cuéntanos sobre ${config.shortLabel}`
                      : '¿Cómo quieres trabajar con Nexora?'}
                  </h1>
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    Puedes cambiar estas preferencias más adelante. No
                    eliminaremos información de tu empresa.
                  </p>
                  <div className="mt-8 space-y-8">
                    {currentQuestions.map((question) => (
                      <div key={question.id}>
                        <h2 className="text-foreground font-semibold">
                          {question.title}
                        </h2>
                        {question.type === 'multiple' && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            Puedes seleccionar más de una opción.
                          </p>
                        )}
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {question.options.map((option) => {
                            const value = answers[question.id];
                            const selected = Array.isArray(value)
                              ? value.includes(option.value)
                              : value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setAnswer(question, option.value)
                                }
                                className={cn(
                                  'border-border bg-background/50 hover:border-primary/40 flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                                  selected &&
                                    'border-primary bg-primary/8 text-primary ring-primary/15 ring-1'
                                )}
                              >
                                <span
                                  className={cn(
                                    'border-border flex size-5 shrink-0 items-center justify-center rounded-full border',
                                    selected &&
                                      'border-primary bg-primary text-primary-foreground'
                                  )}
                                >
                                  {selected && <Check className="size-3" />}
                                </span>
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {step === 3 && (
                <section>
                  <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
                    Tu identidad
                  </p>
                  <h1 className="text-foreground mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
                    Ahora dale identidad a tu espacio
                  </h1>
                  <p className="text-muted-foreground mt-3 text-sm leading-6">
                    Esta información representará a tu empresa dentro de Nexora.
                  </p>
                  <div className="mt-8 grid gap-7 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="space-y-2">
                      <Label htmlFor="onboarding-company-name">
                        Nombre de la empresa
                      </Label>
                      <Input
                        id="onboarding-company-name"
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        placeholder="Ej. Salgado Automotriz"
                        maxLength={80}
                        className="h-12"
                      />
                      <p className="text-muted-foreground text-xs">
                        {companyName.length}/80 caracteres
                      </p>
                    </div>
                    <CompanyLogoPicker
                      file={logoFile}
                      currentUrl={removeLogo ? null : logoUrl}
                      companyName={companyName}
                      disabled={finishing}
                      onChange={(file) => {
                        setLogoFile(file);
                        setRemoveLogo(false);
                      }}
                      onRemove={() => {
                        setLogoFile(null);
                        setRemoveLogo(true);
                      }}
                    />
                  </div>
                </section>
              )}

              {step === 4 && config && (
                <section className="py-4 text-center sm:py-8">
                  <span className="bg-primary/10 text-primary ring-primary/15 mx-auto flex size-20 items-center justify-center rounded-[26px] ring-1">
                    <Check className="size-9" />
                  </span>
                  <p className="text-primary mt-6 text-xs font-bold tracking-[0.18em] uppercase">
                    Configuración completada
                  </p>
                  <h1 className="text-foreground mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
                    Tu espacio está listo 🚀
                  </h1>
                  <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-sm leading-6 sm:text-base">
                    Hemos preparado Nexora para{' '}
                    <span className="text-foreground font-semibold">
                      {companyName.trim()}
                    </span>{' '}
                    como {config.label.toLowerCase()}.
                  </p>
                  <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
                    {[
                      'Sector configurado',
                      'Perfil de empresa creado',
                      'Preferencias comerciales guardadas',
                      'Espacio preparado',
                    ].map((item) => (
                      <div
                        key={item}
                        className="border-border bg-background/55 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
                          <Check className="size-3.5" />
                        </span>
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <footer className="border-border/70 bg-muted/20 flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || finishing}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft className="size-4" />
              Atrás
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                disabled={!canContinue || savingDraft}
                onClick={next}
              >
                {savingDraft && <Loader2 className="size-4 animate-spin" />}
                Continuar
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={finishing}
                onClick={finish}
                className="min-w-40"
              >
                {finishing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {finishing
                  ? 'Preparando...'
                  : previewMode
                    ? 'Volver a Nexora'
                    : 'Entrar a Nexora'}
              </Button>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}
