'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface FaqRow {
  id: string;
  title: string;
  is_active: boolean;
  tags: string[];
  updated_at: string;
}

const EMPTY_FORM = {
  question: '',
  answer: '',
  tags: '',
  isActive: true,
};

export function AgentFaqs({ disabled }: { disabled: boolean }) {
  const [rows, setRows] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/knowledge?type=faq', {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.documents ?? []);
    } catch {
      toast.error('No se pudieron cargar las preguntas frecuentes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function edit(row: FaqRow) {
    try {
      const response = await fetch(`/api/ai/knowledge/${row.id}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditingId(row.id);
      setForm({
        question: data.title ?? '',
        answer: data.content ?? '',
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
        isActive: data.is_active !== false,
      });
      setOpen(true);
    } catch {
      toast.error('No se pudo abrir la pregunta.');
    }
  }

  async function save() {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error('Escribe la pregunta y la respuesta autorizada.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/ai/knowledge/${editingId}` : '/api/ai/knowledge',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.question,
            content: form.answer,
            document_type: 'faq',
            is_active: form.isActive,
            tags: form.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      toast.success(editingId ? 'Pregunta actualizada.' : 'Pregunta creada.');
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar esta pregunta frecuente?')) return;
    const response = await fetch(`/api/ai/knowledge/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      toast.error('No se pudo eliminar la pregunta.');
      return;
    }
    toast.success('Pregunta eliminada.');
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Preguntas frecuentes</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Solo las respuestas activas se utilizan como información autorizada.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_FORM);
            setOpen(true);
          }}
          disabled={disabled}
        >
          <Plus className="mr-2 size-4" />
          Nueva pregunta
        </Button>
      </div>

      {open && (
        <div className="border-primary/25 bg-primary/5 space-y-4 rounded-2xl border p-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              {editingId ? 'Editar pregunta' : 'Nueva pregunta'}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div>
            <Label>Pregunta</Label>
            <Input
              className="mt-2"
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  question: event.target.value,
                }))
              }
              placeholder="¿Cuál es su horario?"
              maxLength={300}
            />
          </div>
          <div>
            <Label>Respuesta autorizada</Label>
            <Textarea
              className="mt-2 min-h-28"
              value={form.answer}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
              placeholder="Atendemos de lunes a viernes..."
              maxLength={5000}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label>Etiquetas opcionales</Label>
              <Input
                className="mt-2"
                value={form.tags}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tags: event.target.value,
                  }))
                }
                placeholder="horarios, sucursal"
              />
            </div>
            <label className="flex h-10 items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    isActive: checked,
                  }))
                }
              />
              Activa
            </label>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Guardar pregunta
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground flex justify-center py-8 text-sm">
          <Loader2 className="mr-2 size-4 animate-spin" /> Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
          Aún no hay preguntas frecuentes. Agrega la primera respuesta
          autorizada.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border-border flex items-center gap-4 rounded-2xl border p-4"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/35'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{row.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {row.is_active ? 'Activa' : 'Inactiva'} · Actualizada{' '}
                  {new Date(row.updated_at).toLocaleDateString('es-CL')}
                  {row.tags?.length ? ` · ${row.tags.join(', ')}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void edit(row)}
                disabled={disabled}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void remove(row.id)}
                disabled={disabled}
              >
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
