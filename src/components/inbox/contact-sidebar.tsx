'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { toast } from 'sonner';
import type {
  Contact,
  Conversation,
  CustomField,
  Deal,
  Tag,
  TicketEvent,
  TicketNote,
} from '@/types';
import type { ConversationLeadProfile } from '@/lib/ai/types';
import {
  AtSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
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
  X,
  ClipboardCheck,
  Eye,
  ReceiptText,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { TicketStatusBadge } from './ticket-status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ContactSidebarProps {
  contact: Contact | null;
  conversation: Conversation | null;
  onTagsChanged?: (tags: Tag[]) => void;
  onClose?: () => void;
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
    ai_coverage_started: 'Cobertura IA iniciada',
    ai_coverage_paused: 'Cobertura IA pausada',
    ai_waiting_human: 'IA solicitó apoyo humano',
    ai_no_points: 'Cobertura IA pausada por puntos',
    ai_returned: 'Conversación devuelta a IA',
    ai_manual_activation: 'Conversación delegada a IA',
  };
  return labels[event.event_type];
}

export function ContactSidebar({
  contact,
  conversation,
  onTagsChanged,
  onClose,
}: ContactSidebarProps) {
  const { accountId } = useAuth();
  const canApplyTags = useCan('send-messages');
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [tagCatalog, setTagCatalog] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [leadProfile, setLeadProfile] =
    useState<ConversationLeadProfile | null>(null);
  const [demoLeadProfileConversationId, setDemoLeadProfileConversationId] =
    useState<string | null>(null);

  const fetchContactData = useCallback(async () => {
    if (!contact || !conversation) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [
      dealsRes,
      tagsResponse,
      fieldsRes,
      valuesRes,
      notesResponse,
      eventsResponse,
      leadProfileResponse,
    ] = await Promise.all([
      supabase
        .from('deals')
        .select('*, stage:pipeline_stages(*)')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false }),
      fetch(`/api/tickets/${conversation.id}/tags`, { cache: 'no-store' }),
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contact.id),
      fetch(`/api/tickets/${conversation.id}/notes`, { cache: 'no-store' }),
      fetch(`/api/tickets/${conversation.id}/events`, { cache: 'no-store' }),
      fetch(`/api/tickets/${conversation.id}/lead-profile`, {
        cache: 'no-store',
      }),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (tagsResponse.ok) {
      const tagPayload = (await tagsResponse.json()) as {
        tags: Tag[];
        applied: Array<Record<string, unknown>>;
      };
      setTagCatalog(tagPayload.tags ?? []);
      const mapped = (tagPayload.applied ?? [])
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
    if (leadProfileResponse.ok) {
      const payload = (await leadProfileResponse.json()) as {
        profile: ConversationLeadProfile | null;
      };
      setLeadProfile(payload.profile ?? null);
    } else {
      setLeadProfile(null);
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

  const handleTicketTag = useCallback(
    async (tagId: string, applied: boolean) => {
      if (!conversation || !tagId) return;
      setSavingTag(true);
      const response = await fetch(`/api/tickets/${conversation.id}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, applied }),
      });
      const payload = await response.json().catch(() => ({}));
      setSavingTag(false);
      if (!response.ok) {
        toast.error(payload.error ?? 'No se pudo actualizar la etiqueta');
        return;
      }
      const nextTags = applied
        ? (() => {
            const selected = tagCatalog.find((tag) => tag.id === tagId);
            if (!selected || tags.some((tag) => tag.id === tagId)) return tags;
            return [...tags, { ...selected, contact_tag_id: `local:${tagId}` }];
          })()
        : tags.filter((tag) => tag.id !== tagId);
      setTags(nextTags);
      onTagsChanged?.(nextTags);
      setSelectedTagId('');
      toast.success(applied ? 'Etiqueta aplicada' : 'Etiqueta eliminada');
    },
    [conversation, onTagsChanged, tagCatalog, tags]
  );

  if (!contact) {
    return (
      <div className="border-border/60 bg-card/95 flex h-full w-full items-center justify-center border-l md:w-[22rem] xl:w-[25rem]">
        <p className="text-muted-foreground text-sm">
          Selecciona una conversación
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const showingLeadProfileDemo =
    demoLeadProfileConversationId === conversation?.id;
  const displayedLeadProfile: ConversationLeadProfile | null =
    showingLeadProfileDemo && conversation
      ? {
          id: null,
          account_id: accountId ?? '',
          conversation_id: conversation.id,
          contact_id: contact.id,
          full_name: 'Carolina Muñoz Rojas',
          rut: '17.456.789-2',
          phone: contact.phone || '+56 9 8765 4321',
          city: 'Temuco',
          vehicle_interest: 'Toyota RAV4 automática, año 2022 o superior',
          down_payment: '$5.000.000',
          income_proof: true,
          employment_type: 'Contrato indefinido',
          employment_tenure: '3 años y 4 meses',
          has_dicom: false,
          trade_in: true,
          trade_in_vehicle: 'Hyundai Accent 2017',
          purchase_timeline: 'Durante las próximas 2 semanas',
          financing_requested: true,
          captured_by_ai: true,
          updated_at: new Date().toISOString(),
        }
      : leadProfile;
  const financingNotApplicable =
    displayedLeadProfile?.financing_requested === false;
  const qualificationValues = displayedLeadProfile
    ? [
        displayedLeadProfile.full_name,
        displayedLeadProfile.phone,
        displayedLeadProfile.city,
        displayedLeadProfile.vehicle_interest,
        displayedLeadProfile.down_payment,
        financingNotApplicable ? true : displayedLeadProfile.rut,
        financingNotApplicable ? true : displayedLeadProfile.income_proof,
        financingNotApplicable
          ? true
          : displayedLeadProfile.employment_type &&
            displayedLeadProfile.employment_tenure,
        financingNotApplicable ? true : displayedLeadProfile.has_dicom,
        displayedLeadProfile.trade_in,
        displayedLeadProfile.purchase_timeline,
      ]
    : [];
  const qualificationCompleted = qualificationValues.filter(
    (value) => value !== null && value !== undefined && value !== ''
  ).length;
  const qualificationPercent = Math.round(
    (qualificationCompleted / Math.max(1, qualificationValues.length)) * 100
  );

  function yesNo(value: boolean | null): string {
    if (value === null) return 'Por confirmar';
    return value ? 'Sí' : 'No';
  }

  function financingValue(value: string | boolean | null): string {
    if (financingNotApplicable) return 'No aplica';
    if (typeof value === 'boolean') return yesNo(value);
    return value || 'Por confirmar';
  }

  return (
    <div className="border-border/60 bg-card/95 flex h-full w-full min-w-0 flex-col border-l backdrop-blur-xl md:w-[22rem] xl:w-[25rem]">
      <div className="border-border/60 flex h-[72px] shrink-0 items-center justify-between border-b px-5">
        <div>
          <h2 className="text-foreground text-lg font-semibold tracking-[-0.02em]">
            Ficha del cliente
          </h2>
          <p className="text-muted-foreground text-[11px]">
            Contexto comercial y de atención
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border-border bg-background text-muted-foreground rounded-full border px-2 py-1 text-[10px]">
            Cliente
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ficha del cliente"
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-11 items-center justify-center rounded-xl lg:hidden"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-5">
          <div className="border-border/70 bg-background flex items-center gap-4 rounded-2xl border p-4 shadow-sm">
            <Avatar className="bg-primary-soft text-primary ring-primary/15 size-14 text-lg font-semibold ring-1">
              {contact.avatar_url ? (
                <AvatarImage src={contact.avatar_url} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-primary-soft text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground truncate text-base font-semibold">
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

          <Link
            href={`/quotes?contactId=${contact.id}`}
            className={buttonVariants({
              variant: 'outline',
              className: 'w-full justify-start',
            })}
          >
            <ReceiptText className="size-4" />
            Ver cotizaciones del cliente
          </Link>

          <section className="border-border bg-background rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-primary flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
                  <ClipboardCheck className="size-4" />
                  Precalificación IA
                </div>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Información confirmada durante la conversación.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setDemoLeadProfileConversationId((current) =>
                      current === conversation?.id
                        ? null
                        : (conversation?.id ?? null)
                    )
                  }
                  className="text-primary h-7 px-2 text-[10px]"
                >
                  <Eye className="size-3" />
                  {showingLeadProfileDemo ? 'Ver datos reales' : 'Ver ejemplo'}
                </Button>
                {displayedLeadProfile ? (
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-[10px] font-semibold">
                    {showingLeadProfileDemo ? 'DEMO · ' : ''}
                    {qualificationPercent}%
                  </span>
                ) : null}
              </div>
            </div>

            {displayedLeadProfile ? (
              <>
                <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${qualificationPercent}%` }}
                  />
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    ['Nombre completo', displayedLeadProfile.full_name],
                    ['RUT', financingValue(displayedLeadProfile.rut)],
                    ['Teléfono', displayedLeadProfile.phone || contact.phone],
                    ['Ciudad o comuna', displayedLeadProfile.city],
                    [
                      'Vehículo que busca',
                      displayedLeadProfile.vehicle_interest,
                    ],
                    ['Pie disponible', displayedLeadProfile.down_payment],
                    [
                      'Acredita ingresos',
                      financingValue(displayedLeadProfile.income_proof),
                    ],
                    [
                      'Contrato y antigüedad',
                      financingNotApplicable
                        ? 'No aplica'
                        : [
                            displayedLeadProfile.employment_type,
                            displayedLeadProfile.employment_tenure,
                          ]
                            .filter(Boolean)
                            .join(' · '),
                    ],
                    [
                      'Presenta DICOM',
                      financingValue(displayedLeadProfile.has_dicom),
                    ],
                    [
                      'Vehículo en parte de pago',
                      `${yesNo(displayedLeadProfile.trade_in)}${
                        displayedLeadProfile.trade_in_vehicle
                          ? ` · ${displayedLeadProfile.trade_in_vehicle}`
                          : ''
                      }`,
                    ],
                    [
                      'Cuándo desea comprar',
                      displayedLeadProfile.purchase_timeline,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="border-border/60 flex items-start justify-between gap-3 border-b py-1.5 last:border-0"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground max-w-40 text-right font-medium break-words">
                        {value || 'Por confirmar'}
                      </span>
                    </div>
                  ))}
                </div>
                {showingLeadProfileDemo ? (
                  <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
                    Vista demostrativa. Estos datos son ficticios y no se
                    guardan en el cliente.
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-3 text-[10px] leading-4">
                  Datos declarados por el cliente; no equivalen a una aprobación
                  financiera.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-3 rounded-lg border border-dashed p-3 text-xs leading-5">
                La IA todavía no ha confirmado datos de precalificación en este
                chat.
              </p>
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
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      borderColor: `${tag.color}55`,
                      color: tag.color,
                    }}
                  >
                    <span
                      className="mr-1 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                    {canApplyTags && conversation?.status !== 'closed' ? (
                      <button
                        type="button"
                        onClick={() => void handleTicketTag(tag.id, false)}
                        disabled={savingTag}
                        aria-label={`Quitar ${tag.name}`}
                        className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                      >
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </span>
                ))
              )}
            </div>
            {canApplyTags && conversation?.status !== 'closed' ? (
              <div className="mt-3 flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className="border-border bg-card text-foreground hover:bg-muted flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 text-xs outline-none">
                    {(() => {
                      const selected = tagCatalog.find(
                        (tag) => tag.id === selectedTagId
                      );
                      return selected ? (
                        <>
                          <span
                            className="size-2.5 shrink-0 rounded-full ring-2 ring-white/70 dark:ring-black/20"
                            style={{ backgroundColor: selected.color }}
                          />
                          <span
                            className="min-w-0 truncate font-semibold"
                            style={{ color: selected.color }}
                          >
                            {selected.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground min-w-0 truncate">
                          Agregar etiqueta…
                        </span>
                      );
                    })()}
                    <ChevronDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="border-border bg-popover max-h-64 min-w-56 p-1.5"
                  >
                    {tagCatalog.filter(
                      (tag) => !tags.some((item) => item.id === tag.id)
                    ).length === 0 ? (
                      <div className="text-muted-foreground px-2 py-3 text-center text-xs">
                        No hay más etiquetas disponibles
                      </div>
                    ) : (
                      tagCatalog
                        .filter(
                          (tag) => !tags.some((item) => item.id === tag.id)
                        )
                        .map((tag) => (
                          <DropdownMenuItem
                            key={tag.id}
                            onClick={() => setSelectedTagId(tag.id)}
                            className="cursor-pointer px-2 py-2"
                          >
                            <span
                              className="size-3 shrink-0 rounded-full ring-2 ring-white/70 dark:ring-black/20"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span
                              className="min-w-0 truncate font-semibold"
                              style={{ color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          </DropdownMenuItem>
                        ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={!selectedTagId || savingTag}
                  onClick={() => void handleTicketTag(selectedTagId, true)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            ) : null}
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
