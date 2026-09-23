'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Loader2,
  MessageCircle,
  Search,
  Send,
  UserRound,
} from 'lucide-react';

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
import { cn } from '@/lib/utils';

interface QuotationRecipient {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
}

interface QuotationRecipientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContactId: string | null;
  sending: boolean;
  onSend: (contactId: string) => void;
}

export function QuotationRecipientDialog({
  open,
  onOpenChange,
  currentContactId,
  sending,
  onSend,
}: QuotationRecipientDialogProps) {
  const [contacts, setContacts] = useState<QuotationRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(currentContactId);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    void fetch('/api/quotes/recipients', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          contacts?: QuotationRecipient[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(
            payload?.error || 'No fue posible cargar los contactos.'
          );
        }
        setContacts(Array.isArray(payload?.contacts) ? payload.contacts : []);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar los contactos.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentContactId, open]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.phone, contact.email, contact.company].some(
        (value) => value?.toLocaleLowerCase('es').includes(term)
      )
    );
  }, [contacts, search]);

  function handleOpenChange(nextOpen: boolean) {
    if (sending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSearch('');
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-border border-b px-6 py-5">
          <div className="flex items-start gap-3 pr-8">
            <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-lg">
                Enviar cotización por WhatsApp
              </DialogTitle>
              <DialogDescription className="mt-1">
                Selecciona el contacto que recibirá el documento.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-border border-b px-6 py-4">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, teléfono, correo o empresa"
              className="h-11 pl-10"
              autoFocus
            />
          </div>
          <p className="text-muted-foreground mt-3 text-xs leading-5">
            Nexora utilizará el chat de WhatsApp de ese contacto. Si todavía no
            existe, lo creará usando su número.
          </p>
        </div>

        <div className="min-h-72 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <Loader2 className="text-primary size-7 animate-spin" />
              <p className="mt-3 text-sm font-medium">Cargando contactos…</p>
            </div>
          ) : error ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex min-h-56 items-center justify-center rounded-2xl border px-6 text-center text-sm">
              {error}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="border-border flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              <UserRound className="text-muted-foreground size-8" />
              <p className="mt-3 text-sm font-semibold">
                {contacts.length === 0
                  ? 'No hay contactos con teléfono.'
                  : 'No encontramos contactos con esa búsqueda.'}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Puedes crear o completar el contacto desde Contactos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredContacts.map((contact) => {
                const selected = selectedId === contact.id;
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedId(contact.id)}
                    className={cn(
                      'border-border bg-background flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                      selected
                        ? 'border-primary bg-primary/5 ring-primary/15 ring-2'
                        : 'hover:border-primary/35 hover:bg-muted/30'
                    )}
                  >
                    <span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-full font-semibold">
                      {(contact.name || contact.phone).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {contact.name || 'Contacto sin nombre'}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {contact.phone}
                      </span>
                      {(contact.company || contact.email) && (
                        <span className="text-muted-foreground mt-1 flex items-center gap-1 truncate text-[11px]">
                          {contact.company && <Building2 className="size-3" />}
                          {contact.company || contact.email}
                        </span>
                      )}
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

        <DialogFooter className="mx-0 mb-0 rounded-none px-6 py-4">
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
            onClick={() => selectedId && onSend(selectedId)}
            disabled={!selectedId || loading || Boolean(error) || sending}
            className="min-w-44"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sending ? 'Enviando…' : 'Enviar cotización'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
