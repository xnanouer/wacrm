'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  UserRound,
  Video,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface NexoraCalendarBooking {
  id: string;
  support_ticket_id: string | null;
  user_id: string;
  account_id: string;
  attendee_name: string;
  attendee_email: string;
  reason: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  provider: string;
  meeting_url: string | null;
  external_event_id: string | null;
  external_sync_status: string;
  external_sync_error: string | null;
}

interface Slot {
  startsAt: string;
  endsAt: string;
  timezone: string;
}

interface Props {
  bookings: NexoraCalendarBooking[];
  accounts: Array<{ id: string; name: string }>;
  onRefresh: () => Promise<void>;
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const STATUS_META: Record<
  string,
  { label: string; dot: string; pill: string }
> = {
  pending: {
    label: 'Pendiente',
    dot: 'bg-amber-400',
    pill: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  confirmed: {
    label: 'Confirmada',
    dot: 'bg-emerald-400',
    pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  completed: {
    label: 'Completada',
    dot: 'bg-sky-400',
    pill: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  },
  no_show: {
    label: 'No asistió',
    dot: 'bg-rose-400',
    pill: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  },
  cancelled: {
    label: 'Cancelada',
    dot: 'bg-muted-foreground',
    pill: 'border-border bg-muted text-muted-foreground',
  },
};

function dateKey(value: string | Date, timezone = 'America/Santiago') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function buildMonthDays(cursor: Date) {
  const first = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)
  );
  const firstCell = new Date(first);
  firstCell.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setUTCDate(firstCell.getUTCDate() + index);
    return day;
  });
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatFullDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

