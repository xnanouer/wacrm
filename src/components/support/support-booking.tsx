'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';

interface Slot {
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export function SupportBooking() {
  const { profile, account } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    starts_at: string;
    meeting_url: string | null;
  } | null>(null);
  const [googleSynced, setGoogleSynced] = useState(false);

  useEffect(() => {
    setName(profile?.full_name ?? '');
    setEmail(profile?.email ?? '');
  }, [profile]);
  useEffect(() => {
    void Promise.all([
      fetch('/api/support/slots', { cache: 'no-store' }).then((response) =>
        response.json()
      ),
      fetch('/api/support/conversations', { cache: 'no-store' }).then(
        (response) => response.json()
      ),
    ])
      .then(([slotData, conversationData]) => {
        setReady(slotData.ready === true);
        setGoogleConnected(slotData.googleConnected === true);
        setSlots(slotData.slots ?? []);
        setMessage(slotData.message ?? '');
        const conversation =
          conversationData.conversations?.find(
            (item: { status: string }) => item.status === 'escalated'
          ) ?? conversationData.conversations?.[0];
        if (conversation) {
          setConversationId(conversation.id);
          const assistant = [...(conversation.platform_support_messages ?? [])]
            .reverse()
            .find(
              (item: { metadata?: { ticket_id?: string } }) =>
                item.metadata?.ticket_id
            );
          setTicketId(assistant?.metadata?.ticket_id ?? null);
        }
      })
      .catch(() => {
        setReady(false);
        setMessage('No se pudo consultar la disponibilidad.');
      });
  }, []);

  async function book(event: FormEvent) {
    event.preventDefault();
    if (!selected || !conversationId)
      return toast.error(
        'Primero conversa con Nexora Asistente y selecciona un horario.'
      );
    setSaving(true);
    try {
      const response = await fetch('/api/support/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          ticketId,
          attendeeName: name,
          attendeeEmail: email,
          reason,
          startsAt: selected.startsAt,
          endsAt: selected.endsAt,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? 'No se pudo reservar.');
      setConfirmed(payload.booking);
      setGoogleSynced(payload.googleSynced === true);
      toast.success('Sesión guardada en el Calendario Nexora.');
      if (payload.warning) toast.warning(payload.warning);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo reservar.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (confirmed)
    return (
      <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <CheckCircle2 className="mb-3 size-7 text-emerald-500" />
        <h2 className="text-xl font-semibold">Reunión confirmada</h2>
        <p className="mt-2 text-sm">
          Tu sesión quedó guardada en el Calendario Nexora para{' '}
          {new Intl.DateTimeFormat('es-CL', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'America/Santiago',
          }).format(new Date(confirmed.starts_at))}
          , hora de Chile.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          {googleSynced
            ? 'También fue sincronizada con Google Calendar y la invitación se envió a tu correo.'
            : 'Nexora administrará esta reserva directamente, sin depender de Google Calendar.'}
        </p>
        {confirmed.meeting_url && (
          <Button
            className="mt-4"
            nativeButton={false}
            render={
              <a
                href={confirmed.meeting_url}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Abrir Google Meet
          </Button>
        )}
      </section>
    );

  return (
    <section className="surface-elevated rounded-3xl p-6">
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarDays className="text-primary size-5" /> Agendar soporte
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Empresa: {account?.name ?? 'Tu empresa'}. Solo se muestran horarios
          realmente disponibles.
        </p>
      </div>
      {ready === null ? (
        <p className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" /> Consultando el
          Calendario Nexora...
        </p>
      ) : !ready ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
          {message ||
            'No se pudo consultar el Calendario Nexora en este momento.'}
        </div>
      ) : (
        <form onSubmit={book} className="space-y-5">
          <div className="border-primary/20 bg-primary/8 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">Reserva administrada por Nexora</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {googleConnected
                ? 'Google Calendar está conectado como sincronización adicional.'
                : 'La sesión se confirmará en Nexora aunque Google Calendar no esté conectado.'}
            </p>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                onClick={() => setSelected(slot)}
                className={`rounded-xl border p-3 text-left text-xs ${selected?.startsAt === slot.startsAt ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
              >
                <span className="block font-semibold">
                  {new Intl.DateTimeFormat('es-CL', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    timeZone: slot.timezone,
                  }).format(new Date(slot.startsAt))}
                </span>
                <span>
                  {new Intl.DateTimeFormat('es-CL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: slot.timezone,
                  }).format(new Date(slot.startsAt))}
                </span>
              </button>
            ))}
          </div>
          {!slots.length && (
            <p className="text-muted-foreground text-sm">
              No hay horarios disponibles en los próximos días.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre"
            />
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="Correo"
            />
          </div>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo de la reunión"
          />
          <Button type="submit" disabled={!selected || saving}>
            {saving ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CalendarDays />
            )}{' '}
            Confirmar reunión
          </Button>
        </form>
      )}
    </section>
  );
}
