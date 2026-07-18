'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from '@/lib/inbox/conversations';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationStatus, Profile, Tag } from '@/types';
import {
  Building2,
  ChevronDown,
  Inbox,
  Search,
  Smartphone,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TicketStatusBadge } from './ticket-status-badge';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

type InboxFilter = ConversationStatus | 'all' | 'unread';
type AssignmentFilter = 'all' | 'assigned' | 'unassigned' | string;

const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'No leídos', value: 'unread' },
  { label: 'Abiertos', value: 'open' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'Esperando', value: 'waiting' },
  { label: 'Cerrados', value: 'closed' },
];

const ASSIGNMENT_OPTIONS: { label: string; value: AssignmentFilter }[] = [
  { label: 'Todos los ejecutivos', value: 'all' },
  { label: 'Asignados', value: 'assigned' },
  { label: 'Sin asignar', value: 'unassigned' },
];

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<
    string | null
  >(null);
  const [selectedWhatsappId, setSelectedWhatsappId] = useState<string | null>(
    null
  );

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error('Failed to fetch conversations:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('tags').select('*').order('name');
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .order('full_name')
      .then(({ data }) => {
        if (!cancelled && data) setProfiles(data as Profile[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const departments = useMemo(() => {
    const map = new Map<string, NonNullable<Conversation['department']>>();
    for (const conversation of conversations) {
      if (conversation.department) {
        map.set(conversation.department.id, conversation.department);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.position - b.position);
  }, [conversations]);

  const whatsappNumbers = useMemo(() => {
    const map = new Map<string, NonNullable<Conversation['whatsapp_config']>>();
    for (const conversation of conversations) {
      if (conversation.whatsapp_config) {
        map.set(conversation.whatsapp_config.id, conversation.whatsapp_config);
      }
    }
    return Array.from(map.values());
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== 'all') {
      result = result.filter((c) => c.status === filter);
    }

    if (assignmentFilter === 'assigned') {
      result = result.filter((c) => Boolean(c.assigned_agent_id));
    } else if (assignmentFilter === 'unassigned') {
      result = result.filter((c) => !c.assigned_agent_id);
    } else if (assignmentFilter !== 'all') {
      result = result.filter((c) => c.assigned_agent_id === assignmentFilter);
    }

    if (selectedDepartmentId) {
      result = result.filter((c) => c.department_id === selectedDepartmentId);
    }
    if (selectedWhatsappId) {
      result = result.filter(
        (c) => c.whatsapp_config_id === selectedWhatsappId
      );
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? '';
        const phone = c.contact?.phone?.toLowerCase() ?? '';
        const lastMsg = c.last_message_text?.toLowerCase() ?? '';
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [
    conversations,
    filter,
    assignmentFilter,
    search,
    selectedTagIds,
    selectedCompany,
    selectedDepartmentId,
    selectedWhatsappId,
  ]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
    setSelectedDepartmentId(null);
    setSelectedWhatsappId(null);
  }, []);

  const hasContactFilters =
    selectedTagIds.length > 0 ||
    selectedCompany !== null ||
    selectedDepartmentId !== null ||
    selectedWhatsappId !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);
  const activeAssignment =
    ASSIGNMENT_OPTIONS.find((o) => o.value === assignmentFilter) ??
    profiles.find((profile) => profile.user_id === assignmentFilter);
  const activeAssignmentLabel =
    activeAssignment && 'label' in activeAssignment
      ? activeAssignment.label
      : activeAssignment?.full_name || 'Ejecutivos';

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="border-border bg-card flex h-full w-full flex-col border-r lg:w-[22rem] xl:w-96">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="text-primary size-4" />
              <h1 className="text-foreground text-base font-semibold">
                Bandeja de atención
              </h1>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {conversations.length} conversación
              {conversations.length === 1 ? '' : 'es'} en total
            </p>
          </div>
          <span className="bg-primary-soft text-primary rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
            En vivo
          </span>
        </div>

        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar por nombre, teléfono o mensaje"
            aria-label="Buscar conversaciones"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary/50 h-10 pl-9 text-sm"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs">
              {activeFilter?.label ?? 'All'}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    'text-sm',
                    filter === opt.value
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs">
              <UsersRound className="size-3" />
              <span className="max-w-28 truncate">{activeAssignmentLabel}</span>
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {ASSIGNMENT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setAssignmentFilter(opt.value)}
                  className={cn(
                    'text-sm',
                    assignmentFilter === opt.value
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.user_id}
                  onClick={() => setAssignmentFilter(profile.user_id)}
                  className={cn(
                    'text-sm',
                    assignmentFilter === profile.user_id
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  {profile.full_name || profile.email}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs">
              <Building2 className="size-3" />
              <span className="max-w-28 truncate">
                {departments.find((item) => item.id === selectedDepartmentId)
                  ?.name ?? 'Departamento'}
              </span>
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              <DropdownMenuItem onClick={() => setSelectedDepartmentId(null)}>
                Todos los departamentos
              </DropdownMenuItem>
              {departments.map((department) => (
                <DropdownMenuItem
                  key={department.id}
                  onClick={() => setSelectedDepartmentId(department.id)}
                >
                  <span
                    className="mr-2 size-2 rounded-full"
                    style={{ backgroundColor: department.color }}
                  />
                  {department.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs">
              <Smartphone className="size-3" />
              <span className="max-w-24 truncate">
                {whatsappNumbers.find((item) => item.id === selectedWhatsappId)
                  ?.display_name ?? 'Número'}
              </span>
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              <DropdownMenuItem onClick={() => setSelectedWhatsappId(null)}>
                Todos los números
              </DropdownMenuItem>
              {whatsappNumbers.map((number) => (
                <DropdownMenuItem
                  key={number.id}
                  onClick={() => setSelectedWhatsappId(number.id)}
                >
                  {number.display_name ||
                    number.display_phone ||
                    number.phone_number_id}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'border-border bg-background hover:bg-muted inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs',
                  selectedTagIds.length > 0
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Tags
                {selectedTagIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-popover-foreground text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'border-border bg-background hover:bg-muted inline-flex h-8 max-w-40 items-center justify-center gap-1 rounded-md border px-2.5 text-xs',
                  selectedCompany
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="truncate">{selectedCompany ?? 'Company'}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover max-h-64 w-56"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    'text-sm',
                    selectedCompany === null
                      ? 'text-primary'
                      : 'text-popover-foreground'
                  )}
                >
                  All companies
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      'text-sm',
                      selectedCompany === co
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: tag?.color ?? 'var(--muted-foreground)',
                    }}
                  />
                  <span className="max-w-24 truncate">
                    {tag?.name ?? 'Tag'}
                  </span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="bg-muted text-foreground hover:bg-muted/70 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="text-muted-foreground hover:text-foreground px-1 text-[11px]"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-foreground text-sm font-medium">
              No encontramos conversaciones
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Prueba cambiando los filtros o la búsqueda.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || 'Unknown';
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : '';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'group border-border/60 hover:bg-muted/50 relative flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors',
        isActive && 'bg-primary-soft'
      )}
    >
      {isActive && (
        <span className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-r-full" />
      )}
      {/* Avatar */}
      <div className="bg-muted text-foreground ring-border relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          initials
        )}
        {conversation.unread_count > 0 && (
          <span className="border-card bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 text-[10px] font-bold">
            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate text-sm font-semibold">
            {displayName}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px]">
            {timeAgo}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs leading-5">
            {conversation.last_message_text || 'Aún no hay mensajes'}
          </p>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <TicketStatusBadge status={conversation.status} compact />
          <span className="border-border bg-background text-muted-foreground inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]">
            <UserRoundCheck className="size-2.5 shrink-0" />
            <span className="truncate">
              {conversation.assigned_agent_id ? 'Asignado' : 'Sin asignar'}
            </span>
          </span>
          <span className="border-border text-muted-foreground hidden min-w-0 items-center gap-1 rounded-full border border-dashed px-1.5 py-0.5 text-[10px] xl:inline-flex">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: conversation.department?.color ?? '#64748b',
              }}
            />
            <span className="truncate">
              {conversation.department?.name ?? 'Sin depto.'}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}
