'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { CatalogVehicleVisual } from '@/components/catalog/catalog-vehicle-visual';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCatalogClp } from '@/lib/catalog/config';
import type { CatalogVehicle } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

interface CatalogRecipient {
  id: string;
  status: string;
  lastMessageAt: string | null;
  contact: {
    id: string;
    name: string | null;
    phone: string;
  };
  connection: {
    id: string;
    name: string;
  };
}

interface CatalogSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: CatalogVehicle | null;
}

const DEFAULT_MESSAGE =
  'Hola, te comparto la información de este vehículo que podría interesarte:';

export function CatalogSendDialog({
  open,
  onOpenChange,
  vehicle,
}: CatalogSendDialogProps) {
  const [recipients, setRecipients] = useState<CatalogRecipient[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch('/api/catalog/recipients', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          conversations?: CatalogRecipient[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error || 'No fue posible cargar tus conversaciones.'
          );
        }
        setRecipients(
          Array.isArray(payload?.conversations) ? payload.conversations : []
        );
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar tus conversaciones.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  const filteredRecipients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return recipients;
    return recipients.filter((recipient) =>
      [
        recipient.contact.name,
        recipient.contact.phone,
        recipient.connection.name,
      ].some((value) => value?.toLocaleLowerCase('es').includes(term))
    );
  }, [recipients, search]);

  function handleOpenChange(nextOpen: boolean) {
    if (sending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSearch('');
      setMessage(DEFAULT_MESSAGE);
      setSelectedConversationId(null);
      setError(null);
    }
  }

  async function handleSend() {
    if (!vehicle || !selectedConversationId || !message.trim() || sending) {
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/catalog/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversationId,
          itemIds: [vehicle.id],
          introductionText: message.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        sent?: number;
        imagesSent?: number;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'No fue posible enviar el vehículo.');
      }

      const imagesSent = payload?.imagesSent ?? vehicle.imageCount;
      toast.success(
        `${imagesSent} ${imagesSent === 1 ? 'foto enviada' : 'fotos enviadas'} correctamente por WhatsApp.`
      );
      handleOpenChange(false);
    } catch (sendError) {
      toast.error(
        sendError instanceof Error
          ? sendError.message
          : 'No fue posible enviar el vehículo.'
      );
    } finally {
      setSending(false);
    }
  }

  if (!vehicle) return null;
  const price = vehicle.offerPrice ?? vehicle.listPrice;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border border-b px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3 pr-8">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg">
                Enviar vehículo por WhatsApp
              </DialogTitle>
              <DialogDescription className="mt-1">
                Elige un chat. Se enviarán las {vehicle.imageCount}{' '}
                {vehicle.imageCount === 1 ? 'fotografía' : 'fotografías'} del
                vehículo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 md:grid-cols-[0.85fr_1.15fr]">
          <div className="border-border bg-muted/15 border-b p-5 md:border-r md:border-b-0">
            <div className="border-border bg-card overflow-hidden rounded-2xl border">
              <CatalogVehicleVisual
                tone={vehicle.photoTone}
                label={`${vehicle.make} ${vehicle.model}`}
                imageUrl={vehicle.photoUrl}
              />
              <div className="p-4">
                <p className="font-bold">
                  {vehicle.make} {vehicle.model} {vehicle.year}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {vehicle.version}
                </p>
                <p className="text-primary mt-3 text-xl font-bold">
                  {formatCatalogClp(price)}
                </p>
              </div>
            </div>

            <label
              className="mt-5 block text-sm font-semibold"
              htmlFor="catalog-share-message"
            >
              Mensaje introductorio
            </label>
            <Textarea
              id="catalog-share-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              className="mt-2 min-h-28 resize-none"
            />
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-border border-b p-4 sm:p-5">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar chat, teléfono o conexión"
                  className="h-11 pl-10"
                  autoFocus
                />
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Solo aparecen conversaciones de WhatsApp asignadas que puedes
                atender.
              </p>
            </div>

            <div className="min-h-64 flex-1 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center">
                  <Loader2 className="text-primary size-7 animate-spin" />
                  <p className="mt-3 text-sm font-medium">
                    Cargando tus chats…
                  </p>
                </div>
              ) : error ? (
                <div className="border-destructive/30 bg-destructive/5 text-destructive flex min-h-56 items-center justify-center rounded-2xl border px-6 text-center text-sm">
                  {error}
                </div>
              ) : filteredRecipients.length === 0 ? (
                <div className="border-border flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
                  <UserRound className="text-muted-foreground size-8" />
                  <p className="mt-3 text-sm font-semibold">
                    {recipients.length === 0
                      ? 'No tienes chats de WhatsApp asignados.'
                      : 'No encontramos un chat con esa búsqueda.'}
                  </p>
                  <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                    Toma o recibe una conversación desde la Bandeja antes de
                    enviar una unidad.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRecipients.map((recipient) => {
                    const selected = selectedConversationId === recipient.id;
                    return (
                      <button
                        key={recipient.id}
                        type="button"
                        onClick={() => setSelectedConversationId(recipient.id)}
                        className={cn(
                          'border-border bg-background flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                          selected
                            ? 'border-primary bg-primary/5 ring-primary/15 ring-2'
                            : 'hover:border-primary/35 hover:bg-muted/30'
                        )}
                      >
                        <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-full font-semibold">
                          {(recipient.contact.name || recipient.contact.phone)
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {recipient.contact.name || 'Contacto sin nombre'}
                          </span>
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            {recipient.contact.phone}
                          </span>
                          <span className="text-muted-foreground mt-1 flex items-center gap-1 truncate text-[11px]">
                            <Smartphone className="size-3" />
                            {recipient.connection.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full border',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border'
                          )}
                        >
                          {selected && <Check className="size-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={
              !selectedConversationId ||
              !message.trim() ||
              loading ||
              Boolean(error) ||
              sending
            }
            className="min-w-48"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sending
              ? 'Enviando…'
              : `Enviar ${vehicle.imageCount === 1 ? 'foto' : `${vehicle.imageCount} fotos`}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
