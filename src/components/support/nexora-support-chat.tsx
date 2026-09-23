'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MessageCircleQuestion,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Sender = 'user' | 'assistant' | 'system' | 'creator';
interface SupportMessage {
  id: string;
  sender_type: Sender;
  content: string;
  metadata?: {
    state?: string;
    suggested_route?: string | null;
    ticket_id?: string | null;
  };
  created_at: string;
}

const WELCOME: SupportMessage = {
  id: 'welcome',
  sender_type: 'assistant',
  content:
    'Hola, soy Nexora Asistente. Puedo ayudarte con conexiones, usuarios, agentes IA, automatizaciones y las demás funciones de la plataforma. ¿Qué necesitas resolver?',
  created_at: new Date(0).toISOString(),
};

interface Props {
  embedded?: boolean;
}

export function NexoraSupportChat({ embedded = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(embedded);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/support/conversations', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.conversations?.[0]) return;
        const conversation = payload.conversations[0];
        setConversationId(conversation.id);
        const loaded = [...(conversation.platform_support_messages ?? [])].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        if (loaded.length) setMessages(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    const optimistic: SupportMessage = {
      id: `local-${Date.now()}`,
      sender_type: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setInput('');
    setSending(true);
    try {
      const response = await fetch('/api/support/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationId,
          currentPath: pathname,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? 'No se pudo consultar al asistente.');
      setConversationId(payload.conversationId);
      setMessages((current) => [...current, payload.message as SupportMessage]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo consultar al asistente.'
      );
      setMessages((current) =>
        current.filter((message) => message.id !== optimistic.id)
      );
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function feedback(value: 'resolved' | 'partial' | 'needs_support') {
    if (!conversationId) return;
    const response = await fetch('/api/support/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: conversationId, feedback: value }),
    });
    if (response.ok) toast.success('Gracias por evaluar la ayuda.');
    else toast.error('No se pudo guardar la evaluación.');
  }

  const body = (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        embedded && 'surface-elevated min-h-[650px] overflow-hidden rounded-3xl'
      )}
    >
      {embedded && (
        <div className="border-border border-b p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="text-primary size-5" /> Nexora Asistente
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Soporte oficial, aislado a los datos de tu empresa.
          </p>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => {
          const own = message.sender_type === 'user';
          return (
            <div
              key={message.id}
              className={cn('flex', own ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6',
                  own
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.metadata?.suggested_route && (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={message.metadata.suggested_route} />}
                  >
                    <ExternalLink /> Abrir pantalla
                  </Button>
                )}
                {message.metadata?.state === 'needs_intervention' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href="/support?book=1" />}
                    >
                      <CalendarDays /> Agendar reunión
                    </Button>
                    <span className="border-border inline-flex items-center rounded-lg border px-2 text-xs">
                      Caso enviado
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Buscando en la
            ayuda y revisando tu cuenta...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-border border-t p-4">
        {conversationId &&
          messages.some(
            (message) =>
              message.sender_type === 'assistant' && message.id !== 'welcome'
          ) && (
            <div className="text-muted-foreground mb-3 flex items-center gap-2 text-xs">
              <span>¿Pude ayudarte?</span>
              <button
                type="button"
                onClick={() => void feedback('resolved')}
                className="hover:text-emerald-500"
                aria-label="Sí, problema resuelto"
              >
                <ThumbsUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => void feedback('partial')}
                className="hover:text-amber-500"
                aria-label="Parcialmente"
              >
                <CheckCircle2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => void feedback('needs_support')}
                className="hover:text-red-500"
                aria-label="Necesito soporte"
              >
                <ThumbsDown className="size-4" />
              </button>
            </div>
          )}
        <form onSubmit={send} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Describe qué necesitas resolver..."
            className="min-h-12 resize-none"
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={sending || !input.trim()}
            aria-label="Enviar"
          >
            <Send />
          </Button>
        </form>
        <p className="text-muted-foreground mt-2 text-[10px]">
          No compartas contraseñas, tokens ni claves API.
        </p>
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Abrir Nexora Asistente"
            className="bg-primary text-primary-foreground shadow-primary/30 fixed right-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-2xl shadow-2xl transition-transform hover:scale-105"
          />
        }
      >
        <MessageCircleQuestion className="size-6" />
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-[480px]">
        <SheetHeader className="border-border border-b pr-12">
          <SheetTitle className="flex items-center gap-2">
            <span className="bg-primary/12 text-primary flex size-9 items-center justify-center rounded-xl">
              <Sparkles className="size-5" />
            </span>
            Nexora Asistente
          </SheetTitle>
          <SheetDescription>Soporte oficial de la plataforma</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
