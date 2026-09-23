'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleOff,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
  Smartphone,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import type { WhatsAppWebSessionStatus } from '@/lib/whatsapp/web-service';

type UiSession = WhatsAppWebSessionStatus & { serviceOffline?: boolean };

type Department = {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
};

type Connection = {
  id: string;
  connection_name: string;
  is_default: boolean;
  status: 'connected' | 'disconnected';
  display_phone: string | null;
  display_name: string | null;
  connected_at: string | null;
  default_department_id: string | null;
  department?: { id: string; name: string; color: string } | null;
  session: UiSession;
};

type ChannelUsage = {
  current: number;
  max: number | null;
  remaining: number | null;
};

type ListResponse = {
  connections?: Connection[];
  usage?: ChannelUsage;
  error?: string;
};

const EMPTY_USAGE: ChannelUsage = { current: 0, max: 1, remaining: 1 };

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      response.status === 404
        ? 'La conexión todavía se está cargando. Nexora intentará nuevamente.'
        : 'Nexora recibió una respuesta inválida del servidor.'
    );
  }
  return (await response.json()) as T;
}

export function WhatsAppQrConfig() {
  const { canEditSettings } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [usage, setUsage] = useState<ChannelUsage>(EMPTY_USAGE);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const atLimit = usage.max !== null && usage.current >= usage.max;
  const activeDepartments = useMemo(
    () => departments.filter((department) => department.is_active),
    [departments]
  );

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch('/api/whatsapp/web/session', {
        cache: 'no-store',
      });
      const data = await readApiResponse<ListResponse>(response);
      if (!response.ok) {
        throw new Error(
          data.error || 'No se pudieron consultar las conexiones.'
        );
      }
      setConnections(data.connections ?? []);
      if (data.usage) setUsage(data.usage);
      setRefreshFailed(false);
    } catch (error) {
      setRefreshFailed(true);
      if (!quiet) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'No se pudo consultar WhatsApp.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      refresh(),
      fetch('/api/departments', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data: { departments?: Department[] }) =>
          setDepartments(data.departments ?? [])
        )
        .catch(() => undefined),
    ]);
  }, [refresh]);

  useEffect(() => {
    if (
      !refreshFailed &&
      !connections.some((connection) =>
        ['starting', 'qr_ready', 'authenticated', 'connected'].includes(
          connection.session.status
        )
      )
    ) {
      return;
    }
    const timer = window.setInterval(() => void refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, [connections, refresh, refreshFailed]);

  async function createConnection() {
    const name = newName.trim();
    if (!name) {
      toast.error('Escribe un nombre para reconocer este WhatsApp.');
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/whatsapp/web/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          departmentId: newDepartmentId || null,
        }),
      });
      const data = await readApiResponse<{
        connection?: Connection;
        error?: string;
      }>(response);
      if (!response.ok || !data.connection) {
        throw new Error(data.error || 'No se pudo crear la conexión.');
      }
      setConnections((current) => [...current, data.connection!]);
      setUsage((current) => ({
        ...current,
        current: current.current + 1,
        remaining:
          current.remaining === null
            ? null
            : Math.max(0, current.remaining - 1),
      }));
      setCreateOpen(false);
      setNewName('');
      setNewDepartmentId('');
      toast.success('Conexión creada. Ya puedes escanear el código QR.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo crear la conexión.'
      );
    } finally {
      setCreating(false);
    }
  }

  async function startConnection(connectionId: string) {
    setBusyId(connectionId);
    try {
      const response = await fetch(
        `/api/whatsapp/web/session/${connectionId}`,
        { method: 'POST' }
      );
      const data = await readApiResponse<{
        session?: UiSession;
        error?: string;
      }>(response);
      if (!response.ok || !data.session) {
        throw new Error(data.error || 'No se pudo iniciar la conexión.');
      }
      setConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId
            ? { ...connection, session: data.session! }
            : connection
        )
      );
      toast.success('Preparando el código QR…');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo iniciar WhatsApp.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function disconnectConnection(connection: Connection) {
    if (
      !window.confirm(
        `¿Desvincular “${connection.connection_name}”? El historial se conservará.`
      )
    ) {
      return;
    }
    setBusyId(connection.id);
    try {
      const response = await fetch(
        `/api/whatsapp/web/session/${connection.id}`,
        { method: 'DELETE' }
      );
      const data = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo desvincular.');
      }
      await refresh(true);
      toast.success(`${connection.connection_name} fue desvinculado.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo desvincular.'
      );
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(connection: Connection) {
    setEditingId(connection.id);
    setEditName(connection.connection_name);
    setEditDepartmentId(connection.default_department_id ?? '');
  }

  async function saveConnection(connectionId: string) {
    if (!editName.trim()) {
      toast.error('El nombre de la conexión no puede quedar vacío.');
      return;
    }
    setBusyId(connectionId);
    try {
      const response = await fetch(
        `/api/whatsapp/web/session/${connectionId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: editName.trim(),
            departmentId: editDepartmentId || null,
          }),
        }
      );
      const data = await readApiResponse<{
        connection?: Partial<Connection>;
        error?: string;
      }>(response);
      if (!response.ok || !data.connection) {
        throw new Error(data.error || 'No se pudo guardar la conexión.');
      }
      setEditingId(null);
      await refresh(true);
      toast.success('Conexión actualizada.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>WhatsApp por código QR</CardTitle>
            <CardDescription className="mt-1">
              Cada número funciona por separado y puede llegar al mismo
              departamento.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={!canEditSettings || atLimit}
          >
            <Plus className="size-4" />
            Agregar WhatsApp
          </Button>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/35 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="text-sm font-semibold">Canales utilizados</p>
              <p className="text-muted-foreground mt-1 text-xs">
                WhatsApp, Facebook e Instagram comparten este límite.
              </p>
            </div>
            <span className="bg-background rounded-full border px-3 py-1 text-sm font-semibold">
              {usage.current} / {usage.max ?? 'Ilimitados'}
            </span>
          </div>
          {atLimit && (
            <Alert className="mt-4 border-amber-500/30 bg-amber-500/8">
              <ShieldAlert className="size-4 text-amber-500" />
              <AlertDescription>
                Alcanzaste el límite de canales de tu plan. Puedes administrar
                los existentes o cambiar a un plan superior.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {connections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="bg-primary/10 rounded-full p-4">
              <QrCode className="text-primary size-9" />
            </div>
            <h3 className="mt-4 font-semibold">
              Aún no hay números conectados
            </h3>
            <p className="text-muted-foreground mt-1 max-w-md text-sm">
              Crea una conexión con un nombre como “Ventas 1” o “Soporte” y
              escanea su QR.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {connections.map((connection) => {
            const connected = connection.session.status === 'connected';
            const waiting = ['starting', 'authenticated'].includes(
              connection.session.status
            );
            const isBusy = busyId === connection.id;
            const isEditing = editingId === connection.id;

            return (
              <Card key={connection.id} className="overflow-hidden">
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {connected ? (
                          <CheckCircle2 className="size-5 text-emerald-500" />
                        ) : (
                          <CircleOff className="text-muted-foreground size-5" />
                        )}
                        <span className="truncate">
                          {connection.connection_name}
                        </span>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {connection.display_phone
                          ? `+${connection.display_phone}`
                          : 'Número pendiente de vincular'}
                        {' · '}
                        {connection.department?.name ||
                          activeDepartments.find(
                            (item) =>
                              item.id === connection.default_department_id
                          )?.name ||
                          'Sin departamento'}
                      </CardDescription>
                    </div>
                    <span
                      className={
                        connected
                          ? 'rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-medium text-emerald-600'
                          : 'bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium'
                      }
                    >
                      {connected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5 pt-5">
                  {connection.session.serviceOffline && (
                    <Alert className="border-amber-500/30 bg-amber-500/8">
                      <ShieldAlert className="size-4 text-amber-500" />
                      <AlertDescription>
                        {connection.session.lastError}
                      </AlertDescription>
                    </Alert>
                  )}

                  {connection.session.status === 'qr_ready' &&
                  connection.session.qrDataUrl ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-white p-4">
                      <Image
                        src={connection.session.qrDataUrl}
                        alt={`Código QR de ${connection.connection_name}`}
                        width={280}
                        height={280}
                        unoptimized
                        priority
                        className="h-auto w-full max-w-[280px]"
                      />
                      <p className="text-center text-xs font-medium text-slate-700">
                        WhatsApp → Dispositivos vinculados → Vincular
                        dispositivo
                      </p>
                    </div>
                  ) : waiting ? (
                    <div className="bg-muted/25 flex min-h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed">
                      <Loader2 className="text-primary size-9 animate-spin" />
                      <p className="text-sm font-medium">
                        Preparando WhatsApp Web…
                      </p>
                    </div>
                  ) : connected ? (
                    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-center">
                      <Smartphone className="size-9 text-emerald-500" />
                      <p className="mt-3 font-semibold">
                        {connection.display_name || 'Dispositivo activo'}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Los mensajes entrarán identificados con este nombre.
                      </p>
                    </div>
                  ) : null}

                  {isEditing && (
                    <div className="bg-muted/25 grid gap-4 rounded-xl border p-4">
                      <div className="space-y-2">
                        <Label htmlFor={`name-${connection.id}`}>
                          Nombre visible
                        </Label>
                        <Input
                          id={`name-${connection.id}`}
                          value={editName}
                          maxLength={60}
                          onChange={(event) => setEditName(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`department-${connection.id}`}>
                          Departamento de entrada
                        </Label>
                        <select
                          id={`department-${connection.id}`}
                          value={editDepartmentId}
                          onChange={(event) =>
                            setEditDepartmentId(event.target.value)
                          }
                          className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
                        >
                          <option value="">Sin departamento</option>
                          {activeDepartments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!connected && (
                      <Button
                        onClick={() => void startConnection(connection.id)}
                        disabled={!canEditSettings || isBusy || waiting}
                      >
                        {isBusy || waiting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <QrCode className="size-4" />
                        )}
                        {connection.session.status === 'qr_ready'
                          ? 'Renovar QR'
                          : 'Conectar'}
                      </Button>
                    )}
                    {connected && (
                      <Button
                        variant="outline"
                        onClick={() => void disconnectConnection(connection)}
                        disabled={!canEditSettings || isBusy}
                      >
                        {isBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Unplug className="size-4" />
                        )}
                        Desvincular
                      </Button>
                    )}
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => void saveConnection(connection.id)}
                          disabled={isBusy}
                        >
                          <Save className="size-4" />
                          Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => beginEdit(connection)}
                        disabled={!canEditSettings}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => void refresh()}>
                      <RefreshCw className="size-4" />
                      Actualizar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!canEditSettings && (
        <p className="text-muted-foreground text-sm">
          Solo el administrador de la empresa puede cambiar estas conexiones.
        </p>
      )}

      <Alert className="border-amber-500/25 bg-amber-500/5">
        <ShieldAlert className="size-4 text-amber-500" />
        <AlertDescription className="text-xs">
          Esta modalidad usa WhatsApp Web, como Whaticket. Cada teléfono debe
          mantener su dispositivo vinculado y puede sufrir desconexiones o
          restricciones de WhatsApp.
        </AlertDescription>
      </Alert>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar otro WhatsApp</DialogTitle>
            <DialogDescription>
              El nombre permite saber por cuál número llegó cada cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-whatsapp-name">Nombre de la conexión</Label>
              <Input
                id="new-whatsapp-name"
                value={newName}
                maxLength={60}
                placeholder="Ej.: Ventas 2"
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-whatsapp-department">
                Departamento de entrada
              </Label>
              <select
                id="new-whatsapp-department"
                value={newDepartmentId}
                onChange={(event) => setNewDepartmentId(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
              >
                <option value="">Sin departamento</option>
                {activeDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Puedes elegir Ventas aunque ya exista otro WhatsApp en Ventas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void createConnection()} disabled={creating}>
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Crear y generar QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
