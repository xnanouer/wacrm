'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  FileQuestion,
  MessageCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import {
  NexoraSupportCalendar,
  type NexoraCalendarBooking,
} from '@/components/platform/nexora-support-calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  sender_type: string;
  content: string;
  created_at: string;
}
interface Conversation {
  id: string;
  user_id: string;
  account_id: string;
  status: string;
  current_path: string;
  feedback: string | null;
  created_at: string;
  updated_at: string;
  platform_support_messages: Message[];
}
interface Ticket {
  id: string;
  conversation_id: string;
  user_id: string;
  account_id: string;
  title: string;
  summary: string;
  priority: string;
  status: string;
  current_path: string;
  created_at: string;
}
interface Document {
  id: string;
  title: string;
  category: string;
  content: string;
  status: string;
  updated_at: string;
}
interface SettingsData {
  timezone: string;
  meeting_duration_minutes: number;
  minimum_notice_minutes: number;
  buffer_minutes: number;
  max_meetings_per_day: number;
  availability: Record<string, Array<[string, string]>>;
  blocked_dates: string[];
  google_account_email: string | null;
  connected_at: string | null;
}
interface Overview {
  conversations: Conversation[];
  tickets: Ticket[];
  bookings: NexoraCalendarBooking[];
  documents: Document[];
  settings: SettingsData;
  statistics: Record<string, number>;
  profiles: Array<{ user_id: string; full_name: string | null; email: string }>;
  accounts: Array<{ id: string; name: string; plan_code: string }>;
}

const EMPTY: Overview = {
  conversations: [],
  tickets: [],
  bookings: [],
  documents: [],
  settings: {
    timezone: 'America/Santiago',
    meeting_duration_minutes: 30,
    minimum_notice_minutes: 120,
    buffer_minutes: 15,
    max_meetings_per_day: 6,
    availability: {},
    blocked_dates: [],
    google_account_email: null,
    connected_at: null,
  },
  statistics: {},
  profiles: [],
  accounts: [],
};

