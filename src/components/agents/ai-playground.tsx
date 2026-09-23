'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CarFront,
  Gauge,
  ImageOff,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
  UserCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CatalogPreview {
  id: string;
  title: string;
  make: string;
  model: string;
  version: string;
  year: number;
  description: string;
  color: string;
  engine: string;
  list_price: number;
  offer_price: number | null;
  displayed_price: number;
  minimum_down_payment: number | null;
  financing_text: string;
  mileage: number;
  fuel: string;
  transmission: string;
  drivetrain: string;
  location: string;
  image_url: string | null;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  handoff?: boolean;
  catalogPreview?: CatalogPreview[];
  details?: {
    tone?: string;
    informationUsed?: string[];
    warnings?: string[];
    pointsEstimated?: number;
    pointsUsed?: number;
  };
}

function clp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function CatalogCard({ item }: { item: CatalogPreview }) {
  const name = `${item.make} ${item.model} ${item.version}`.trim();

  return (
    <div className="border-border bg-background mt-3 overflow-hidden rounded-2xl border shadow-sm">
      {item.image_url ? (
        <a
          href={item.image_url}
          target="_blank"
          rel="noreferrer"
          className="bg-muted block h-44 overflow-hidden"
          aria-label={`Ver fotografía de ${name}`}
        >
          {/* Signed Supabase URLs are already optimized catalog assets. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image_url}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
          />
        </a>
      ) : (
        <div className="bg-muted text-muted-foreground flex h-32 items-center justify-center">
          <ImageOff className="size-7" />
        </div>
      )}
      <div className="space-y-2.5 p-4">
        <div>
          <p className="text-foreground leading-5 font-bold">{name}</p>
          {item.offer_price !== null && (
            <p className="text-muted-foreground mt-1 text-xs line-through">
              Precio lista {clp(item.list_price)}
            </p>
          )}
          <p className="text-primary mt-1 text-base font-extrabold">
            Valor vehículo {clp(item.displayed_price)}
          </p>
          {item.minimum_down_payment !== null && (
            <p className="mt-1 text-sm font-bold text-emerald-600">
              Pie inicial desde {clp(item.minimum_down_payment)}
            </p>
          )}
        </div>
        <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5">
            <CarFront className="size-3.5" /> Año {item.year}
          </span>
          <span className="flex items-center gap-1.5">
            <Gauge className="size-3.5" />
            {item.mileage.toLocaleString('es-CL')} km
          </span>
          <span>{item.transmission}</span>
          <span>
            {item.fuel} · {item.drivetrain}
          </span>
          {item.engine && <span>Motor {item.engine}</span>}
          {item.color && <span>Color {item.color}</span>}
        </div>
        {item.financing_text && (
          <p className="border-border text-muted-foreground border-t pt-2 text-xs leading-5">
            <span className="text-foreground font-semibold">
              Financiamiento:{' '}
            </span>
            {item.financing_text}
          </p>
        )}
        {item.description && (
          <p className="text-muted-foreground text-xs leading-5">
            {item.description}
          </p>
        )}
        {item.location && (
          <p className="text-muted-foreground flex items-center gap-1.5 border-t pt-2 text-xs">
            <MapPin className="size-3.5" /> {item.location}
          </p>
        )}
        <p className="text-[10px] font-semibold tracking-wide text-emerald-600 uppercase">
          Vista previa · no enviado
        </p>
      </div>
    </div>
  );
}

export function AiPlayground({ onGoToSetup }: { onGoToSetup?: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const response = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          messages: next.map((turn) => ({
            role: turn.role,
            content:
              turn.role === 'assistant' && turn.catalogPreview?.length
                ? `${turn.content}\n\n[Catálogo mostrado por Nexora: ${turn.catalogPreview
                    .map(
                      (item, index) =>
                        `${index + 1}. ${item.make} ${item.model} ${item.year}`
                    )
                    .join('; ')}]`
                : turn.content,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? 'No se pudo generar la prueba.');
        setTurns(turns);
        setInput(text);
        return;
      }
      setTurns([
        ...next,
        {
          role: 'assistant',
          content: typeof data.reply === 'string' ? data.reply : '',
          handoff: Boolean(data.handoff),
          catalogPreview: Array.isArray(data.catalog_preview)
            ? data.catalog_preview
            : [],
          details: {
            tone: data.tone,
            informationUsed: data.information_used,
            warnings: data.warnings,
            pointsEstimated: data.points_estimated,
            pointsUsed: data.points_used,
          },
        },
      ]);
    } catch {
      toast.error('No se pudo conectar con el agente.');
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-border bg-card flex h-[68vh] min-h-[540px] flex-col overflow-hidden rounded-3xl border">
      <div className="border-border flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
            <Bot className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Prueba segura</p>
            <p className="text-muted-foreground text-xs">
              No envía mensajes, no modifica datos y no descuenta puntos.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTurns([])}
          disabled={!turns.length || sending}
        >
          <RotateCcw className="mr-1.5 size-3.5" /> Reiniciar
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {!turns.length && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-center text-sm">
            <Bot className="text-primary/60 mb-3 size-10" />
            <p className="text-foreground font-semibold">
              Habla como si fueras un cliente
            </p>
            <p className="mt-1 max-w-md text-xs leading-5">
              Nexora usará el tono, FAQs, reglas y catálogo autorizado de esta
              empresa para preparar una sugerencia.
            </p>
            {onGoToSetup && (
              <Button
                variant="link"
                size="sm"
                onClick={onGoToSetup}
                className="mt-2"
              >
                Ir a la configuración
                <ArrowRight className="ml-1 size-3" />
              </Button>
            )}
          </div>
        )}

        {turns.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className={cn(
              'flex gap-2',
              turn.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {turn.role === 'assistant' && (
              <Bot className="text-primary mt-1 size-5 shrink-0" />
            )}
            <div
              className={cn(
                'max-w-[82%] rounded-2xl px-4 py-3 text-sm',
                turn.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              )}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.role === 'assistant' &&
                turn.catalogPreview?.map((item) => (
                  <CatalogCard key={item.id} item={item} />
                ))}
              {turn.role === 'assistant' && turn.handoff && (
                <p className="border-border/60 mt-2 flex items-center gap-1 border-t pt-2 text-xs text-amber-500">
                  <UserCircle2 className="size-3.5" />
                  Recomendaría intervención humana
                </p>
              )}
              {turn.role === 'assistant' && turn.details && (
                <div className="border-border/60 text-muted-foreground mt-3 space-y-1 border-t pt-2 text-[11px]">
                  <p>
                    Modo: Sugerencia · Tono:{' '}
                    {turn.details.tone || 'configurado'}
                  </p>
                  <p>
                    Información:{' '}
                    {turn.details.informationUsed?.join(', ') ||
                      'configuración del agente'}
                  </p>
                  <p>
                    Puntos: {turn.details.pointsEstimated ?? 1} estimado ·{' '}
                    {turn.details.pointsUsed ?? 0} descontados
                  </p>
                  {turn.details.warnings?.map((warning) => (
                    <p key={warning} className="text-amber-500">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>
            {turn.role === 'user' && (
              <UserCircle2 className="text-muted-foreground mt-1 size-5 shrink-0" />
            )}
          </div>
        ))}

        {sending && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Bot className="text-primary size-5" />
            <Loader2 className="size-4 animate-spin" /> Preparando sugerencia...
          </div>
        )}
      </div>

      <div className="border-border flex items-end gap-2 border-t p-4">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Ejemplo: Hola, busco una camioneta automática..."
          rows={2}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus:border-primary/50 flex-1 resize-none rounded-2xl border px-4 py-3 text-sm outline-none"
        />
        <Button
          onClick={() => void send()}
          disabled={!input.trim() || sending}
          className="size-11 rounded-xl p-0"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
