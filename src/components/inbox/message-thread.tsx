'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type DragEvent,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  Department,
  MessageTemplate,
  Profile,
  QuickReply,
  Tag,
} from '@/types';
import {
  MessageSquare,
  ArrowRightLeft,
  Building2,
  ChevronDown,
  UserPlus,
  Check,
  CheckCircle2,
  Clock,
  ArrowLeft,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  StickyNote,
  Loader2,
  LockKeyhole,
  PanelRightOpen,
  PanelRightClose,
  Tags,
  UploadCloud,
  ReceiptText,
  BrainCircuit,
  Bot,
  UserCheck,
  Info,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBubble } from './message-bubble';
import { MessageActions } from './message-actions';
import {
  MessageComposer,
  CHAT_MEDIA_BUCKET,
  type SendMediaPayload,
} from './message-composer';
import { deleteAccountMedia } from '@/lib/storage/upload-media';
import { TemplatePicker } from './template-picker';
import { buildReplyPreview } from './reply-quote';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { TicketStatusBadge } from './ticket-status-badge';
import { QuickReplyPicker } from './quick-reply-picker';
import { ChannelBadge } from './channel-badge';
import {
  getChannelMeta,
  resolveConversationChannel,
} from '@/lib/channels/channel-meta';
import { requiresWhatsAppCustomerCareWindow } from '@/lib/inbox/conversations';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { QuotationEditor } from '@/components/quotes/quotation-editor';
import { getConversationAiIndicator } from '@/lib/ai/conversation-state';
import { messageSenderLabel } from '@/lib/inbox/message-sender-label';

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    return params[idx] ?? `{{${raw}}}`;
  });
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
  /** Opens the customer record as the third mobile inbox screen. */
  onOpenContactPanel?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), 'yyyy-MM-dd');
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: {
  label: string;
  value: ConversationStatus;
  color: string;
}[] = [
  { label: 'Abierto', value: 'open', color: 'text-emerald-500' },
  { label: 'Pendiente', value: 'pending', color: 'text-amber-500' },
  { label: 'Esperando', value: 'waiting', color: 'text-sky-500' },
  { label: 'Cerrado', value: 'closed', color: 'text-muted-foreground' },
];

/**
 * WhatsApp-style doodle background applied to the chat area (both the
 * active thread and the empty state). The SVG tile lives at
 * `/public/inbox-doodle.svg`; the slate-950 colour sits underneath so
 * the doodles read as a subtle pattern rather than a stark grid.
 *
 * Defined once at module scope so the two render paths can't drift —
 * if we ever switch the asset, both spots update together.
 */
