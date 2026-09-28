'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Camera,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

type SocialChannel = 'facebook' | 'instagram';
type ConnectionStatus = 'connected' | 'disconnected' | 'pending' | 'error';

interface MetaConnection {
  id: string;
  channel: SocialChannel;
  external_account_id: string;
  display_name: string;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  connected_at: string | null;
  token_expires_at: string | null;
}

interface ConnectionsResponse {
  connections: MetaConnection[];
  configuration: {
    configured: boolean;
    webhookTokenConfigured: boolean;
    oauthCallbackUrl: string;
    webhookUrl: string;
  };
  canEdit: boolean;
  error?: string;
}

const RESULT_MESSAGES: Record<string, { title: string; description: string }> =
  {
    connected: {
      title: 'Autorización completada',
      description:
        'Se importaron las páginas autorizadas y sus cuentas profesionales de Instagram vinculadas.',
    },
    connected_facebook: {
      title: 'Facebook conectado',
      description:
        'Las páginas que elegiste ya pueden recibir y responder mensajes desde Nexora.',
    },
    connected_instagram: {
      title: 'Instagram conectado',
      description:
        'Las cuentas profesionales que elegiste ya pueden recibir y responder mensajes desde Nexora.',
    },
    connected_with_warnings: {
      title: 'Autorización guardada con observaciones',
      description:
        'La cuenta quedó autorizada, pero Meta no confirmó todos los webhooks. Revisa las cuentas marcadas en amarillo.',
    },
    cancelled: {
      title: 'Autorización cancelada',
      description: 'Meta no realizó cambios en las conexiones de esta empresa.',
    },
    no_pages: {
      title: 'No se encontraron páginas',
      description:
        'El usuario de Meta debe administrar al menos una página de Facebook.',
    },
    no_instagram_accounts: {
      title: 'No se encontró un Instagram profesional',
      description:
        'Elige una cuenta Business o Creator vinculada a una página que administras.',
    },
    plan_limit: {
      title: 'Límite de canales alcanzado',
      description:
        'Tu plan no tiene espacios disponibles para otra conexión. Desconecta un canal o cambia de plan.',
    },
    already_connected_elsewhere: {
      title: 'Esta cuenta ya pertenece a otra empresa',
      description:
        'Por seguridad, una página o cuenta de Instagram solo puede estar activa en una empresa a la vez.',
    },
    invalid_channel: {
      title: 'Canal no válido',
      description: 'Elige Facebook o Instagram e intenta nuevamente.',
    },
    invalid_state: {
      title: 'La autorización expiró',
      description: 'Inicia el proceso nuevamente desde este panel.',
    },
    failed: {
      title: 'No se pudo completar la conexión',
      description:
        'Revisa la configuración de la app de Meta y vuelve a intentarlo.',
    },
    not_configured: {
      title: 'Meta aún no está configurado',
      description:
        'Faltan las credenciales del servidor indicadas en la lista de preparación.',
    },
  };

function channelLabel(channel: SocialChannel): string {
  return channel === 'facebook' ? 'Facebook Messenger' : 'Instagram';
}

function statusLabel(status: ConnectionStatus): string {
  if (status === 'connected') return 'Conectado';
  if (status === 'error') return 'Requiere atención';
  if (status === 'pending') return 'Pendiente';
  return 'Desconectado';
}

