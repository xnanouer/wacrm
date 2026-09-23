'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  MotivationalAudience,
  MotivationalCategory,
  MotivationalIndustry,
  MotivationalQuote,
} from '@/lib/motivational-quotes';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<MotivationalCategory, string> = {
  general: 'General',
  sales: 'Ventas',
  customer_service: 'Atención al cliente',
  leadership: 'Liderazgo',
};
const INDUSTRY_LABEL: Record<MotivationalIndustry, string> = {
  automotive: 'Automotora',
  real_estate_construction: 'Inmobiliaria y construcción',
};
const AUDIENCE_LABEL: Record<MotivationalAudience, string> = {
  all: 'Todos',
  admins: 'Administradores',
  agents: 'Agentes',
};

type QuoteForm = {
  id?: string;
  text: string;
  author: string;
  category: MotivationalCategory;
  industry: MotivationalIndustry | '';
  audience: MotivationalAudience;
  isActive: boolean;
};

const EMPTY_FORM: QuoteForm = {
  text: '',
  author: '',
  category: 'general',
  industry: '',
  audience: 'all',
  isActive: true,
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function splitCsvLine(line: string, delimiter = ',') {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

function normalizeCategory(value: string): MotivationalCategory {
  const item = normalize(value);
  if (['ventas', 'sales'].includes(item)) return 'sales';
  if (['atencion', 'atencion al cliente', 'customer_service'].includes(item))
    return 'customer_service';
  if (['liderazgo', 'leadership'].includes(item)) return 'leadership';
  return 'general';
}

function normalizeIndustry(value: string): MotivationalIndustry | '' {
  const item = normalize(value);
  if (['automotora', 'automotive'].includes(item)) return 'automotive';
  if (
    ['inmobiliaria', 'constructora', 'real_estate_construction'].includes(item)
  )
    return 'real_estate_construction';
  return '';
}

function normalizeAudience(value: string): MotivationalAudience {
  const item = normalize(value);
  if (['administradores', 'admins'].includes(item)) return 'admins';
  if (['agentes', 'agents'].includes(item)) return 'agents';
  return 'all';
}

function FormSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="border-input bg-card h-12 w-full rounded-xl border px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function MotivationalQuotesManager({
  initialQuotes,
}: {
  initialQuotes: MotivationalQuote[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [form, setForm] = useState<QuoteForm>(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return quotes;
    return quotes.filter((quote) =>
      normalize(
        [
          quote.text,
          quote.author ?? '',
          CATEGORY_LABEL[quote.category],
          quote.industry ? INDUSTRY_LABEL[quote.industry] : 'General',
        ].join(' ')
      ).includes(needle)
    );
  }, [query, quotes]);

  async function reload() {
    const response = await fetch('/api/platform/motivational-quotes', {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      quotes?: MotivationalQuote[];
      error?: string;
    };
    if (!response.ok)
      throw new Error(data.error ?? 'No se pudieron cargar las frases.');
    setQuotes(data.quotes ?? []);
  }

  async function saveForm() {
    if (form.text.trim().length < 8) {
      toast.error('Escribe una frase de al menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/platform/motivational-quotes', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, industry: form.industry || null }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'No se pudo guardar la frase.');
      await reload();
      setForm(EMPTY_FORM);
      toast.success(form.id ? 'Frase actualizada.' : 'Frase agregada.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleQuote(quote: MotivationalQuote) {
    const response = await fetch('/api/platform/motivational-quotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: quote.id,
        text: quote.text,
        author: quote.author ?? '',
        category: quote.category,
        industry: quote.industry,
        audience: quote.audience,
        isActive: !quote.isActive,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      toast.error(data.error ?? 'No se pudo cambiar el estado.');
      return;
    }
    await reload();
  }

  async function deleteQuote(id: string) {
    if (
      !window.confirm(
        '¿Eliminar esta frase? Las asignaciones históricas se conservarán.'
      )
    )
      return;
    const response = await fetch(
      `/api/platform/motivational-quotes?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      toast.error(data.error ?? 'No se pudo eliminar.');
      return;
    }
    await reload();
    toast.success('Frase eliminada.');
  }

  async function importCsv(file: File) {
    const lines = (await file.text())
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (lines.length < 2) return toast.error('El CSV no contiene frases.');
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = splitCsvLine(lines[0], delimiter).map((item) =>
      normalize(item)
    );
    const indexOf = (...names: string[]) =>
      headers.findIndex((header) => names.includes(header));
    const textIndex = indexOf('frase', 'texto', 'text');
    if (textIndex < 0)
      return toast.error('El CSV debe incluir la columna “frase”.');
    const authorIndex = indexOf('autor', 'author');
    const categoryIndex = indexOf('categoria', 'category');
    const industryIndex = indexOf('rubro', 'industria', 'industry');
    const audienceIndex = indexOf('audiencia', 'audience');
    const imported = lines
      .slice(1)
      .map((line) => splitCsvLine(line, delimiter))
      .filter((row) => row[textIndex]?.trim())
      .map((row) => ({
        text: row[textIndex].trim(),
        author: authorIndex >= 0 ? (row[authorIndex] ?? '') : '',
        category:
          categoryIndex >= 0
            ? normalizeCategory(row[categoryIndex] ?? '')
            : 'general',
        industry:
          industryIndex >= 0
            ? normalizeIndustry(row[industryIndex] ?? '') || null
            : null,
        audience:
          audienceIndex >= 0
            ? normalizeAudience(row[audienceIndex] ?? '')
            : 'all',
        isActive: true,
      }));
    if (!imported.length || imported.length > 500)
      return toast.error('El archivo debe contener entre 1 y 500 frases.');
    setSaving(true);
    try {
      const response = await fetch('/api/platform/motivational-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotes: imported }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? 'No se pudo importar el archivo.');
      await reload();
      toast.success(`${imported.length} frases importadas.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo importar.'
      );
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1580px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLockup compact />
          <Link
            href="/platform"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft /> Volver a empresas
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1580px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        <section className="border-primary/20 bg-primary/5 relative overflow-hidden rounded-3xl border p-6 sm:p-8">
          <Sparkles className="text-primary mb-4 size-7" />
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Frases diarias
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl leading-7">
            Administra el catálogo motivacional global. Nexora prioriza el rubro
            de cada empresa y completa la selección con frases generales.
          </p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="surface-elevated h-fit rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-foreground text-lg font-bold">
                  {form.id ? 'Editar frase' : 'Agregar frase'}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Define dónde y para quién puede aparecer.
                </p>
              </div>
              {form.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm(EMPTY_FORM)}
                >
                  Cancelar
                </Button>
              )}
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quote-text">Frase</Label>
                <Textarea
                  id="quote-text"
                  value={form.text}
                  maxLength={500}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      text: event.target.value,
                    }))
                  }
                  placeholder="Cada conversación bien atendida puede convertirse en una oportunidad."
                />
                <p className="text-muted-foreground text-right text-xs">
                  {form.text.length}/500
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-author">Autor opcional</Label>
                <Input
                  id="quote-author"
                  value={form.author}
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      author: event.target.value,
                    }))
                  }
                  placeholder="Nexora"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  id="quote-category"
                  label="Categoría"
                  value={form.category}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      category: value as MotivationalCategory,
                    }))
                  }
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </FormSelect>
                <FormSelect
                  id="quote-industry"
                  label="Rubro"
                  value={form.industry}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      industry: value as MotivationalIndustry | '',
                    }))
                  }
                >
                  <option value="">Todos / general</option>
                  {Object.entries(INDUSTRY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </FormSelect>
              </div>
              <FormSelect
                id="quote-audience"
                label="Audiencia"
                value={form.audience}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    audience: value as MotivationalAudience,
                  }))
                }
              >
                {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </FormSelect>
              <div className="border-border flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold">Activa</p>
                  <p className="text-muted-foreground text-xs">
                    Participará en las próximas selecciones.
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(value) =>
                    setForm((current) => ({ ...current, isActive: value }))
                  }
                />
              </div>
              <Button className="w-full" disabled={saving} onClick={saveForm}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : form.id ? (
                  <Pencil className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {form.id ? 'Guardar cambios' : 'Agregar frase'}
              </Button>
            </div>
            <div className="border-border mt-6 border-t pt-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv(file);
                }}
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp /> Importar lista CSV
              </Button>
              <p className="text-muted-foreground mt-2 text-xs leading-5">
                Columnas: frase, autor, categoría, rubro y audiencia. Máximo 500
                filas por carga.
              </p>
            </div>
          </section>

          <section className="surface-elevated rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-foreground text-lg font-bold">
                  Catálogo de frases
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {quotes.filter((quote) => quote.isActive).length} activas de{' '}
                  {quotes.length}
                </p>
              </div>
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar frase..."
                  className="pl-9 sm:w-72"
                />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {filtered.map((quote) => (
                <article
                  key={quote.id}
                  className={cn(
                    'border-border rounded-2xl border p-4 transition-opacity',
                    !quote.isActive && 'opacity-55'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Quote className="text-primary mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground leading-6 font-medium">
                        “{quote.text}”
                      </p>
                      {quote.author && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          — {quote.author}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 font-semibold">
                          {CATEGORY_LABEL[quote.category]}
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1">
                          {quote.industry
                            ? INDUSTRY_LABEL[quote.industry]
                            : 'Todos los rubros'}
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1">
                          {AUDIENCE_LABEL[quote.audience]}
                        </span>
                      </div>
                    </div>
                    <Switch
                      checked={quote.isActive}
                      onCheckedChange={() => void toggleQuote(quote)}
                      aria-label={
                        quote.isActive ? 'Desactivar frase' : 'Activar frase'
                      }
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm({
                          id: quote.id,
                          text: quote.text,
                          author: quote.author ?? '',
                          category: quote.category,
                          industry: quote.industry ?? '',
                          audience: quote.audience,
                          isActive: quote.isActive,
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Pencil /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void deleteQuote(quote.id)}
                    >
                      <Trash2 /> Eliminar
                    </Button>
                  </div>
                </article>
              ))}
              {!filtered.length && (
                <div className="border-border flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
                  <Quote className="text-muted-foreground size-7" />
                  <p className="text-muted-foreground mt-3 text-sm">
                    No encontramos frases con ese filtro.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