export function NexoraSupportCalendar({
  bookings,
  accounts,
  onRefresh,
}: Props) {
  const today = dateKey(new Date());
  const [cursor, setCursor] = useState(
    () => new Date(`${today.slice(0, 7)}-01T12:00:00Z`)
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState('active');
  const [rescheduling, setRescheduling] =
    useState<NexoraCalendarBooking | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  const companyNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts]
  );
  const visibleBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'closed')
          return ['completed', 'cancelled', 'no_show'].includes(booking.status);
        return ['pending', 'confirmed'].includes(booking.status);
      }),
    [bookings, statusFilter]
  );
  const grouped = useMemo(() => {
    const result = new Map<string, NexoraCalendarBooking[]>();
    for (const booking of visibleBookings) {
      const key = dateKey(booking.starts_at, booking.timezone);
      result.set(key, [...(result.get(key) ?? []), booking]);
    }
    for (const values of result.values()) {
      values.sort(
        (left, right) => +new Date(left.starts_at) - +new Date(right.starts_at)
      );
    }
    return result;
  }, [visibleBookings]);
  const monthDays = useMemo(() => buildMonthDays(cursor), [cursor]);
  const selectedBookings = grouped.get(selectedDate) ?? [];
  const monthLabel = new Intl.DateTimeFormat('es-CL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(cursor);

  async function runAction(payload: Record<string, unknown>) {
    const response = await fetch('/api/platform/support/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? 'No se pudo guardar.');
    if (result.warning) toast.warning(result.warning);
    await onRefresh();
    return result;
  }

  async function openReschedule(booking: NexoraCalendarBooking) {
    setRescheduling(booking);
    setSelectedSlot(null);
    setLoadingSlots(true);
    try {
      const response = await fetch('/api/platform/support/calendar/slots', {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? 'No se pudieron cargar los horarios.');
      setSlots(payload.slots ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudieron cargar.'
      );
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function confirmReschedule() {
    if (!rescheduling || !selectedSlot) return;
    setSaving(true);
    try {
      await runAction({
        action: 'reschedule_booking',
        bookingId: rescheduling.id,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        timezone: selectedSlot.timezone,
      });
      setSelectedDate(dateKey(selectedSlot.startsAt, selectedSlot.timezone));
      setRescheduling(null);
      toast.success('Sesión reprogramada en el Calendario Nexora.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo reprogramar.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(booking: NexoraCalendarBooking) {
    if (!window.confirm('¿Cancelar esta sesión de soporte?')) return;
    try {
      await runAction({ action: 'cancel_booking', bookingId: booking.id });
      toast.success('Sesión cancelada en Nexora.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cancelar.'
      );
    }
  }

  async function setBookingStatus(
    booking: NexoraCalendarBooking,
    status: 'completed' | 'no_show'
  ) {
    try {
      await runAction({
        action: 'booking_status',
        bookingId: booking.id,
        status,
      });
      toast.success(
        status === 'completed'
          ? 'Sesión marcada como completada.'
          : 'Sesión marcada como no asistida.'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar.'
      );
    }
  }

  return (
    <div className="space-y-4">
      <section className="surface-elevated overflow-hidden rounded-3xl">
        <div className="border-border flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-primary text-xs font-bold tracking-[.16em] uppercase">
              Calendario Nexora
            </p>
            <h2 className="mt-1 text-2xl font-bold capitalize">{monthLabel}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Nexora conserva y administra todas las sesiones, con Google como
              sincronización opcional.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="border-input bg-background h-10 rounded-xl border px-3 text-sm"
              aria-label="Filtrar sesiones"
            >
              <option value="active">Próximas y activas</option>
              <option value="closed">Finalizadas</option>
              <option value="all">Todas</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mes anterior"
              onClick={() =>
                setCursor(
                  new Date(
                    Date.UTC(
                      cursor.getUTCFullYear(),
                      cursor.getUTCMonth() - 1,
                      1,
                      12
                    )
                  )
                )
              }
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCursor(new Date(`${today.slice(0, 7)}-01T12:00:00Z`));
                setSelectedDate(today);
              }}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mes siguiente"
              onClick={() =>
                setCursor(
                  new Date(
                    Date.UTC(
                      cursor.getUTCFullYear(),
                      cursor.getUTCMonth() + 1,
                      1,
                      12
                    )
                  )
                )
              }
            >
              <ChevronRight />
            </Button>
            <Button variant="outline" onClick={() => void onRefresh()}>
              <RefreshCw /> Actualizar
            </Button>
          </div>
        </div>

        <div className="grid xl:grid-cols-[minmax(720px,1fr)_380px]">
          <div className="nexora-scrollbar overflow-x-auto p-3 sm:p-5">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="text-muted-foreground px-2 pb-3 text-center text-[11px] font-bold tracking-wider uppercase"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="border-border grid grid-cols-7 overflow-hidden rounded-2xl border">
                {monthDays.map((day) => {
                  const key = day.toISOString().slice(0, 10);
                  const dayBookings = grouped.get(key) ?? [];
                  const inMonth = day.getUTCMonth() === cursor.getUTCMonth();
                  const selected = key === selectedDate;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(key)}
                      className={cn(
                        'border-border hover:bg-primary/5 min-h-28 border-r border-b p-2 text-left transition-colors last:border-r-0',
                        !inMonth && 'bg-muted/15 text-muted-foreground/45',
                        selected &&
                          'bg-primary/8 ring-primary ring-1 ring-inset'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                          key === today &&
                            'bg-primary text-primary-foreground shadow-primary/25 shadow-lg'
                        )}
                      >
                        {day.getUTCDate()}
                      </span>
                      <span className="mt-2 block space-y-1">
                        {dayBookings.slice(0, 3).map((booking) => {
                          const meta =
                            STATUS_META[booking.status] ?? STATUS_META.pending;
                          return (
                            <span
                              key={booking.id}
                              className="bg-card/80 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px]"
                            >
                              <span
                                className={cn(
                                  'size-1.5 rounded-full',
                                  meta.dot
                                )}
                              />
                              <span className="truncate">
                                {formatTime(
                                  booking.starts_at,
                                  booking.timezone
                                )}{' '}
                                {booking.attendee_name}
                              </span>
                            </span>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <span className="text-primary block px-1 text-[10px] font-semibold">
                            +{dayBookings.length - 3} sesiones
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="border-border bg-card/35 border-t p-5 xl:border-t-0 xl:border-l">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs font-semibold uppercase">
                  Agenda del día
                </p>
                <h3 className="mt-1 font-semibold">
                  {new Intl.DateTimeFormat('es-CL', {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(`${selectedDate}T12:00:00Z`))}
                </h3>
              </div>
              <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-semibold">
                {selectedBookings.length}
              </span>
            </div>
            <div className="nexora-scrollbar mt-4 max-h-[650px] space-y-3 overflow-y-auto pr-1">
              {!selectedBookings.length && (
                <div className="border-border rounded-2xl border border-dashed p-6 text-center">
                  <CalendarCheck2 className="text-muted-foreground mx-auto size-7" />
                  <p className="text-muted-foreground mt-2 text-sm">
                    No hay sesiones para este día.
                  </p>
                </div>
              )}
              {selectedBookings.map((booking) => {
                const meta = STATUS_META[booking.status] ?? STATUS_META.pending;
                const active = ['pending', 'confirmed'].includes(
                  booking.status
                );
                return (
                  <article
                    key={booking.id}
                    className="border-border bg-card rounded-2xl border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 font-semibold">
                          <Clock3 className="text-primary size-4" />
                          {formatTime(
                            booking.starts_at,
                            booking.timezone
                          )} – {formatTime(booking.ends_at, booking.timezone)}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {booking.timezone}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-1 text-[10px] font-semibold',
                          meta.pill
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <p className="flex items-center gap-2">
                        <UserRound className="text-muted-foreground size-4" />
                        {booking.attendee_name}
                      </p>
                      <p className="flex items-center gap-2">
                        <Building2 className="text-muted-foreground size-4" />
                        {companyNames.get(booking.account_id) ?? 'Empresa'}
                      </p>
                      <p className="text-muted-foreground line-clamp-3 text-xs">
                        {booking.reason}
                      </p>
                    </div>
                    {booking.external_sync_status === 'failed' && (
                      <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-xs text-amber-400">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        Guardada en Nexora; la sincronización externa necesita
                        revisión.
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {booking.meeting_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={
                            <a
                              href={booking.meeting_url}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          <Video /> Abrir
                        </Button>
                      )}
                      {active && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openReschedule(booking)}
                          >
                            <RotateCcw /> Reprogramar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void setBookingStatus(booking, 'completed')
                            }
                          >
                            <CheckCircle2 /> Completar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void setBookingStatus(booking, 'no_show')
                            }
                          >
                            No asistió
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void cancelBooking(booking)}
                          >
                            <XCircle /> Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      <Dialog
        open={Boolean(rescheduling)}
        onOpenChange={(open) => {
          if (!open) setRescheduling(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reprogramar sesión</DialogTitle>
            <DialogDescription>
              El horario se actualizará primero en Nexora. Si existe una
              sincronización externa, se actualizará después.
            </DialogDescription>
          </DialogHeader>
          {rescheduling && (
            <div className="border-border bg-muted/30 rounded-xl border p-3 text-sm">
              <p className="font-semibold">{rescheduling.attendee_name}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Horario actual:{' '}
                {formatFullDate(rescheduling.starts_at, rescheduling.timezone)}
              </p>
            </div>
          )}
          {loadingSlots ? (
            <p className="flex items-center gap-2 py-8 text-sm">
              <LoaderCircle className="size-4 animate-spin" /> Consultando el
              Calendario Nexora...
            </p>
          ) : (
            <div className="nexora-scrollbar grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    'border-border hover:bg-muted rounded-xl border p-3 text-left text-xs',
                    selectedSlot?.startsAt === slot.startsAt &&
                      'border-primary bg-primary/10 text-primary'
                  )}
                >
                  <span className="block font-semibold">
                    {new Intl.DateTimeFormat('es-CL', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                      timeZone: slot.timezone,
                    }).format(new Date(slot.startsAt))}
                  </span>
                  <span>{formatTime(slot.startsAt, slot.timezone)}</span>
                </button>
              ))}
              {!slots.length && (
                <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
                  No hay nuevos horarios disponibles.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRescheduling(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmReschedule()}
              disabled={!selectedSlot || saving}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CalendarCheck2 />
              )}
              Confirmar nuevo horario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
