'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type {
  Contact,
  Conversation,
  CustomField,
  Deal,
  Tag,
  TicketEvent,
  TicketNote,
} from '@/types';
import {
  AtSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronRight,
  Phone,
  Mail,
  Copy,
  Check,
  History,
  ListTree,
  Tag as TagIcon,
  StickyNote,
  UserRound,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { TicketStatusBadge } from './ticket-status-badge';

interface ContactSidebarProps {
  contact: Contact | null;
  conversation: Conversation | null;
}

function ticketEventLabel(event: TicketEvent): string {
  const labels: Record<TicketEvent['event_type'], string> = {
    created: 'Ticket creado',
    accepted: 'Ticket aceptado',
    assigned: 'Ejecutivo asignado',
    unassigned: 'Ticket devuelto a la cola',
    transferred: 'Ticket transferido',
    department_changed: 'Departamento actualizado',
    status_changed: 'Estado actualizado',
    waiting: 'Ticket en espera',
    closed: 'Ticket resuelto',
    reopened: 'Ticket reabierto',
  };
  return labels[event.event_type];
}

export function ContactSidebar({ contact, conversation }: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact || !conversation) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [
      dealsRes,
      tagsRes,
      fieldsRes,
      valuesRes,
      notesResponse,
      eventsResponse,
    ] = await Promise.all([
      supabase
        .from('deals')
        .select('*, stage:pipeline_stages(*)')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_tags')
        .select('id, tag_id, tags(*)')
        .eq('contact_id', contact.id),
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contact.id),
      fetch(`/api/tickets/${conversation.id}/notes`, { cache: 'no-store' }),
      fetch(`/api/tickets/${conversation.id}/events`, { cache: 'no-store' }),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (fieldsRes.data) setCustomFields(fieldsRes.data as CustomField[]);
    if (valuesRes.data) {
      const nextValues: Record<string, string> = {};
      for (const item of valuesRes.data) {
        nextValues[item.custom_field_id] = item.value ?? '';
      }
      setCustomValues(nextValues);
    }
    if (notesResponse.ok) {
      const payload = (await notesResponse.json()) as { notes: TicketNote[] };
      setNotes(payload.notes ?? []);
    }
    if (eventsResponse.ok) {
      const payload = (await eventsResponse.json()) as {
        events: TicketEvent[];
      };
      setEvents(payload.events ?? []);
    }
  }, [contact, conversation]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !conversation || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const response = await fetch(`/api/tickets/${conversation.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newNote.trim() }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload.note) {
      setNotes((prev) => [payload.note as TicketNote, ...prev]);
      setNewNote('');
    }
    setAddingNote(false);
  }, [contact, conversation, newNote, accountId]);

  if (!contact) {
    return (
      <div className="border-border bg-card flex h-full w-80 items-center justify-center border-l xl:w-[22rem]">
        <p className="text-muted-foreground text-sm">
          Selecciona una conversación
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="border-border bg-card flex h-full w-80 flex-col border-l xl:w-[22rem]">
      <div className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            Ficha del cliente
          </h2>
          <p className="text-muted-foreground text-[11px]">
            Contexto comercial y de atención
          </p>
        </div>
        <span className="border-border bg-background text-muted-foreground rounded-full border px-2 py-1 text-[10px]">
          Cliente
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          <div className="border-border bg-background flex items-center gap-3 rounded-xl border p-3">
            <div className="bg-primary-soft text-primary ring-primary/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ring-1">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground truncate text-sm font-semibold">
                {displayName}
              </h3>
              <p className="text-muted-foreground truncate text-xs">
                {contact.company || 'Sin empresa registrada'}
              </p>
              {conversation && (
                <TicketStatusBadge
                  status={conversation.status}
                  compact
                  className="mt-2"
                />
              )}
            </div>
          </div>

          <section className="border-border bg-background rounded-xl border p-3">
            <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
              Datos de contacto
            </h3>
            <button
              onClick={handleCopyPhone}
              className="text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors"
            >
              <Phone className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                {contact.phone}
              </span>
              {copied ? (
                <Check className="text-primary h-3 w-3" />
              ) : (
                <Copy className="text-muted-foreground h-3 w-3" />
              )}
            </button>

            {contact.email && (
              <div className="text-foreground flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
                <Mail className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{contact.email}</span>
              </div>
            )}
            {contact.company && (
              <div className="text-foreground flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
                <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{contact.company}</span>
              </div>
            )}
          </section>

          <section className="border-border bg-background rounded-xl border p-3">
            <h3 className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-wider uppercase">
              Atención actual
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <UserRound className="text-muted-foreground size-4" />
                <span className="text-muted-foreground">Ejecutivo</span>
                <span className="text-foreground ml-auto font-medium">
                  {conversation?.assigned_agent_id ? 'Asignado' : 'Sin asignar'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="text-muted-foreground size-4" />
                <span className="text-muted-foreground">Departamento</span>
                <span className="text-muted-foreground ml-auto">
                  {conversation?.department?.name ?? 'Sin departamento'}
                </span>
              </div>
            </div>
          </section>

          <section className="border-border bg-background rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <TagIcon className="h-3.5 w-3.5" />
              Etiquetas
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="text-muted-foreground px-1 text-xs">
                  Sin etiquetas
                </p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="border-border bg-background rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              Información comercial
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="text-muted-foreground px-1 text-xs">
                  Sin oportunidades activas
                </p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="border-border bg-card rounded-lg border px-3 py-2"
                  >
                    <p className="text-foreground text-sm font-medium">
                      {deal.title}
                    </p>
                    <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                      <span>
                        {deal.currency ?? '$'}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-border mt-3 space-y-2 border-t pt-3 text-xs">
              <div className="flex items-center gap-2">
                <ListTree className="text-muted-foreground size-4" />
                <span className="text-muted-foreground">Etapa del embudo</span>
                <span className="text-foreground ml-auto max-w-28 truncate font-medium">
                  {deals[0]?.stage?.name || 'Sin etapa'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="text-muted-foreground size-4" />
                <span className="text-muted-foreground">
                  Próximo seguimiento
                </span>
                <span className="text-muted-foreground ml-auto">
                  {contact.next_follow_up_at
                    ? format(new Date(contact.next_follow_up_at), 'dd/MM/yyyy')
                    : 'No configurado'}
                </span>
              </div>
              {contact.rut && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">RUT</span>
                  <span className="text-foreground font-medium">
                    {contact.rut}
                  </span>
                </div>
              )}
              {contact.source && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Fuente</span>
                  <span className="text-foreground max-w-36 truncate font-medium">
                    {contact.source}
                  </span>
                </div>
              )}
              {contact.interest_product && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Interés</span>
                  <span className="text-foreground max-w-36 truncate font-medium">
                    {contact.interest_product}
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="border-border bg-background rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <StickyNote className="h-3.5 w-3.5" />
              Notas internas
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Solo visibles para tu equipo; no se envían por WhatsApp.
            </p>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Agregar una nota interna..."
                  rows={2}
                  className="border-border bg-muted text-foreground placeholder-muted-foreground focus:border-primary/50 flex-1 resize-none rounded-lg border px-3 py-2 text-xs outline-none"
                />
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 h-auto px-2"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.length === 0 && (
                  <p className="text-muted-foreground px-1 py-2 text-xs">
                    Aún no hay notas.
                  </p>
                )}
                {notes.map((note) => (
                  <div key={note.id} className="bg-muted rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                      {note.body}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {format(new Date(note.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="border-border bg-background rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <AtSign className="h-3.5 w-3.5" />
              Campos personalizados
            </div>
            <div className="mt-3 space-y-2">
              {customFields.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No hay campos configurados.
                </p>
              ) : (
                customFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-start justify-between gap-3 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {field.field_name}
                    </span>
                    <span className="text-foreground max-w-36 text-right font-medium break-words">
                      {customValues[field.id] || 'Sin información'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="border-border bg-background rounded-xl border border-dashed p-3">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <History className="h-3.5 w-3.5" />
              Historial del ticket
            </div>
            <div className="mt-2 space-y-1">
              {events.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 rounded-lg px-2 py-2 text-xs">
                  <ChevronRight className="size-3.5" />
                  Sin movimientos registrados
                </div>
              ) : (
                events.slice(0, 12).map((event) => (
                  <div
                    key={event.id}
                    className="border-border/60 border-b px-2 py-2 last:border-0"
                  >
                    <p className="text-foreground text-xs font-medium">
                      {ticketEventLabel(event)}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[10px]">
                      {format(new Date(event.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                    {event.note && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {event.note}
                      </p>
                    )}
                  </div>
                ))
              )}
              <div className="text-muted-foreground flex items-center gap-2 rounded-lg px-2 py-2 text-xs">
                <CalendarDays className="size-3.5" />
                Contacto creado el{' '}
                {format(new Date(contact.created_at), 'dd/MM/yyyy')}
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