const DAYS = [
  ['1', 'Lunes'],
  ['2', 'Martes'],
  ['3', 'Miércoles'],
  ['4', 'Jueves'],
  ['5', 'Viernes'],
  ['6', 'Sábado'],
  ['0', 'Domingo'],
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PlatformSupport() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [reply, setReply] = useState('');
  const [doc, setDoc] = useState({
    id: '',
    title: '',
    category: 'Primeros pasos',
    content: '',
    status: 'draft',
  });
  const [settings, setSettings] = useState(EMPTY.settings);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/platform/support/overview', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('No se pudo cargar Soporte Nexora.');
      const payload = (await response.json()) as Overview;
      setData(payload);
      setSettings(payload.settings);
      setSelectedConversation(
        (current) => current ?? payload.conversations[0]?.id ?? null
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(
    () => new Map(data.profiles.map((item) => [item.user_id, item])),
    [data.profiles]
  );
  const companies = useMemo(
    () => new Map(data.accounts.map((item) => [item.id, item])),
    [data.accounts]
  );
  const selected =
    data.conversations.find((item) => item.id === selectedConversation) ?? null;

  async function action(payload: Record<string, unknown>) {
    const response = await fetch('/api/platform/support/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar.');
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    try {
      await action({
        action: 'reply',
        conversationId: selected.id,
        content: reply,
      });
      setReply('');
      toast.success('Respuesta enviada dentro de Nexora.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo responder.'
      );
    }
  }

  async function updateTicket(
    ticket: Ticket,
    next: Partial<Pick<Ticket, 'status' | 'priority'>>
  ) {
    try {
      await action({
        action: 'ticket',
        ticketId: ticket.id,
        status: next.status ?? ticket.status,
        priority: next.priority ?? ticket.priority,
      });
      toast.success('Caso actualizado.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar.'
      );
    }
  }

  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/platform/support/knowledge', {
      method: doc.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return toast.error(result.error ?? 'No se pudo guardar el documento.');
    toast.success(
      doc.id
        ? 'Documento actualizado e indexado.'
        : 'Documento creado e indexado.'
    );
    setDoc({
      id: '',
      title: '',
      category: 'Primeros pasos',
      content: '',
      status: 'draft',
    });
    await load();
  }

  async function removeDocument(id: string) {
    if (!window.confirm('¿Eliminar este documento global?')) return;
    const response = await fetch(
      `/api/platform/support/knowledge?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) return toast.error('No se pudo eliminar.');
    toast.success('Documento eliminado.');
    await load();
  }

  async function reindexDocument(id: string) {
    const response = await fetch('/api/platform/support/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return toast.error(result.error ?? 'No se pudo reindexar.');
    toast.success('Documento reindexado.');
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/platform/support/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error ?? 'No se pudo guardar.');
    toast.success('Disponibilidad guardada.');
    await load();
  }

  const stats = [
    [
      'Conversaciones',
      data.statistics.conversations_started ?? 0,
      MessageCircle,
    ],
    ['Resueltas por IA', data.statistics.resolved_by_ai ?? 0, Bot],
    ['Escaladas', data.statistics.escalated ?? 0, ShieldCheck],
    ['Reuniones', data.statistics.meetings_booked ?? 0, CalendarDays],
  ] as const;

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/90 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1680px] items-center justify-between px-4 sm:px-7">
          <div className="flex items-center gap-4">
            <BrandLockup compact />
            <span className="text-muted-foreground hidden text-sm sm:block">
              Soporte Nexora
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn(loading && 'animate-spin')} /> Actualizar
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/platform" />}
            >
              <ArrowLeft /> Plataforma
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1680px] space-y-6 p-4 sm:p-7">
        <div>
          <p className="text-primary text-xs font-bold tracking-[.16em] uppercase">
            Soporte oficial
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Soporte Nexora
          </h1>
          <p className="text-muted-foreground mt-2">
            Conversaciones, casos, reuniones y conocimiento global sin mezclar
            datos comerciales de las empresas.
          </p>
        </div>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([label, value, Icon]) => (
            <article key={label} className="surface-elevated rounded-2xl p-5">
              <Icon className="text-primary mb-4 size-5" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-muted-foreground text-sm">{label}</p>
            </article>
          ))}
        </section>
        <Tabs defaultValue="conversations">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="conversations">Conversaciones</TabsTrigger>
            <TabsTrigger value="cases">Casos escalados</TabsTrigger>
            <TabsTrigger value="meetings">Calendario Nexora</TabsTrigger>
            <TabsTrigger value="knowledge">Base de conocimiento</TabsTrigger>
            <TabsTrigger value="faq">Problemas frecuentes</TabsTrigger>
            <TabsTrigger value="settings">Configuración</TabsTrigger>
          </TabsList>
          <TabsContent
            value="conversations"
            className="grid gap-4 lg:grid-cols-[360px_1fr]"
          >
            <div className="surface-elevated max-h-[720px] overflow-y-auto rounded-2xl p-2">
              {data.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversation(conversation.id)}
                  className={cn(
                    'w-full rounded-xl p-3 text-left',
                    selectedConversation === conversation.id
                      ? 'bg-primary/12'
                      : 'hover:bg-muted'
                  )}
                >
                  <p className="font-semibold">
                    {people.get(conversation.user_id)?.full_name ?? 'Usuario'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {companies.get(conversation.account_id)?.name ?? 'Empresa'}{' '}
                    · {conversation.status}
                  </p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {conversation.platform_support_messages.at(-1)?.content ??
                      'Sin mensajes'}
                  </p>
                </button>
              ))}
            </div>
            <div className="surface-elevated flex min-h-[620px] flex-col rounded-2xl">
              {selected ? (
                <>
                  <div className="border-border border-b p-4">
                    <p className="font-semibold">
                      {people.get(selected.user_id)?.full_name} ·{' '}
                      {companies.get(selected.account_id)?.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {selected.current_path} · {selected.status}
                    </p>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {[...selected.platform_support_messages]
                      .sort(
                        (a, b) =>
                          +new Date(a.created_at) - +new Date(b.created_at)
                      )
                      .map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'max-w-[85%] rounded-2xl p-3',
                            message.sender_type === 'user'
                              ? 'bg-muted'
                              : message.sender_type === 'creator'
                                ? 'ml-auto bg-emerald-500/10'
                                : 'bg-primary/10 ml-auto'
                          )}
                        >
                          <p className="text-[10px] font-bold uppercase">
                            {message.sender_type}
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>
                      ))}
                  </div>
                  <form
                    onSubmit={sendReply}
                    className="border-border flex gap-2 border-t p-4"
                  >
                    <Input
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Responder como creador..."
                    />
                    <Button type="submit">Enviar</Button>
                  </form>
                </>
              ) : (
                <p className="text-muted-foreground m-auto">
                  Selecciona una conversación.
                </p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="cases">
            <div className="surface-elevated overflow-x-auto rounded-2xl">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-4">Prioridad</th>
                    <th className="p-4">Usuario / empresa</th>
                    <th className="p-4">Asunto</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {data.tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="p-4">
                        <select
                          aria-label={`Prioridad de ${ticket.title}`}
                          value={ticket.priority}
                          onChange={(event) =>
                            void updateTicket(ticket, {
                              priority: event.target.value,
                            })
                          }
                          className="border-input bg-background h-9 rounded-lg border px-2 capitalize"
                        >
                          <option value="low">Baja</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <p>{people.get(ticket.user_id)?.full_name}</p>
                        <p className="text-muted-foreground text-xs">
                          {companies.get(ticket.account_id)?.name}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold">{ticket.title}</p>
                        <p className="text-muted-foreground max-w-lg truncate text-xs">
                          {ticket.summary}
                        </p>
                      </td>
                      <td className="p-4">
                        <select
                          aria-label={`Estado de ${ticket.title}`}
                          value={ticket.status}
                          onChange={(event) =>
                            void updateTicket(ticket, {
                              status: event.target.value,
                            })
                          }
                          className="border-input bg-background h-9 rounded-lg border px-2"
                        >
                          <option value="open">Abierto</option>
                          <option value="in_progress">En proceso</option>
                          <option value="waiting_user">
                            Esperando usuario
                          </option>
                          <option value="resolved">Resuelto</option>
                          <option value="closed">Cerrado</option>
                        </select>
                      </td>
                      <td className="p-4 text-xs">
                        {formatDate(ticket.created_at)}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedConversation(ticket.conversation_id);
                              document
                                .querySelector<HTMLElement>(
                                  '[data-value=conversations]'
                                )
                                ?.click();
                            }}
                          >
                            Abrir
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              void updateTicket(ticket, { status: 'resolved' })
                            }
                          >
                            <CheckCircle2 /> Resolver
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="meetings">
            <NexoraSupportCalendar
              bookings={data.bookings}
              accounts={data.accounts}
              onRefresh={load}
            />
          </TabsContent>
          <TabsContent
            value="knowledge"
            className="grid gap-4 xl:grid-cols-[1fr_420px]"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {data.documents.map((item) => (
                <article
                  key={item.id}
                  className="surface-elevated rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between">
                    <BookOpen className="text-primary size-5" />
                    <span className="bg-muted rounded-full px-2 py-1 text-xs">
                      {item.status}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {item.category} · {formatDate(item.updated_at)}
                  </p>
                  <p className="text-muted-foreground mt-3 line-clamp-4 text-sm">
                    {item.content}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDoc(item)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void reindexDocument(item.id)}
                    >
                      <RefreshCw /> Reindexar
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      onClick={() => void removeDocument(item.id)}
                      aria-label="Eliminar"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            <form
              onSubmit={saveDocument}
              className="surface-elevated sticky top-24 space-y-4 self-start rounded-2xl p-5"
            >
              <h3 className="font-semibold">
                {doc.id ? 'Editar documento' : 'Nuevo documento'}
              </h3>
              <Input
                value={doc.title}
                onChange={(event) =>
                  setDoc({ ...doc, title: event.target.value })
                }
                placeholder="Título"
              />
              <Input
                value={doc.category}
                onChange={(event) =>
                  setDoc({ ...doc, category: event.target.value })
                }
                placeholder="Categoría"
              />
              <Textarea
                value={doc.content}
                onChange={(event) =>
                  setDoc({ ...doc, content: event.target.value })
                }
                placeholder="Contenido verificable de ayuda..."
                className="min-h-64"
              />
              <select
                value={doc.status}
                onChange={(event) =>
                  setDoc({ ...doc, status: event.target.value })
                }
                className="border-input bg-background h-10 w-full rounded-lg border px-3"
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="archived">Archivado</option>
              </select>
              <Button className="w-full" type="submit">
                <Save /> Guardar e indexar
              </Button>
              {doc.id && (
                <Button
                  className="w-full"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDoc({
                      id: '',
                      title: '',
                      category: 'Primeros pasos',
                      content: '',
                      status: 'draft',
                    })
                  }
                >
                  Cancelar edición
                </Button>
              )}
            </form>
          </TabsContent>
          <TabsContent value="faq">
            <div className="grid gap-3 md:grid-cols-2">
              {data.documents
                .filter((item) => /frecuente|faq|error/i.test(item.category))
                .map((item) => (
                  <article
                    key={item.id}
                    className="surface-elevated rounded-2xl p-5"
                  >
                    <FileQuestion className="text-primary size-5" />
                    <h3 className="mt-3 font-semibold">{item.title}</h3>
                    <p className="text-muted-foreground mt-2 line-clamp-5 text-sm">
                      {item.content}
                    </p>
                  </article>
                ))}
            </div>
          </TabsContent>
          <TabsContent value="settings">
            <form
              onSubmit={saveSettings}
              className="surface-elevated max-w-4xl space-y-6 rounded-2xl p-6"
            >
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Settings className="text-primary size-5" /> Disponibilidad de
                  soporte
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Estos horarios alimentan el Calendario Nexora. Google puede
                  agregarse como sincronización opcional.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  Días y horarios disponibles
                </p>
                {DAYS.map(([key, label]) => {
                  const range = settings.availability[key]?.[0];
                  return (
                    <div
                      key={key}
                      className="border-border grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[140px_1fr_1fr]"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(range)}
                          onChange={(event) => {
                            const availability = {
                              ...settings.availability,
                            };
                            if (event.target.checked)
                              availability[key] = [['09:00', '18:00']];
                            else delete availability[key];
                            setSettings({ ...settings, availability });
                          }}
                        />
                        {label}
                      </label>
                      <Input
                        type="time"
                        disabled={!range}
                        value={range?.[0] ?? '09:00'}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            availability: {
                              ...settings.availability,
                              [key]: [
                                [event.target.value, range?.[1] ?? '18:00'],
                              ],
                            },
                          })
                        }
                      />
                      <Input
                        type="time"
                        disabled={!range}
                        value={range?.[1] ?? '18:00'}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            availability: {
                              ...settings.availability,
                              [key]: [
                                [range?.[0] ?? '09:00', event.target.value],
                              ],
                            },
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  Zona horaria
                  <Input
                    value={settings.timezone}
                    onChange={(event) =>
                      setSettings({ ...settings, timezone: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Duración (minutos)
                  <Input
                    type="number"
                    value={settings.meeting_duration_minutes}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        meeting_duration_minutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Anticipación mínima (minutos)
                  <Input
                    type="number"
                    value={settings.minimum_notice_minutes}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        minimum_notice_minutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Separación entre reuniones
                  <Input
                    type="number"
                    value={settings.buffer_minutes}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        buffer_minutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Máximo por día
                  <Input
                    type="number"
                    value={settings.max_meetings_per_day}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        max_meetings_per_day: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Fechas bloqueadas (AAAA-MM-DD, separadas por coma)
                  <Input
                    value={settings.blocked_dates.join(', ')}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        blocked_dates: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <div className="border-border rounded-2xl border p-4">
                <p className="font-semibold">
                  Sincronización opcional con Google Calendar
                </p>
                {settings.connected_at ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-emerald-500">
                      Conectado como{' '}
                      {settings.google_account_email ?? 'cuenta autorizada'}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await fetch('/api/platform/support/settings', {
                          method: 'DELETE',
                        });
                        await load();
                      }}
                    >
                      Desconectar
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-muted-foreground mb-3 text-sm">
                      Nexora puede confirmar y administrar reuniones sin Google.
                      Conéctalo solamente si también quieres eventos,
                      invitaciones y Google Meet.
                    </p>
                    <Button
                      type="button"
                      nativeButton={false}
                      render={
                        <a href="/api/platform/support/calendar/connect" />
                      }
                    >
                      <CalendarDays /> Conectar Google Calendar
                    </Button>
                  </div>
                )}
              </div>
              <Button type="submit">
                <Save /> Guardar disponibilidad
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