export function ChannelsSettings() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/meta/connections', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as ConnectionsResponse;
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar');
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncWebhooks = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/meta/connections', {
        method: 'POST',
      });
      const payload = (await response.json().catch(() => null)) as {
        updated?: number;
        failed?: number;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          payload?.error || 'No se pudieron actualizar los canales'
        );
      }
      if ((payload?.failed ?? 0) > 0) {
        toast.warning(
          `Se actualizaron ${payload?.updated ?? 0} canales; ${payload?.failed} requieren reconexión.`
        );
      } else {
        toast.success('Canales y confirmaciones de entrega actualizados');
      }
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudieron actualizar'
      );
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Dirección copiada');
  };

  const disconnect = async (connection: MetaConnection) => {
    if (
      !window.confirm(
        `¿Desconectar ${connection.display_name}? Las conversaciones anteriores se conservarán.`
      )
    ) {
      return;
    }
    setDisconnecting(connection.id);
    try {
      const response = await fetch(`/api/meta/connections/${connection.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo desconectar el canal');
      }
      toast.success(`${connection.display_name} fue desconectado`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setDisconnecting(null);
    }
  };

  const result = searchParams.get('meta');
  const resultMessage = result ? RESULT_MESSAGES[result] : undefined;
  const successfulResult = result?.startsWith('connected') ?? false;
  const ready = Boolean(
    data?.configuration.configured && data.configuration.webhookTokenConfigured
  );

  return (
    <div>
      <SettingsPanelHead
        title="Facebook e Instagram"
        description="Cada empresa conecta sus propias cuentas con Meta. No debe escribir ni compartir API keys, tokens o contraseñas con Nexora."
      />

      {resultMessage ? (
        <Alert
          className={cn(
            'mb-5',
            successfulResult
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          )}
        >
          {successfulResult ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="size-4 text-amber-500" />
          )}
          <AlertTitle>{resultMessage.title}</AlertTitle>
          <AlertDescription>{resultMessage.description}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <Card>
          <CardContent className="flex min-h-40 items-center justify-center">
            <Loader2 className="text-primary size-5 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Elige qué canal quieres conectar</CardTitle>
              <CardDescription>
                Iniciarás sesión directamente en Meta y allí elegirás las
                páginas o cuentas que pertenecen a esta empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <ConnectOption
                  channel="facebook"
                  ready={ready}
                  canEdit={Boolean(data?.canEdit)}
                  connectedCount={
                    data?.connections.filter(
                      (connection) =>
                        connection.channel === 'facebook' &&
                        connection.status !== 'disconnected'
                    ).length ?? 0
                  }
                />
                <ConnectOption
                  channel="instagram"
                  ready={ready}
                  canEdit={Boolean(data?.canEdit)}
                  connectedCount={
                    data?.connections.filter(
                      (connection) =>
                        connection.channel === 'instagram' &&
                        connection.status !== 'disconnected'
                    ).length ?? 0
                  }
                />
              </div>

              <div className="border-border bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
                {[
                  ['1', 'Inicia sesión', 'En el sitio seguro de Meta'],
                  ['2', 'Elige tus cuentas', 'Solo las de esta empresa'],
                  ['3', 'Recibe mensajes', 'En la bandeja de Nexora'],
                ].map(([step, title, detail]) => (
                  <div key={step} className="bg-card flex gap-3 p-3">
                    <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {step}
                    </span>
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {title}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {!ready ? (
                <Alert className="border-amber-500/30 bg-amber-500/5">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <AlertTitle>Integración central pendiente</AlertTitle>
                  <AlertDescription>
                    La app de Meta de Nexora todavía necesita su configuración
                    inicial. Cuando esté lista, los botones se habilitarán para
                    todas las empresas.
                  </AlertDescription>
                </Alert>
              ) : null}

              <details className="border-border rounded-xl border">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-4 py-3 text-sm font-medium">
                  Información técnica para instalar la app central
                </summary>
                <div className="space-y-4 border-t px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadinessItem
                      ready={Boolean(data?.configuration.configured)}
                      title="Aplicación de Meta"
                      detail={
                        data?.configuration.configured
                          ? 'Configurada en Nexora'
                          : 'Falta App ID o App Secret'
                      }
                    />
                    <ReadinessItem
                      ready={Boolean(
                        data?.configuration.webhookTokenConfigured
                      )}
                      title="Recepción de mensajes"
                      detail={
                        data?.configuration.webhookTokenConfigured
                          ? 'Webhook preparado'
                          : 'Falta el token de verificación'
                      }
                    />
                  </div>

                  {data?.configuration ? (
                    <div className="border-border divide-border divide-y rounded-xl border">
                      <UrlRow
                        label="Callback OAuth"
                        value={data.configuration.oauthCallbackUrl}
                        onCopy={copy}
                      />
                      <UrlRow
                        label="Webhook"
                        value={data.configuration.webhookUrl}
                        onCopy={copy}
                      />
                    </div>
                  ) : null}
                </div>
              </details>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-foreground font-semibold">
                Cuentas de esta empresa
              </h3>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Facebook e Instagram se muestran por separado para que el equipo
                reconozca el origen de cada conversación.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={syncing}
              onClick={() => void syncWebhooks()}
            >
              <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
              Actualizar
            </Button>
          </div>

          {data?.connections.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  canEdit={data.canEdit}
                  busy={disconnecting === connection.id}
                  onDisconnect={disconnect}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex min-h-44 flex-col items-center justify-center text-center">
                <MessageCircle className="text-muted-foreground mb-3 size-8" />
                <p className="text-foreground font-medium">
                  Todavía no hay cuentas autorizadas
                </p>
                <p className="text-muted-foreground mt-1 max-w-md text-sm">
                  Cuando la app central esté preparada, un administrador de esta
                  empresa podrá iniciar sesión en Meta y elegir sus páginas.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ConnectOption({
  channel,
  ready,
  canEdit,
  connectedCount,
}: {
  channel: SocialChannel;
  ready: boolean;
  canEdit: boolean;
  connectedCount: number;
}) {
  const isFacebook = channel === 'facebook';
  const Icon = isFacebook ? MessageCircle : Camera;
  const label = isFacebook ? 'Facebook Messenger' : 'Instagram';

  return (
    <div className="border-border flex h-full flex-col rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            isFacebook
              ? 'bg-blue-500/10 text-blue-500'
              : 'bg-fuchsia-500/10 text-fuchsia-500'
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-foreground font-semibold">{label}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {isFacebook
              ? 'Autoriza las páginas que administras para atender Messenger.'
              : 'Autoriza cuentas Business o Creator para atender mensajes directos.'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {connectedCount === 0
            ? 'Sin cuentas conectadas'
            : `${connectedCount} ${connectedCount === 1 ? 'cuenta conectada' : 'cuentas conectadas'}`}
        </span>
        {canEdit ? (
          <Button
            size="sm"
            disabled={!ready}
            onClick={() => {
              // OAuth must leave the SPA and follow the server redirect to Meta.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign(
                `/api/meta/oauth/start?channel=${channel}`
              );
            }}
          >
            <Link2 className="size-4" />
            Conectar
            <ArrowRight className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ReadinessItem({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="border-border flex items-start gap-3 rounded-xl border p-3">
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
          ready
            ? 'bg-emerald-500/15 text-emerald-500'
            : 'bg-amber-500/15 text-amber-500'
        )}
      >
        {ready ? (
          <Check className="size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5" />
        )}
      </span>
      <div>
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p>
      </div>
    </div>
  );
}

function UrlRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (value: string) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-muted-foreground w-36 shrink-0 text-xs">
        {label}
      </span>
      <code className="text-foreground min-w-0 flex-1 truncate text-xs">
        {value}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        title={`Copiar ${label}`}
        onClick={() => void onCopy(value)}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

function ConnectionCard({
  connection,
  canEdit,
  busy,
  onDisconnect,
}: {
  connection: MetaConnection;
  canEdit: boolean;
  busy: boolean;
  onDisconnect: (connection: MetaConnection) => Promise<void>;
}) {
  const Icon = connection.channel === 'instagram' ? Camera : MessageCircle;
  const connected = connection.status === 'connected';
  const parentPage =
    connection.channel === 'instagram' &&
    typeof connection.metadata.parent_page_name === 'string'
      ? connection.metadata.parent_page_name
      : null;

  return (
    <Card>
      <CardContent className="flex h-full flex-col pt-1">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              connection.channel === 'instagram'
                ? 'bg-fuchsia-500/10 text-fuchsia-500'
                : 'bg-blue-500/10 text-blue-500'
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-foreground truncate font-medium">
                {connection.display_name}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  connected ? 'text-emerald-500' : 'text-amber-500'
                )}
              >
                {statusLabel(connection.status)}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {channelLabel(connection.channel)}
              {parentPage ? ` · Página ${parentPage}` : ''}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground mt-4 space-y-1 text-xs">
          <p className="truncate">
            ID de Meta: {connection.external_account_id}
          </p>
          <p>
            {connection.connected_at
              ? `Autorizado ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(connection.connected_at))}`
              : 'Sin autorización activa'}
          </p>
        </div>

        {canEdit && connection.status !== 'disconnected' ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive mt-4 self-start"
            disabled={busy}
            onClick={() => void onDisconnect(connection)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Unplug className="size-4" />
            )}
            Desconectar
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
