'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type MouseEvent,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from '@/lib/inbox/conversations';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  ConversationChannel,
  ConversationStatus,
  Profile,
  Tag,
} from '@/types';
import {
  Building2,
  Bot,
  ChevronDown,
  ClockAlert,
  Inbox,
  ListFilter,
  Loader2,
  LockKeyhole,
  MessagesSquare,
  Search,
  Smartphone,
  UserRoundCheck,
  UsersRound,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { TicketStatusBadge } from './ticket-status-badge';
import { ChannelBadge } from './channel-badge';
import {
  CHANNEL_OPTIONS,
  getChannelMeta,
  resolveConversationChannel,
} from '@/lib/channels/channel-meta';
import { getConversationAiIndicator } from '@/lib/ai/conversation-state';
import { toast } from 'sonner';
import {
  getWaitingMinutes,
  isConversationAwaitingReply,
} from '@/lib/inbox/response-waiting';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  onAccept: (conversation: Conversation) => Promise<Conversation>;
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
type ChannelFilter = ConversationChannel | 'all';
type OperationalInboxView = 'all' | 'queue' | 'mine' | 'closed';
type OperationalInboxViewOption = readonly [
  OperationalInboxView,
  string,
  number,
];

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
  onAccept,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const { accountRole, user } = useAuth();
  const isAgentInbox = accountRole === 'agent';
  const isAdminInbox =
    accountRole === 'owner' ||
    accountRole === 'admin' ||
    accountRole === 'supervisor';
  const hasOperationalInboxViews = isAgentInbox || isAdminInbox;
  const [inboxView, setInboxView] = useState<OperationalInboxView>('all');
  // Agents always enter through the shared queue. Administrators enter in
  // the company-wide active view and can then switch to their own chats.
  const activeInboxView =
    isAgentInbox && inboxView === 'all' ? 'queue' : inboxView;
  const previousTicketStateRef = useRef(
    new Map<
      string,
      { assignedAgentId: string | null; status: ConversationStatus }
    >()
  );
  const [queueRefreshToken, setQueueRefreshToken] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');
  const [loading, setLoading] = useState(true);
  const [acceptingConversationId, setAcceptingConversationId] = useState<
    string | null
  >(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
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
  }, [resyncToken, queueRefreshToken]);

  // When another agent accepts a lead, the row becomes invisible to this
  // agent under RLS and may not emit a realtime UPDATE to their subscription.
  // A small queue-only poll removes that stale card quickly while avoiding
  // background traffic when the agent is working inside Mis chats.
  useEffect(() => {
    if (!hasOperationalInboxViews || activeInboxView !== 'queue') return;
    const timer = window.setInterval(
      () => setQueueRefreshToken((current) => current + 1),
      10_000
    );
    return () => window.clearInterval(timer);
  }, [activeInboxView, hasOperationalInboxViews]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const agentNamesById = useMemo(() => {
    const names = new Map<string, string>();
    for (const profile of profiles) {
      names.set(profile.user_id, profile.full_name || profile.email);
    }
    return names;
  }, [profiles]);

  const inboxViewCounts = useMemo(() => {
    const userId = user?.id;
    return {
      all: conversations.filter(
        (conversation) => conversation.status !== 'closed'
      ).length,
      queue: conversations.filter(
        (conversation) =>
          conversation.status === 'pending' && !conversation.assigned_agent_id
      ).length,
      mine: userId
        ? conversations.filter(
            (conversation) =>
              conversation.assigned_agent_id === userId &&
              conversation.status !== 'closed'
          ).length
        : 0,
      closed: conversations.filter(
        (conversation) =>
          conversation.status === 'closed' &&
          (isAdminInbox || conversation.assigned_agent_id === userId)
      ).length,
    };
  }, [conversations, isAdminInbox, user?.id]);

  // Keep an accepted lead visible by moving from the queue to the user's
  // personal list only when the ticket actually transitions from unassigned
  // pending to assigned. Merely opening the queue while an older personal chat
  // remains selected must not send the user back to "Mis chats".
  useEffect(() => {
    const previousActiveState = activeConversationId
      ? previousTicketStateRef.current.get(activeConversationId)
      : undefined;
    const active = activeConversationId
      ? conversations.find(
          (conversation) => conversation.id === activeConversationId
        )
      : undefined;

    const wasJustAcceptedByCurrentUser = Boolean(
      active &&
      previousActiveState &&
      previousActiveState.status === 'pending' &&
      !previousActiveState.assignedAgentId &&
      active.assigned_agent_id === user?.id &&
      active.status !== 'pending' &&
      active.status !== 'closed'
    );

    previousTicketStateRef.current = new Map(
      conversations.map((conversation) => [
        conversation.id,
        {
          assignedAgentId: conversation.assigned_agent_id ?? null,
          status: conversation.status,
        },
      ])
    );

    if (
      hasOperationalInboxViews &&
      activeInboxView === 'queue' &&
      wasJustAcceptedByCurrentUser
    ) {
      setInboxView('mine');
    }
  }, [
    activeConversationId,
    activeInboxView,
    conversations,
    hasOperationalInboxViews,
    user?.id,
  ]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (hasOperationalInboxViews) {
      if (activeInboxView === 'all') {
        result = result.filter(
          (conversation) => conversation.status !== 'closed'
        );
      } else if (activeInboxView === 'queue') {
        result = result.filter(
          (conversation) =>
            conversation.status === 'pending' && !conversation.assigned_agent_id
        );
      } else if (activeInboxView === 'mine') {
        result = result.filter(
          (conversation) =>
            conversation.assigned_agent_id === user?.id &&
            conversation.status !== 'closed'
        );
      } else {
        result = result.filter(
          (conversation) =>
            conversation.status === 'closed' &&
            (isAdminInbox || conversation.assigned_agent_id === user?.id)
        );
      }
    }

    if (filter === 'unread') {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== 'all') {
      result = result.filter((c) => c.status === filter);
    }

    if (channelFilter !== 'all') {
      result = result.filter(
        (conversation) =>
          resolveConversationChannel(conversation.channel) === channelFilter
      );
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
    channelFilter,
    assignmentFilter,
    search,
    selectedTagIds,
    selectedCompany,
    selectedDepartmentId,
    selectedWhatsappId,
    hasOperationalInboxViews,
    activeInboxView,
    isAdminInbox,
    user?.id,
  ]);

  const handleInboxViewChange = useCallback((view: OperationalInboxView) => {
    setInboxView(view);
    // The operational tabs already express status/ownership. Reset these
    // two secondary filters so an old selection cannot make a new tab look
    // empty or hide the lead that was just accepted.
    setFilter('all');
    setAssignmentFilter('all');
  }, []);

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
    setChannelFilter('all');
  }, []);

  const clearAllFilters = useCallback(() => {
    clearContactFilters();
    setFilter('all');
    setAssignmentFilter('all');
  }, [clearContactFilters]);

  const activeSecondaryFilterCount =
    Number(filter !== 'all') +
    Number(channelFilter !== 'all') +
    Number(assignmentFilter !== 'all') +
    Number(selectedDepartmentId !== null) +
    Number(selectedWhatsappId !== null) +
    selectedTagIds.length +
    Number(selectedCompany !== null);

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

  const handleAccept = useCallback(
    async (conversation: Conversation) => {
      if (acceptingConversationId) return;
      setAcceptingConversationId(conversation.id);
      try {
        const accepted = await onAccept(conversation);
        toast.success(
          'Lead aceptado y protegido. Si el cliente vuelve, regresará a tu bandeja.'
        );
        onSelect(accepted);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'No se pudo aceptar el lead'
        );
      } finally {
        setAcceptingConversationId(null);
      }
    },
    [acceptingConversationId, onAccept, onSelect]
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
    // the single pane showing; fixed width on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="border-border/60 bg-card/95 flex h-full w-full min-w-0 flex-col overflow-hidden border-r backdrop-blur-xl lg:w-[25rem] xl:w-[27rem]">
      <div className="border-border/60 border-b px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="mb-2.5 flex items-center justify-between gap-3 sm:mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="text-primary size-4" />
              <h1 className="text-foreground text-base font-semibold tracking-[-0.03em] sm:text-lg">
                Bandeja de atención
              </h1>
            </div>
            <p className="text-muted-foreground mt-0.5 pl-6 text-xs">
              {conversations.length} conversación
              {conversations.length === 1 ? '' : 'es'} en total
            </p>
          </div>
          <span className="text-primary inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">En vivo</span>
          </span>
        </div>

        {hasOperationalInboxViews ? (
          <div
            className={cn(
              'bg-muted/70 mb-2.5 grid min-w-0 gap-0.5 overflow-hidden rounded-lg p-0.5 sm:mb-3',
              isAdminInbox ? 'grid-cols-4' : 'grid-cols-3'
            )}
          >
            {(
              (isAdminInbox
                ? [
                    ['all', 'Todos', inboxViewCounts.all],
                    ['queue', 'Espera', inboxViewCounts.queue],
                    ['mine', 'Mis chats', inboxViewCounts.mine],
                    ['closed', 'Cerrados', inboxViewCounts.closed],
                  ]
                : [
                    ['queue', 'En espera', inboxViewCounts.queue],
                    ['mine', 'Mis chats', inboxViewCounts.mine],
                    ['closed', 'Cerrados', inboxViewCounts.closed],
                  ]) as OperationalInboxViewOption[]
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleInboxViewChange(value)}
                className={cn(
                  'flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition-colors sm:h-auto sm:px-1.5 sm:py-1.5',
                  activeInboxView === value
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="truncate">{label}</span>
                <span
                  className={cn(
                    'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px]',
                    value === 'queue' && count > 0
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-background text-muted-foreground'
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={handleSearchChange}
              placeholder="Buscar leads..."
              aria-label="Buscar conversaciones por nombre, teléfono o mensaje"
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary/50 h-10 rounded-xl pr-3 pl-9 text-sm"
            />
          </div>

          <Popover>
            <PopoverTrigger
              className={cn(
                'border-border bg-background hover:bg-muted inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium',
                activeSecondaryFilterCount > 0
                  ? 'text-primary border-primary/35 bg-primary/5'
                  : 'text-foreground'
              )}
              aria-label="Abrir filtros de la bandeja"
            >
              <ListFilter className="size-4" />
              <span className="hidden sm:inline">Filtros</span>
              {activeSecondaryFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full text-[9px] font-bold">
                  {activeSecondaryFilterCount > 9
                    ? '9+'
                    : activeSecondaryFilterCount}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="border-border w-[min(22rem,calc(100vw-2rem))] gap-3 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Filtrar bandeja</p>
                  <p className="text-muted-foreground text-xs">
                    Combina los criterios que necesites.
                  </p>
                </div>
                {activeSecondaryFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-primary hover:text-primary/80 text-xs font-semibold"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm">
                    <MessagesSquare className="size-4" />
                    {channelFilter === 'all'
                      ? 'Todos los canales'
                      : getChannelMeta(channelFilter).label}
                    <ChevronDown className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="border-border bg-popover"
                  >
                    <DropdownMenuItem
                      onClick={() => setChannelFilter('all')}
                      className={cn(
                        'text-sm',
                        channelFilter === 'all'
                          ? 'text-primary'
                          : 'text-popover-foreground'
                      )}
                    >
                      Todos los canales
                    </DropdownMenuItem>
                    {CHANNEL_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => {
                          setChannelFilter(option.value);
                          if (option.value !== 'whatsapp') {
                            setSelectedWhatsappId(null);
                          }
                        }}
                        className={cn(
                          'text-sm',
                          channelFilter === option.value
                            ? 'text-primary'
                            : 'text-popover-foreground'
                        )}
                      >
                        <ChannelBadge channel={option.value} className="mr-1" />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm">
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

                {!isAgentInbox ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm">
                      <UsersRound className="size-4" />
                      <span className="max-w-28 truncate">
                        {activeAssignmentLabel}
                      </span>
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
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm">
                    <Building2 className="size-4" />
                    <span className="max-w-28 truncate">
                      {departments.find(
                        (item) => item.id === selectedDepartmentId
                      )?.name ?? 'Departamento'}
                    </span>
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="border-border bg-popover"
                  >
                    <DropdownMenuItem
                      onClick={() => setSelectedDepartmentId(null)}
                    >
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

                {(channelFilter === 'all' || channelFilter === 'whatsapp') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm">
                      <Smartphone className="size-4" />
                      <span className="max-w-24 truncate">
                        {whatsappNumbers.find(
                          (item) => item.id === selectedWhatsappId
                        )?.connection_name ?? 'Número'}
                      </span>
                      <ChevronDown className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="border-border bg-popover"
                    >
                      <DropdownMenuItem
                        onClick={() => setSelectedWhatsappId(null)}
                      >
                        Todos los números
                      </DropdownMenuItem>
                      {whatsappNumbers.map((number) => (
                        <DropdownMenuItem
                          key={number.id}
                          onClick={() => setSelectedWhatsappId(number.id)}
                        >
                          {number.connection_name ||
                            number.display_name ||
                            number.display_phone ||
                            number.phone_number_id}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {tags.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        'border-border bg-background hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm',
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
                        'border-border bg-background hover:bg-muted inline-flex h-10 max-w-44 items-center justify-center gap-2 rounded-xl border px-3 text-sm',
                        selectedCompany
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="truncate">
                        {selectedCompany ?? 'Empresa'}
                      </span>
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
                        Todas las empresas
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

              {activeSecondaryFilterCount > 0 && (
                <div className="border-border bg-muted/45 flex items-center justify-between rounded-lg border px-2.5 py-2">
                  <span className="text-muted-foreground text-xs">
                    {activeSecondaryFilterCount} filtro
                    {activeSecondaryFilterCount === 1 ? '' : 's'} activo
                    {activeSecondaryFilterCount === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-primary text-xs font-semibold"
                  >
                    Restablecer
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
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
              {hasOperationalInboxViews && activeInboxView === 'queue'
                ? 'No hay leads en espera'
                : hasOperationalInboxViews && activeInboxView === 'mine'
                  ? 'Aún no tienes chats asignados'
                  : hasOperationalInboxViews && activeInboxView === 'closed'
                    ? isAdminInbox
                      ? 'No hay tickets cerrados'
                      : 'No tienes tickets cerrados'
                    : 'No encontramos conversaciones'}
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
                onAccept={handleAccept}
                canAccept={
                  hasOperationalInboxViews &&
                  conv.status === 'pending' &&
                  !conv.assigned_agent_id
                }
                isAccepting={acceptingConversationId === conv.id}
                assignedAgentName={
                  conv.assigned_agent_id
                    ? agentNamesById.get(conv.assigned_agent_id)
                    : undefined
                }
                currentTime={currentTime}
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
  onAccept: (conversation: Conversation) => Promise<void>;
  canAccept: boolean;
  isAccepting: boolean;
  assignedAgentName?: string;
  currentTime: number;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onAccept,
  canAccept,
  isAccepting,
  assignedAgentName,
  currentTime,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const contactTags = contact?.tags ?? [];
  const displayName = contact?.name || contact?.phone || 'Unknown';
  const initials = displayName.charAt(0).toUpperCase();
  const aiIndicator = getConversationAiIndicator(conversation);
  const awaitingReply = isConversationAwaitingReply(conversation, currentTime);
  const waitingMinutes = awaitingReply
    ? getWaitingMinutes(conversation, currentTime)
    : 0;

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const handleAcceptClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      void onAccept(conversation);
    },
    [conversation, onAccept]
  );

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : '';

  return (
    <div
      className={cn(
        'group border-border/55 hover:bg-muted/45 relative flex w-full border-b text-left transition-colors',
        isActive && 'bg-primary-soft'
      )}
    >
      {isActive && (
        <span className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-r-full" />
      )}
      <button
        type="button"
        onClick={handleClick}
        className="focus-visible:ring-primary/40 flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset sm:gap-3.5 sm:px-5 sm:py-4.5"
        aria-label={`Abrir conversación con ${displayName}`}
      >
        {/* Avatar */}
        <Avatar className="bg-muted text-foreground ring-border size-11 text-sm font-semibold ring-1 sm:size-12 sm:text-base">
          {contact?.avatar_url ? (
            <AvatarImage src={contact.avatar_url} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-foreground font-semibold">
            {initials}
          </AvatarFallback>
          {conversation.unread_count > 0 && (
            <span className="border-card bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 px-1 text-[10px] font-bold">
              {conversation.unread_count > 99
                ? '99+'
                : conversation.unread_count}
            </span>
          )}
        </Avatar>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground truncate text-[15px] font-semibold">
              {displayName}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {timeAgo}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-muted-foreground truncate text-sm leading-6">
              {conversation.last_message_text || 'Aún no hay mensajes'}
            </p>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
            {awaitingReply ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                <ClockAlert className="size-2.5" />
                <span className="sm:hidden">
                  {waitingMinutes < 60
                    ? `${waitingMinutes} min`
                    : `${Math.floor(waitingMinutes / 60)} h`}
                </span>
                <span className="hidden sm:inline">
                  {waitingMinutes < 60
                    ? `Más de ${waitingMinutes} min sin respuesta`
                    : `${Math.floor(waitingMinutes / 60)} h sin respuesta`}
                </span>
              </span>
            ) : null}
            <ChannelBadge channel={conversation.channel} compact />
            {conversation.channel === 'whatsapp' &&
              conversation.whatsapp_config?.connection_name && (
                <span
                  className="border-primary/25 bg-primary/8 text-primary hidden max-w-32 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex"
                  title={
                    conversation.whatsapp_config.display_phone
                      ? `${conversation.whatsapp_config.connection_name} · +${conversation.whatsapp_config.display_phone}`
                      : conversation.whatsapp_config.connection_name
                  }
                >
                  <span className="truncate">
                    {conversation.whatsapp_config.connection_name}
                  </span>
                </span>
              )}
            <TicketStatusBadge status={conversation.status} compact />
            {aiIndicator && (
              <span className="border-primary/30 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold">
                <Bot className="size-2.5" />
                {aiIndicator.label}
              </span>
            )}
            {contactTags.map((tag, index) => (
              <span
                key={tag.id}
                className={cn(
                  'max-w-32 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  index === 0 ? 'inline-flex' : 'hidden sm:inline-flex'
                )}
                style={{
                  backgroundColor: `${tag.color}18`,
                  borderColor: `${tag.color}55`,
                  color: tag.color,
                }}
                title={tag.name}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate">{tag.name}</span>
              </span>
            ))}
            {contactTags.length > 1 ? (
              <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] sm:hidden">
                +{contactTags.length - 1}
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex max-w-32 min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] sm:max-w-none',
                conversation.assigned_agent_id
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border bg-background text-muted-foreground'
              )}
              title={
                conversation.assigned_agent_id
                  ? `Lead protegido para ${assignedAgentName || 'el ejecutivo asignado'}`
                  : 'Este lead todavía no tiene ejecutivo'
              }
            >
              {conversation.assigned_agent_id ? (
                <LockKeyhole className="size-2.5 shrink-0" />
              ) : (
                <UserRoundCheck className="size-2.5 shrink-0" />
              )}
              <span className="truncate">
                {conversation.assigned_agent_id
                  ? assignedAgentName || 'Ejecutivo asignado'
                  : 'Sin asignar'}
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

      {canAccept ? (
        <div className="flex shrink-0 items-start py-3 pr-3 sm:py-4.5 sm:pr-4">
          <button
            type="button"
            onClick={handleAcceptClick}
            disabled={isAccepting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex size-10 items-center justify-center gap-1.5 rounded-xl p-0 text-xs font-bold shadow-sm transition-colors disabled:opacity-60 sm:h-8 sm:w-auto sm:rounded-lg sm:px-2.5"
            title="Aceptar y proteger este lead para ti"
          >
            {isAccepting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <LockKeyhole className="size-3" />
            )}
            <span className="hidden sm:inline">Aceptar</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
