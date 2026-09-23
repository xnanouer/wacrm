'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { QuickReply } from '@/types';
import { SettingsPanelHead } from './settings-panel-head';

function normalizedShortcut(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function PersonalQuickReplies() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/quick-replies?mine=true', {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setReplies(payload.quickReplies ?? []);
    else toast.error(payload.error ?? 'No se pudieron cargar tus respuestas');
    setLoading(false);
  }, []);

  useEffect(() => {
    // Data arrives asynchronously; state is never changed during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function clearForm() {
    setEditingId(null);
    setTitle('');
    setShortcut('');
    setBody('');
  }

  function edit(reply: QuickReply) {
    setEditingId(reply.id);
    setTitle(reply.title);
    setShortcut(reply.shortcut ?? '');
    setBody(reply.body);
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const response = await fetch(
      editingId ? `/api/quick-replies/${editingId}` : '/api/quick-replies',
      {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          shortcut: normalizedShortcut(shortcut),
          body: body.trim(),
          visibility: 'personal',
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(payload.error ?? 'No se pudo guardar la respuesta');
      return;
    }
    toast.success(editingId ? 'Respuesta actualizada' : 'Respuesta creada');
    clearForm();
    await load();
  }

  async function remove(reply: QuickReply) {
    const response = await fetch(`/api/quick-replies/${reply.id}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(payload.error ?? 'No se pudo eliminar la respuesta');
      return;
    }
    if (editingId === reply.id) clearForm();
    setReplies((current) => current.filter((item) => item.id !== reply.id));
    toast.success('Respuesta eliminada');
  }

  return (
    <section className="animate-in fade-in-50 max-w-3xl duration-200">
      <SettingsPanelHead
        title="Mis respuestas rápidas"
        description="Crea mensajes personales y escribe / en una conversación para insertarlos. Siempre podrás editarlos antes de enviar."
      />

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nombre, por ejemplo: Lead aprobado"
              maxLength={80}
            />
            <Input
              value={shortcut}
              onChange={(event) => setShortcut(event.target.value)}
              placeholder="/aprobado"
              maxLength={31}
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Hola, tu solicitud fue aprobada..."
              className="min-h-28 sm:col-span-2"
              maxLength={4000}
            />
            <div className="flex gap-2 sm:col-span-2">
              <Button
                onClick={save}
                disabled={saving || !title.trim() || !body.trim()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingId ? (
                  <Save className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {editingId ? 'Guardar cambios' : 'Crear respuesta'}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={clearForm}>
                  <X className="size-4" /> Cancelar
                </Button>
              ) : null}
            </div>
          </div>

          <div className="border-border border-t pt-4">
            {loading ? (
              <Loader2 className="text-primary mx-auto size-5 animate-spin" />
            ) : replies.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Aún no tienes respuestas personales.
              </p>
            ) : (
              <div className="space-y-2">
                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="border-border bg-background flex items-start gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-foreground text-sm font-semibold">
                          {reply.title}
                        </p>
                        {reply.shortcut ? (
                          <code className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs">
                            {reply.shortcut}
                          </code>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm whitespace-pre-wrap">
                        {reply.body}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => edit(reply)}
                      aria-label={`Editar ${reply.title}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void remove(reply)}
                      aria-label={`Eliminar ${reply.title}`}
                      className="text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