const DOODLE_BG_CLASSES =
  "bg-background bg-[url('/inbox-doodle.svg')] bg-repeat";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
  onOpenContactPanel,
}: MessageThreadProps) {
  const router = useRouter();
  const { user, accountRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [ticketActionLoading, setTicketActionLoading] = useState(false);
  const [coachActionLoading, setCoachActionLoading] = useState(false);
  const [resolutionDialogOpen, setResolutionDialogOpen] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [resolutionTagsLoading, setResolutionTagsLoading] = useState(false);
  const [resolutionTags, setResolutionTags] = useState<Tag[]>([]);
  const [resolutionTagIds, setResolutionTagIds] = useState<string[]>([]);
  const [resolutionNote, setResolutionNote] = useState('');
  const [composerInsertion, setComposerInsertion] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [droppedAttachment, setDroppedAttachment] = useState<{
    id: string;
    file: File;
  } | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepthRef = useRef(0);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);

  const hasDraggedFiles = useCallback(
    (event: DragEvent<HTMLElement>) =>
      Array.from(event.dataTransfer.types).includes('Files'),
    []
  );

  const handleFileDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      fileDragDepthRef.current += 1;
      setFileDragActive(true);
    },
    [hasDraggedFiles]
  );

  const handleFileDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [hasDraggedFiles]
  );

  const handleFileDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
      if (fileDragDepthRef.current === 0) setFileDragActive(false);
    },
    [hasDraggedFiles]
  );

  const handleFileDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    fileDragDepthRef.current = 0;
    setFileDragActive(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    if (files.length > 1) {
      toast.info(
        'Se adjuntará el primer archivo. Nexora envía uno por mensaje.'
      );
    }
    setDroppedAttachment({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: files[0]!,
    });
  }, []);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see — today that's just the current user, but the dropdown keeps the
  // shape ready for shared-team workspaces without a refactor.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('position'),
    ]).then(([profilesResult, departmentsResult]) => {
      if (cancelled) return;
      if (profilesResult.error) {
        console.error('Failed to fetch profiles:', profilesResult.error);
      } else {
        setProfiles((profilesResult.data as Profile[]) ?? []);
      }
      if (departmentsResult.error) {
        console.error('Failed to fetch departments:', departmentsResult.error);
      } else {
        setDepartments((departmentsResult.data as Department[]) ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: '' };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === 'customer');

    if (!lastCustomerMsg)
      return { expired: true, remaining: 'No customer messages' };

    const hoursSince = differenceInHours(
      new Date(),
      new Date(lastCustomerMsg.created_at)
    );
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: 'Expired' };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? `${Math.floor(hoursLeft)}h remaining`
        : `${Math.floor(hoursLeft * 60)}m remaining`;

    return { expired, remaining };
  }, [messages]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  const loadedConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) {
      loadedConversationIdRef.current = null;
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      // Periodic recovery syncs stay invisible. The blocking loader is only
      // useful when the user opens a different conversation for the first
      // time, not while refreshing the thread in the background.
      const isInitialLoad = loadedConversationIdRef.current !== conversationId;
      if (isInitialLoad) setLoading(true);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('Failed to fetch messages:', error);
      } else {
        loadedConversationIdRef.current = conversationId;
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled && isInitialLoad) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus —
    // realtime is best-effort and any message events sent while the WS
    // was disconnected or throttled are otherwise lost.
  }, [conversationId, resyncToken]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('conversation_id', conversationId);
      if (cancelled) return;
      if (error) {
        console.error('Failed to fetch reactions:', error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith('temp-') &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .rpc('mark_ticket_read', { p_conversation_id: conversationId })
      .then(({ error }) => {
        if (error) console.error('Failed to reset unread_count:', error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: user?.id,
        content_type: 'text',
        content_text: text,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'text',
            content_text: text,
            reply_to_message_id: replyToId,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send message:', reason);
          toast.error(`No se pudo enviar: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        // Re-key the optimistic bubble immediately. Realtime and the
        // background sync can arrive in either order; using the persisted
        // row id lets the parent collapse both paths into one bubble.
        onUpdateMessage(tempId, {
          ...(typeof payload?.message_id === 'string'
            ? { id: payload.message_id }
            : {}),
          ...(typeof payload?.whatsapp_message_id === 'string'
            ? { message_id: payload.whatsapp_message_id }
            : {}),
          status: 'sent',
        });
      } catch (err) {
        console.error('Failed to send message:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`No se pudo enviar: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage, user?.id]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === 'document'
          ? payload.caption || payload.filename || 'Document'
          : payload.caption;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: user?.id,
        content_type: payload.kind,
        content_text: contentText,
        media_url: payload.mediaUrl,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error('Failed to send media:', reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
            () => {}
          );
          return;
        }

        onUpdateMessage(tempId, {
          ...(typeof data?.message_id === 'string'
            ? { id: data.message_id }
            : {}),
          ...(typeof data?.whatsapp_message_id === 'string'
            ? { message_id: data.whatsapp_message_id }
            : {}),
          status: 'sent',
        });
      } catch (err) {
        console.error('Failed to send media:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(
          () => {}
        );
      }
    },
    [conversation, onNewMessage, onUpdateMessage, user?.id]
  );

  const performTicketAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (!conversation || ticketActionLoading) return null;
      setTicketActionLoading(true);
      try {
        const response = await fetch(`/api/tickets/${conversation.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(payload.error || 'Ticket operation failed');
        const ticket = payload.ticket as Conversation;
        onStatusChange(ticket.id, ticket.status);
        onAssignChange(ticket.id, ticket.assigned_agent_id ?? null);
        onRefresh?.();
        return ticket;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Ticket operation failed'
        );
        return null;
      } finally {
        setTicketActionLoading(false);
      }
    },
    [
      conversation,
      onAssignChange,
      onRefresh,
      onStatusChange,
      ticketActionLoading,
    ]
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (status === 'closed') {
        if (!conversation || conversation.status === 'pending') {
          toast.error('Primero debes aceptar el ticket');
          return;
        }
        setResolutionNote('');
        setResolutionTagIds([]);
        setResolutionTags([]);
        setResolutionTagsLoading(true);
        setResolutionDialogOpen(true);
        try {
          const response = await fetch(`/api/tickets/${conversation.id}/tags`, {
            cache: 'no-store',
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              payload.error ?? 'No se pudieron cargar las etiquetas'
            );
          }
          setResolutionTags((payload.tags ?? []) as Tag[]);
        } catch (error) {
          setResolutionTags([]);
          toast.error(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar las etiquetas'
          );
        } finally {
          setResolutionTagsLoading(false);
        }
        return;
      }
      await performTicketAction({ action: 'status', status });
    },
    [conversation, performTicketAction]
  );

  const handleResolveTicket = useCallback(async () => {
    if (!resolutionNote.trim() || resolutionTagIds.length === 0) return;
    const ticket = await performTicketAction({
      action: 'resolve',
      note: resolutionNote.trim(),
      tagIds: resolutionTagIds,
    });
    if (!ticket) return;
    setResolutionDialogOpen(false);
    setResolutionNote('');
    setResolutionTagIds([]);
    toast.success('Ticket resuelto con motivo y etiqueta');
  }, [performTicketAction, resolutionNote, resolutionTagIds]);

  const handleCoachAnalysis = useCallback(async () => {
    if (!conversation || coachActionLoading) return;
    setCoachActionLoading(true);
    try {
      const response = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id }),
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: {
          status?: 'completed' | 'existing' | 'skipped';
          reason?: string;
        };
      };
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo analizar la conversacion');
      }

      if (payload.result?.status === 'completed') {
        toast.success('Coach IA preparo una nueva recomendacion.', {
          action: {
            label: 'Ver',
            onClick: () => router.push('/coach'),
          },
        });
        return;
      }
      if (payload.result?.status === 'existing') {
        toast.info('Esta atencion ya cuenta con una recomendacion.', {
          action: {
            label: 'Ver',
            onClick: () => router.push('/coach'),
          },
        });
        return;
      }

      const reasonMessages: Record<string, string> = {
        disabled: 'Un administrador debe activar el Coach IA.',
        ai_in_control:
          'No se analiza esta conversacion porque esta bajo control del Agente IA.',
        unassigned:
          'Asigna la conversacion a un ejecutivo antes de analizarla.',
        insufficient_human_messages:
          'Aun faltan respuestas humanas para generar una recomendacion util.',
        ai_unavailable:
          'La Inteligencia Artificial de Nexora no esta disponible en este momento.',
      };
      toast.info(
        reasonMessages[payload.result?.reason ?? ''] ||
          'La conversacion todavia no cumple las condiciones de analisis.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo analizar la conversacion'
      );
    } finally {
      setCoachActionLoading(false);
    }
  }, [coachActionLoading, conversation, router]);

  const toggleResolutionTag = useCallback((tagId: string) => {
    setResolutionTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentId) => currentId !== tagId)
        : [...current, tagId]
    );
  }, []);

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      }
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = `temp-${Date.now()}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: 'agent',
        sender_id: user?.id,
        content_type: 'template',
        content_text: renderedBody,
        template_name: template.name,
        status: 'sending',
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: 'template',
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error('Failed to send template:', reason);
          toast.error(`Failed to send template: ${reason}`);
          onUpdateMessage(tempId, { status: 'failed' });
          return;
        }

        onUpdateMessage(tempId, {
          ...(typeof payload?.message_id === 'string'
            ? { id: payload.message_id }
            : {}),
          ...(typeof payload?.whatsapp_message_id === 'string'
            ? { message_id: payload.whatsapp_message_id }
            : {}),
          status: 'sent',
        });
      } catch (err) {
        console.error('Failed to send template:', err);
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Failed to send template: ${reason}`);
        onUpdateMessage(tempId, { status: 'failed' });
      }
    },
    [conversation, onNewMessage, onUpdateMessage, user?.id]
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const senderLabelFor = useCallback(
    (message: Message): string =>
      messageSenderLabel({
        message,
        contact,
        profiles,
        assignedAgentId: conversation?.assigned_agent_id,
      }),
    [contact, conversation?.assigned_agent_id, profiles]
  );

  // Reuse the visible sender label inside reply quotes so the attribution is
  // consistent between the original bubble and its quoted preview.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      return senderLabelFor(m);
    },
    [senderLabelFor]
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg),
      });
    },
    [authorLabelFor]
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn('[reactions] missing user or conversation');
        return;
      }
      if (messageId.startsWith('temp-')) {
        toast.error('Wait for the message to finish sending');
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === 'agent' &&
            r.actor_id === userId
        );
        if (emoji === '') return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            message_id: messageId,
            conversation_id: convId,
            actor_type: 'agent',
            actor_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetch('/api/whatsapp/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'network error';
        toast.error(`Reaction failed: ${reason}`);
        setReactions(snapshot);
      }
    },
    [conversation, user?.id]
  );

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      await performTicketAction({
        action: 'transfer',
        assignedAgentId: agentId,
        departmentId: conversation?.department_id ?? null,
      });
    },
    [conversation?.department_id, performTicketAction]
  );

  const handleDepartmentChange = useCallback(
    async (departmentId: string) => {
      await performTicketAction({ action: 'department', departmentId });
    },
    [performTicketAction]
  );

  // Empty state — same WhatsApp-style doodle background as the active
  // thread below, so swapping between empty/selected doesn't change the
  // pattern under the user's eye.
  if (!conversation || !contact) {
    return (
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center',
          DOODLE_BG_CLASSES
        )}
      >
        <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
          <MessageSquare className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="text-muted-foreground mt-4 text-base font-medium">
          Select a conversation
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose a conversation from the left to start messaging
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const conversationChannel = resolveConversationChannel(conversation.channel);
  const channelMeta = getChannelMeta(conversationChannel);
  const isWhatsAppChannel = conversationChannel === 'whatsapp';
  const hasWhatsAppCustomerCareWindow =
    requiresWhatsAppCustomerCareWindow(conversation);
  const hasCustomerCareWindow =
    hasWhatsAppCustomerCareWindow || !isWhatsAppChannel;
  const socialChannelConnected =
    !isWhatsAppChannel &&
    conversation.channel_connection?.status === 'connected';
  const messageGroups = groupMessagesByDate(messages);
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? 'Ejecutivo asignado')
    : 'Asignar';
  const leadOwnedByCurrentUser = assignedAgentId === user?.id;
  const canTakeLead =
    conversation.status === 'pending' && assignedAgentId === null;
  const currentDepartment = departments.find(
    (department) => department.id === conversation.department_id
  );
  const canInterveneInAnyTicket =
    accountRole === 'owner' ||
    accountRole === 'admin' ||
    accountRole === 'supervisor';
  const aiHandling = ['ai_active', 'ai_after_hours'].includes(
    conversation.ai_state ?? 'idle'
  );
  const aiIndicator = getConversationAiIndicator(conversation);
  const canControlAi =
    Boolean(assignedAgentId) &&
    (canInterveneInAnyTicket || assignedAgentId === user?.id) &&
    ['open', 'waiting'].includes(conversation.status);
  const canRequestCoach =
    Boolean(assignedAgentId) &&
    !aiHandling &&
    (canInterveneInAnyTicket || assignedAgentId === user?.id);

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' break-words / max-w caps apply.
    // Issue #257.
    <div
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        DOODLE_BG_CLASSES
      )}
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {fileDragActive && (
        <div className="border-primary/60 bg-background/90 pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed shadow-2xl backdrop-blur-sm">
          <div className="text-center">
            <span className="bg-primary/10 mx-auto flex size-14 items-center justify-center rounded-2xl">
              <UploadCloud className="text-primary size-7" />
            </span>
            <p className="text-foreground mt-3 text-sm font-semibold">
              Suelta el archivo para adjuntarlo
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Podrás revisarlo antes de enviarlo
            </p>
          </div>
        </div>
      )}
      {/* Header — solid card surface sits on top of the doodle so the
          name/avatar/dropdowns stay legible. */}
      <div className="border-border/60 bg-card/95 flex shrink-0 flex-col gap-1.5 border-b px-2.5 py-2 backdrop-blur-xl sm:gap-2 sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 flex-shrink-0 items-center justify-center rounded-xl sm:size-11 lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="bg-muted text-foreground flex size-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:size-10">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground truncate text-base font-semibold tracking-[-0.025em]">
              {displayName}
            </h2>
            <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-sm">
              <span className="truncate">{contact.phone}</span>
              <span aria-hidden="true">·</span>
              <ChannelBadge channel={conversationChannel} />
              {conversationChannel === 'whatsapp' &&
                conversation.whatsapp_config?.connection_name && (
                  <span
                    className="border-primary/25 bg-primary/8 text-primary hidden max-w-28 truncate rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline"
                    title={
                      conversation.whatsapp_config.display_phone
                        ? `${conversation.whatsapp_config.connection_name} · +${conversation.whatsapp_config.display_phone}`
                        : conversation.whatsapp_config.connection_name
                    }
                  >
                    {conversation.whatsapp_config.connection_name}
                  </span>
                )}
            </div>
          </div>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          {hasCustomerCareWindow && (
            <Badge
              variant="outline"
              className={cn(
                'border-border ml-1 hidden gap-1 text-[10px] sm:ml-2 sm:inline-flex',
                sessionInfo.expired ? 'text-red-400' : 'text-primary'
              )}
            >
              <Clock className="h-3 w-3" />
              {sessionInfo.remaining}
            </Badge>
          )}
          {aiIndicator && (
            <Badge className="border-primary/25 bg-primary/10 text-primary ml-1 hidden gap-1 border text-[10px] sm:inline-flex">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  aiIndicator.active ? 'bg-primary animate-pulse' : 'bg-current'
                )}
              />
              {aiIndicator.label}
            </Badge>
          )}
          {onOpenContactPanel ? (
            <button
              type="button"
              onClick={onOpenContactPanel}
              aria-label="Abrir ficha del cliente"
              title="Ficha del cliente"
              className="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 lg:hidden"
            >
              <Info className="size-5" />
            </button>
          ) : null}
        </div>

        <div className="border-border/50 -mx-2.5 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 border-t px-2.5 pt-2 pb-0.5 sm:mx-0 sm:flex sm:flex-nowrap sm:gap-2 sm:overflow-hidden sm:px-0 sm:pb-0">
          {/* Contact-panel toggle — desktop only. The contact sidebar
              eats a chunk of horizontal width that crowds the thread on
              smaller laptops; this lets agents reclaim it when they just
              want to read and reply. Hidden on mobile, where the sidebar
              never renders as a permanent panel anyway. Issue #258. */}
          {onToggleContactPanel && (
            <button
              type="button"
              onClick={onToggleContactPanel}
              aria-label={
                contactPanelOpen ? 'Hide contact panel' : 'Show contact panel'
              }
              aria-pressed={contactPanelOpen}
              title={contactPanelOpen ? 'Hide contact' : 'Show contact'}
              className={cn(
                'hover:bg-muted hover:text-foreground hidden size-9 items-center justify-center rounded-xl transition-colors lg:inline-flex',
                contactPanelOpen ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {contactPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Manual refresh — forces a refetch of the messages + the
              conversation list (the parent bumps its resyncToken). Useful
              when realtime missed an event or the agent just wants to be
              sure nothing's stale. Only rendered when the parent wires
              up `onRefresh`. */}
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label="Refresh conversation"
              title="Refresh"
              className={cn(
                'text-muted-foreground hover:bg-muted hover:text-foreground hidden size-11 items-center justify-center rounded-xl transition-colors disabled:opacity-60 sm:inline-flex sm:size-9'
              )}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              />
            </button>
          )}

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="hover:bg-muted inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2 whitespace-nowrap sm:h-9">
              <TicketStatusBadge status={conversation.status} />
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-popover"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  disabled={
                    opt.value === conversation.status ||
                    (opt.value === 'closed' &&
                      conversation.status === 'pending')
                  }
                  className={cn('text-sm', opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canTakeLead ? (
            <button
              type="button"
              onClick={async () => {
                if (
                  !window.confirm(
                    '¿Quieres tomar este lead? La IA se pausará y el lead quedará asignado a ti.'
                  )
                ) {
                  return;
                }
                const ticket = await performTicketAction({
                  action: 'accept',
                  confirmed: true,
                });
                if (ticket) {
                  toast.success(
                    'Lead tomado y protegido. Si el cliente vuelve después de resolverlo, regresará a tu bandeja.'
                  );
                }
              }}
              disabled={ticketActionLoading}
              title="Asignarte este lead y proteger la conversación para ti"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold whitespace-nowrap shadow-sm disabled:opacity-60 sm:h-9 sm:shrink-0 sm:gap-2 sm:px-3"
            >
              {ticketActionLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LockKeyhole className="size-3.5" />
              )}
              <span className="truncate sm:hidden">Tomar</span>
              <span className="hidden sm:inline">Tomar lead</span>
            </button>
          ) : assignedAgentId ? (
            <span
              className={cn(
                'inline-flex h-11 min-w-0 items-center gap-1.5 rounded-xl border px-2 text-sm font-semibold whitespace-nowrap sm:h-9 sm:max-w-64 sm:flex-1 sm:gap-2 sm:px-3',
                leadOwnedByCurrentUser
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-border bg-muted/50 text-muted-foreground'
              )}
              title={
                leadOwnedByCurrentUser
                  ? 'Este lead está asignado a ti y volverá a tu bandeja si el cliente escribe nuevamente'
                  : `Lead protegido para ${assignLabel}`
              }
            >
              <LockKeyhole className="size-3.5" />
              <span className="truncate">
                {leadOwnedByCurrentUser
                  ? 'Protegido'
                  : `Atiende: ${assignLabel}`}
              </span>
            </span>
          ) : null}

          <button
            type="button"
            disabled={!canControlAi || ticketActionLoading}
            onClick={async () => {
              const ticket = await performTicketAction({
                action: aiHandling ? 'take_ai' : 'delegate_ai',
              });
              if (ticket) {
                toast.success(
                  aiHandling
                    ? 'Conversación tomada por el equipo.'
                    : 'El Agente IA atenderá los próximos mensajes.'
                );
              }
            }}
            title={
              aiHandling
                ? 'Pausar la IA y tomar la conversación'
                : 'Mantener al ejecutivo asignado y delegar temporalmente a la IA'
            }
            aria-label={aiHandling ? 'Tomar conversación' : 'Dejar con IA'}
            className={cn(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-auto sm:gap-2 sm:px-3',
              aiHandling
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 border'
            )}
          >
            {ticketActionLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : aiHandling ? (
              <UserCheck className="size-3.5" />
            ) : (
              <Bot className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {aiHandling ? 'Tomar conversación' : 'Dejar con IA'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setQuotationOpen(true)}
            aria-label="Crear cotización"
            title="Cotizar"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold whitespace-nowrap shadow-lg transition-all hover:-translate-y-0.5 sm:h-9 sm:w-auto sm:gap-2 sm:px-3"
          >
            <ReceiptText className="size-4" />
            <span className="hidden sm:inline">Cotizar</span>
          </button>
        </div>
      </div>

      <div className="border-border/60 bg-card/92 grid shrink-0 grid-cols-4 items-center gap-1 border-b px-2 py-1.5 sm:flex sm:flex-nowrap sm:gap-2 sm:overflow-hidden sm:px-5 sm:py-2">
        <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-nowrap sm:items-center sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border text-foreground hover:bg-muted inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-xs sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm">
              <Building2 className="size-3.5" />
              <span className="min-w-0 truncate sm:max-w-32">
                {currentDepartment?.name ?? 'Sin departamento'}
              </span>
              <ChevronDown className="hidden size-3 sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {departments.map((department) => (
                <DropdownMenuItem
                  key={department.id}
                  onClick={() => handleDepartmentChange(department.id)}
                  className="text-popover-foreground text-sm"
                >
                  <span
                    className="mr-2 size-2 rounded-full"
                    style={{ backgroundColor: department.color }}
                  />
                  <span className="flex-1">{department.name}</span>
                  {department.id === conversation.department_id && (
                    <Check className="ml-2 size-3" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="border-border text-foreground hover:bg-muted inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-xs sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm">
              <ArrowRightLeft className="size-3.5" />
              <span className="truncate">Transferir</span>
              <ChevronDown className="hidden size-3 sm:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {profiles
                .filter((profile) => profile.account_role !== 'viewer')
                .map((profile) => (
                  <DropdownMenuItem
                    key={profile.user_id}
                    onClick={() => handleAssignChange(profile.user_id)}
                    className="text-popover-foreground text-sm"
                  >
                    <UserPlus className="mr-2 size-3.5" />
                    {profile.full_name || profile.email}
                  </DropdownMenuItem>
                ))}
              {assignedAgentId && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={() => handleAssignChange(null)}
                    className="text-muted-foreground text-sm"
                  >
                    Quitar asignación
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            disabled={
              ticketActionLoading ||
              !['open', 'waiting'].includes(conversation.status)
            }
            onClick={() =>
              handleStatusChange(
                conversation.status === 'waiting' ? 'open' : 'waiting'
              )
            }
            className="border-border text-foreground hover:bg-muted inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm"
          >
            <PauseCircle className="size-3.5" />
            <span className="truncate">
              {conversation.status === 'waiting' ? 'Retomar' : 'En espera'}
            </span>
          </button>

          {conversation.status === 'closed' ? (
            <button
              type="button"
              onClick={() => handleStatusChange('open')}
              className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm"
            >
              <RotateCcw className="size-3.5" />
              Reabrir
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStatusChange('closed')}
              disabled={
                ticketActionLoading || conversation.status === 'pending'
              }
              title={
                conversation.status === 'pending'
                  ? 'Primero debes aceptar el ticket'
                  : 'Resolver con etiqueta y nota obligatorias'
              }
              className="border-border bg-background text-foreground hover:bg-muted inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm"
            >
              <CheckCircle2 className="size-3.5" />
              Resolver
            </button>
          )}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          <QuickReplyPicker
            compact
            departmentId={conversation.department_id}
            onSelect={(reply: QuickReply) =>
              setComposerInsertion({
                id: `${reply.id}:${Date.now()}`,
                text: reply.body,
              })
            }
          />
          <button
            type="button"
            onClick={() => {
              if (!contactPanelOpen) onToggleContactPanel?.();
            }}
            disabled={!onToggleContactPanel}
            aria-label="Abrir notas internas"
            title="Las notas internas están en la ficha del cliente"
            className="text-muted-foreground hover:bg-muted hover:text-foreground hidden size-9 items-center justify-center rounded-xl disabled:opacity-50 sm:inline-flex"
          >
            <StickyNote className="size-3.5" />
          </button>
          {canRequestCoach && (
            <button
              type="button"
              onClick={handleCoachAnalysis}
              disabled={coachActionLoading}
              aria-label="Analizar atención"
              title="Analiza solo las respuestas humanas de esta conversacion"
              className="border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 hidden size-9 items-center justify-center rounded-xl border disabled:opacity-50 sm:inline-flex"
            >
              {coachActionLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BrainCircuit className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {aiIndicator && (
        <div className="border-primary/20 bg-primary/5 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
              <Bot className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{aiIndicator.label}</p>
              <p className="text-muted-foreground truncate text-xs">
                {aiIndicator.detail}
              </p>
            </div>
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span>
              Ejecutivo:{' '}
              <strong className="text-foreground">{assignLabel}</strong>
            </span>
            {(conversation.after_hours_ai_reply_count ?? 0) > 0 && (
              <span>
                Respuestas de cobertura:{' '}
                <strong className="text-foreground">
                  {conversation.after_hours_ai_reply_count}
                </strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">No messages yet</p>
            <p className="text-muted-foreground text-xs">
              Send a template to start the conversation
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-3 flex items-center justify-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[10px] font-medium">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const parent = msg.reply_to_message_id
                      ? messagesById.get(msg.reply_to_message_id)
                      : null;
                    const reply = parent
                      ? {
                          authorLabel: authorLabelFor(parent),
                          preview: buildReplyPreview(parent),
                        }
                      : null;
                    const msgReactions = reactionsByMessageId.get(msg.id);
                    // Toggle is computed at the call site — `msgReactions`
                    // and `user?.id` are already in scope, no extra hook.
                    const handlePillToggle = (emoji: string) => {
                      const own = msgReactions?.find(
                        (r) =>
                          r.actor_type === 'agent' && r.actor_id === user?.id
                      );
                      const next = own?.emoji === emoji ? '' : emoji;
                      void postReaction(msg.id, next);
                    };
                    return (
                      <MessageActions
                        key={msg.id}
                        message={msg}
                        onReply={() => handleStartReply(msg)}
                        onReact={(emoji) => {
                          if (emoji) void postReaction(msg.id, emoji);
                        }}
                        canReact={isWhatsAppChannel}
                      >
                        <MessageBubble
                          message={msg}
                          senderLabel={senderLabelFor(msg)}
                          reply={reply}
                          reactions={msgReactions}
                          currentUserId={user?.id}
                          onToggleReaction={handlePillToggle}
                        />
                      </MessageActions>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        departmentId={conversation.department_id}
        sessionExpired={hasCustomerCareWindow && sessionInfo.expired}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        insertDraft={composerInsertion}
        droppedAttachment={droppedAttachment}
        textOnly={!isWhatsAppChannel}
        channelUnavailableReason={
          isWhatsAppChannel || socialChannelConnected
            ? undefined
            : `La conexión de ${channelMeta.label} no está activa. Revísala en Ajustes → Canales.`
        }
        ticketLocked={
          conversation.status === 'pending' ||
          conversation.status === 'closed' ||
          aiHandling ||
          (!canInterveneInAnyTicket && assignedAgentId !== user?.id)
        }
      />

      <Sheet open={quotationOpen} onOpenChange={setQuotationOpen}>
        <SheetContent
          side="right"
          className="w-[min(96vw,1180px)] max-w-[1180px] gap-0 overflow-y-auto sm:max-w-[1180px]"
        >
          <SheetHeader className="border-border bg-popover sticky top-0 z-20 border-b pr-14">
            <SheetTitle>Nueva cotización para {displayName}</SheetTitle>
            <SheetDescription>
              Completa, previsualiza y guarda sin salir de la conversación.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 sm:p-6">
            <QuotationEditor
              conversationId={conversation.id}
              embedded
              onCancel={() => setQuotationOpen(false)}
              onSaved={() => setQuotationOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {isWhatsAppChannel && (
        <TemplatePicker
          open={templateModalOpen}
          onOpenChange={setTemplateModalOpen}
          onSelect={handleSendTemplate}
        />
      )}

      <Dialog
        open={resolutionDialogOpen}
        onOpenChange={(open) => {
          if (!ticketActionLoading) setResolutionDialogOpen(open);
        }}
      >
        <DialogContent className="h-[min(44rem,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-border bg-muted/30 border-b px-6 py-5 pr-14">
            <DialogTitle className="flex items-center gap-3 text-lg">
              <span className="bg-primary/10 flex size-9 items-center justify-center rounded-xl">
                <CheckCircle2 className="text-primary size-5" />
              </span>
              Resolver conversación
            </DialogTitle>
            <DialogDescription>
              Cierre de {contact?.name || contact?.phone || 'este contacto'}.
              Selecciona una etiqueta y registra el motivo para el historial
              administrativo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-5 overflow-y-auto px-6 py-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <div className="border-border bg-background flex min-h-72 flex-col rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-foreground flex items-center gap-2 text-sm font-medium">
                  <Tags className="size-4" />
                  Etiqueta de resolución
                  <span className="text-destructive">*</span>
                </label>
                <span className="text-muted-foreground text-xs">
                  {resolutionTagIds.length} seleccionada
                  {resolutionTagIds.length === 1 ? '' : 's'}
                </span>
              </div>

              {resolutionTagsLoading ? (
                <div className="border-border text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Cargando etiquetas...
                </div>
              ) : resolutionTags.length === 0 ? (
                <div className="border-border bg-muted/40 rounded-xl border border-dashed p-4 text-sm">
                  <p className="text-foreground font-medium">
                    No hay etiquetas disponibles
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Un administrador debe crear al menos una en Configuración →
                    Tickets antes de poder resolver conversaciones.
                  </p>
                </div>
              ) : (
                <div className="grid max-h-[25rem] grid-cols-1 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2 md:flex-1 md:grid-cols-1">
                  {resolutionTags.map((tag) => {
                    const selected = resolutionTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleResolutionTag(tag.id)}
                        className={cn(
                          'inline-flex w-full items-center justify-start gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-all',
                          selected
                            ? 'ring-primary/30 ring-2'
                            : 'opacity-75 hover:opacity-100'
                        )}
                        style={{
                          color: tag.color,
                          borderColor: `${tag.color}${selected ? 'aa' : '55'}`,
                          backgroundColor: `${tag.color}${selected ? '24' : '10'}`,
                        }}
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                        {selected ? <Check className="size-3" /> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-border bg-background flex min-h-72 flex-col rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="resolution-note"
                  className="text-foreground text-sm font-medium"
                >
                  Motivo y observaciones{' '}
                  <span className="text-destructive">*</span>
                </label>
                <span className="text-muted-foreground text-xs">
                  {resolutionNote.length}/5000
                </span>
              </div>
              <Textarea
                id="resolution-note"
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                maxLength={5000}
                rows={12}
                placeholder="Ej.: Cliente confirmó que su consulta fue resuelta y no requiere seguimiento adicional."
                disabled={ticketActionLoading}
                className="min-h-64 flex-1 resize-none text-sm leading-relaxed"
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Es una nota interna: el cliente no la recibirá por WhatsApp.
              </p>
            </div>
          </div>

          <DialogFooter className="border-border bg-muted/30 mx-0 mb-0 rounded-none px-6 py-4 sm:items-center">
            <p className="text-muted-foreground mr-auto hidden text-xs sm:block">
              La resolución quedará registrada con tu nombre, fecha y hora.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolutionDialogOpen(false)}
              disabled={ticketActionLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleResolveTicket}
              disabled={
                ticketActionLoading ||
                resolutionTagsLoading ||
                resolutionTagIds.length === 0 ||
                !resolutionNote.trim()
              }
            >
              {ticketActionLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Confirmar resolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
