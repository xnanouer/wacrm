'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Notification } from '@/types';
import {
  Bell,
  BrainCircuit,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CheckCheck,
  ClipboardCheck,
  Loader2,
  Sparkles,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TYPE_ICON: Record<Notification['type'], typeof Bell> = {
  conversation_assigned: UserPlus,
  catalog_approval_requested: ClipboardCheck,
  catalog_item_approved: CheckCircle2,
  catalog_item_rejected: XCircle,
  support_booking_confirmed: CalendarCheck2,
  support_booking_rescheduled: CalendarClock,
  support_booking_cancelled: XCircle,
  nexora_points_gift: Sparkles,
  ai_coaching_ready: BrainCircuit,
};

export default function NotificationsPage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (fetchErr) {
      setError(fetchErr.message);
      return;
    }
    setNotifications((data ?? []) as Notification[]);
  }, [accountId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Realtime — new assignments appear without a refresh, and a
  // "mark all read" fired from another tab/device stays in sync here.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('notifications-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (!prev) return [row];
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Notification;
            setNotifications(
              (prev) =>
                prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ??
                prev
            );
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications(
              (prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic — the row is already visually "read" by the time the
      // request lands, so the UI doesn't wait on the round-trip.
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === id && !n.read_at
              ? { ...n, read_at: new Date().toISOString() }
              : n
          ) ?? prev
      );
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (updateErr) {
        toast.error('No fue posible marcar la notificación como leída');
        load();
      }
    },
    [load]
  );

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read_at) markRead(n.id);
      if (n.type === 'ai_coaching_ready') {
        router.push(
          n.coaching_review_id
            ? `/coach?review=${n.coaching_review_id}`
            : '/coach'
        );
      } else if (n.conversation_id) {
        router.push(`/inbox?c=${n.conversation_id}`);
      } else if (n.catalog_item_id) {
        router.push(`/catalogo?item=${n.catalog_item_id}`);
      } else if (n.support_booking_id) {
        router.push('/support');
      } else if (n.type === 'nexora_points_gift') {
        router.push('/plans#nexora-points');
      }
    },
    [markRead, router]
  );

  const unreadIds =
    notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications(
      (prev) =>
        prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev
    );
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .is('read_at', null);
    setMarkingAll(false);
    if (updateErr) {
      toast.error('No fue posible marcar las notificaciones como leídas');
      load();
    }
  }, [unreadIds.length, load]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-destructive text-sm">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (notifications === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="nexora-page-stack">
      <div className="flex items-center justify-between">
        <div>
          <p className="nexora-kicker">Actividad del equipo</p>
          <h1 className="nexora-title mt-2">Notificaciones</h1>
          <p className="nexora-description mt-3">
            Revisa asignaciones y novedades importantes de tu equipo.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadIds.length === 0 || markingAll}
          onClick={markAllRead}
        >
          {markingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCheck className="h-4 w-4" />
          )}
          Marcar todo como leído
        </Button>
      </div>

      {notifications.length === 0 ? (
        <div className="border-border bg-muted/30 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center">
          <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-xl">
            <Bell className="text-primary h-6 w-6" />
          </div>
          <p className="text-foreground mt-4 text-base font-semibold">
            Todavía no tienes notificaciones
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Los avisos de conversaciones y aprobaciones aparecerán aquí.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            const isUnread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    'flex min-h-20 w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5',
                    isUnread
                      ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                      : 'border-border bg-card hover:border-border/70'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
                      isUnread ? 'bg-primary/15' : 'bg-muted'
                    )}
                    aria-hidden
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        isUnread ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'truncate text-sm font-semibold',
                          isUnread ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {n.title}
                      </span>
                      {isUnread && (
                        <span
                          aria-label="Unread"
                          className="bg-primary h-2 w-2 flex-shrink-0 rounded-full"
                        />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {n.body}
                      </p>
                    )}
                    <p className="text-muted-foreground/70 mt-1 text-[11px]">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
