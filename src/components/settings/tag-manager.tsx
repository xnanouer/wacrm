'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

const PRESET_COLORS = [
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranjo', value: '#f97316' },
  { name: 'Ámbar', value: '#f59e0b' },
  { name: 'Verde', value: '#10b981' },
  { name: 'Cian', value: '#06b6d4' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Rosa', value: '#ec4899' },
] as const;

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#10b981');

  const load = useCallback(async () => {
    const response = await fetch('/api/tags', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setTags(payload.tags ?? []);
    else toast.error(payload.error ?? 'No se pudieron cargar las etiquetas');
    setLoading(false);
  }, []);

  useEffect(() => {
    // Data arrives asynchronously; state is never changed during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createTag() {
    if (!name.trim()) return;
    setSaving(true);
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(payload.error ?? 'No se pudo crear la etiqueta');
      return;
    }
    setName('');
    setColor('#10b981');
    toast.success('Etiqueta creada');
    await load();
  }

  function startEdit(tag: Tag) {
    setEditing(tag);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function updateTag() {
    if (!editing || !editName.trim()) return;
    setSaving(true);
    const response = await fetch(`/api/tags/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(payload.error ?? 'No se pudo actualizar la etiqueta');
      return;
    }
    setEditing(null);
    toast.success('Etiqueta actualizada');
    await load();
  }

  async function deleteTag() {
    if (!deleting) return;
    setSaving(true);
    const response = await fetch(`/api/tags/${deleting.id}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(payload.error ?? 'No se pudo eliminar la etiqueta');
      return;
    }
    setTags((current) => current.filter((tag) => tag.id !== deleting.id));
    setDeleting(null);
    toast.success('Etiqueta eliminada');
  }

  const colorPicker = (selected: string, onSelect: (next: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {PRESET_COLORS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-label={`Usar color ${option.name}`}
          aria-pressed={selected === option.value}
          className={cn(
            'size-7 rounded-md transition-transform hover:scale-110',
            selected === option.value &&
              'outline-primary outline outline-2 outline-offset-2'
          )}
          style={{ backgroundColor: option.value }}
        />
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <TagIcon className="text-primary size-4" />
          Etiquetas de ticket
        </CardTitle>
        <CardDescription>
          Crea estados como Aprobado, Pendiente o Rechazado. Los agentes podrán
          aplicarlos desde los tickets que atienden.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <Loader2 className="text-primary mx-auto my-6 size-6 animate-spin" />
        ) : (
          <>
            {tags.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aún no hay etiquetas configuradas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: `${tag.color}40`,
                    }}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => startEdit(tag)}
                      className="ml-1 rounded-full p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                      aria-label={`Editar ${tag.name}`}
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(tag)}
                      className="rounded-full p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                      aria-label={`Eliminar ${tag.name}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void createTag()}
                placeholder="Ejemplo: Aprobado"
                maxLength={40}
                className="min-w-52 flex-1"
              />
              {colorPicker(color, setColor)}
              <Button onClick={createTag} disabled={saving || !name.trim()}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Crear etiqueta
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar etiqueta</DialogTitle>
            <DialogDescription>
              El cambio aparecerá en todos los tickets que ya usan esta
              etiqueta.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            maxLength={40}
          />
          {colorPicker(editColor, setEditColor)}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={updateTag} disabled={saving || !editName.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar etiqueta</DialogTitle>
            <DialogDescription>
              ¿Eliminar “{deleting?.name}”? También se quitará de todos los
              contactos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteTag} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
