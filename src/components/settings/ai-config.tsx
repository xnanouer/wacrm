'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  Database,
  Link2,
  ListChecks,
  Loader2,
  LockKeyhole,
  MessageCircleQuestion,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { AgentFaqs } from '@/components/agents/agent-faqs';
import { AiKnowledgeCard } from '@/components/settings/ai-knowledge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_LEAD_FIELDS,
  DEFAULT_STRUCTURED_AI_CONFIG,
  MAX_AI_REPLIES_PER_CONVERSATION,
  type AiAgentConnectionSelection,
  type AiBusinessHour,
  type AiPermissionKey,
  type AvailableAiConnection,
  type StructuredAiConfig,
} from '@/lib/ai/agent-schema';
import { canEditSettings } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

type Section =
  | 'general'
  | 'personality'
  | 'business'
  | 'faqs'
  | 'hours'
  | 'connections'
  | 'permissions'
  | 'leads'
  | 'handoff'
  | 'future';

interface ConfigResponse {
  configured: boolean;
  config: StructuredAiConfig;
  business_hours: AiBusinessHour[];
  enabled_connections: AiAgentConnectionSelection[];
  available_connections: AvailableAiConnection[];
  selected_coverage_user_ids: string[];
  coverage_users: Array<{
    user_id: string;
    full_name: string | null;
    email: string | null;
    account_role: string;
    manual_status:
      | 'available'
      | 'unavailable'
      | 'lunch'
      | 'meeting'
      | 'vacation'
      | 'offline'
      | null;
    manual_status_until: string | null;
    status_note: string;
  }>;
  platform: {
    configured: boolean;
    enabled: boolean;
    account_enabled: boolean;
    audio_enabled: boolean;
  };
}

const EMPTY_PLATFORM: ConfigResponse['platform'] = {
  configured: false,
  enabled: false,
  account_enabled: false,
  audio_enabled: false,
};

const SECTIONS: Array<{
  id: Section;
  label: string;
  icon: typeof Bot;
}> = [
  { id: 'general', label: 'General', icon: Bot },
  { id: 'personality', label: 'Personalidad', icon: Sparkles },
  { id: 'business', label: 'Información del negocio', icon: Building2 },
  { id: 'faqs', label: 'Preguntas frecuentes', icon: MessageCircleQuestion },
  { id: 'hours', label: 'Horarios', icon: Clock3 },
  { id: 'connections', label: 'Conexiones', icon: Link2 },
  { id: 'permissions', label: 'Permisos', icon: ShieldCheck },
  { id: 'leads', label: 'Calificación de leads', icon: ListChecks },
  { id: 'handoff', label: 'Derivaciones', icon: UsersRound },
  { id: 'future', label: 'Integraciones futuras', icon: CalendarClock },
];

const TONES = [
  ['professional', 'Profesional', 'Claro, cordial y confiable.'],
  ['friendly', 'Cercano', 'Amable, natural y sencillo.'],
  ['direct', 'Directo', 'Breve, concreto y preciso.'],
  ['formal', 'Formal', 'Respetuoso y más institucional.'],
  ['commercial', 'Comercial', 'Orientado a ayudar y detectar interés.'],
  ['technical', 'Técnico', 'Exacto, detallado y fácil de entender.'],
  ['custom', 'Personalizado', 'Define tus propias reglas de tono.'],
] as const;

const OBJECTIVES = [
  ['answer_faqs', 'Responder preguntas frecuentes'],
  ['capture_customer_data', 'Captar información del cliente'],
  ['qualify_leads', 'Calificar leads'],
  ['create_opportunities', 'Ayudar a generar oportunidades'],
  ['get_visit', 'Conseguir una visita futura'],
  ['handoff', 'Derivar a un ejecutivo'],
  ['catalog_support', 'Apoyar consultas de catálogo'],
  ['follow_up', 'Realizar seguimientos'],
  ['custom', 'Objetivo personalizado'],
] as const;

const HANDOFF_RULES = [
  'El cliente pide hablar con una persona',
  'Solicita un descuento o quiere negociar',
  'El cliente está molesto',
  'Necesita una cotización personalizada',
  'No existe información autorizada suficiente',
  'La pregunta está fuera de las capacidades del agente',
  'Se detecta una oportunidad comercial importante',
  'Se necesita confirmación humana',
];

const PERMISSIONS: Array<{
  key: AiPermissionKey;
  label: string;
  description: string;
  available: boolean;
  requiresAudio?: boolean;
}> = [
  {
    key: 'generate_suggestions',
    label: 'Generar sugerencias de respuesta',
    description: 'Inserta un borrador editable en la Bandeja.',
    available: true,
  },
  {
    key: 'query_catalog',
    label: 'Consultar catálogo',
    description: 'Busca solo unidades aprobadas de esta empresa.',
    available: true,
  },
  {
    key: 'suggest_catalog_items',
    label: 'Sugerir vehículos al ejecutivo',
    description:
      'Propone unidades aprobadas y permite enviarlas automáticamente si lo activas.',
    available: true,
  },
  {
    key: 'recommend_handoff',
    label: 'Recomendar derivación humana',
    description: 'Respeta siempre al ejecutivo asignado.',
    available: true,
  },
  {
    key: 'understand_audio',
    label: 'Comprender notas de voz',
    description:
      'Transcribe el audio recibido y lo usa como mensaje del cliente.',
    available: true,
    requiresAudio: true,
  },
  {
    key: 'generate_audio',
    label: 'Decidir cuándo responder con audio',
    description:
      'El agente evalúa cada respuesta. Usa voz solo cuando aporta claridad o cercanía; para datos precisos mantiene texto.',
    available: true,
    requiresAudio: true,
  },
  {
    key: 'summarize_conversations',
    label: 'Resumir conversaciones',
    description: 'Próximamente.',
    available: false,
  },
  {
    key: 'classify_leads',
    label: 'Crear ficha de precalificación',
    description:
      'Recopila datos confirmados durante el chat y prepara una ficha privada para el ejecutivo.',
    available: true,
  },
  {
    key: 'read_contact',
    label: 'Consultar información ampliada del contacto',
    description: 'Próximamente.',
    available: false,
  },
  {
    key: 'read_opportunities',
    label: 'Consultar oportunidades',
    description: 'Próximamente.',
    available: false,
  },
  {
    key: 'create_followups',
    label: 'Crear seguimientos',
    description: 'Próximamente.',
    available: false,
  },
];

const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function listToText(values: string[]) {
  return values.join('\n');
}

function textToList(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mt-1.5 text-xs leading-5">{children}</p>
  );
}

export function AiConfig() {
  const { accountId, accountRole, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;
  const loadedAccountId = useRef<string | null>(null);
  const [section, setSection] = useState<Section>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [platform, setPlatform] = useState(EMPTY_PLATFORM);
  const [config, setConfig] = useState<StructuredAiConfig>({
    ...DEFAULT_STRUCTURED_AI_CONFIG,
  });
  const [hours, setHours] = useState<AiBusinessHour[]>(
    DEFAULT_BUSINESS_HOURS.map((hour) => ({ ...hour }))
  );
  const [enabledConnections, setEnabledConnections] = useState<
    AiAgentConnectionSelection[]
  >([]);
  const [availableConnections, setAvailableConnections] = useState<
    AvailableAiConnection[]
  >([]);
  const [coverageUsers, setCoverageUsers] = useState<
    ConfigResponse['coverage_users']
  >([]);
  const [selectedCoverageUserIds, setSelectedCoverageUserIds] = useState<
    string[]
  >([]);
  const [coverageStatuses, setCoverageStatuses] = useState<
    Record<string, ConfigResponse['coverage_users'][number]['manual_status']>
  >({});

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/config', { cache: 'no-store' });
      const data = (await response.json()) as ConfigResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error);
      setConfigured(data.configured);
      setPlatform(data.platform ?? EMPTY_PLATFORM);
      setConfig({
        ...DEFAULT_STRUCTURED_AI_CONFIG,
        ...(data.config ?? {}),
        permissions: {
          ...DEFAULT_STRUCTURED_AI_CONFIG.permissions,
          ...(data.config?.permissions ?? {}),
        },
      });
      setHours(
        data.business_hours?.length
          ? data.business_hours
          : DEFAULT_BUSINESS_HOURS.map((hour) => ({ ...hour }))
      );
      setEnabledConnections(data.enabled_connections ?? []);
      setAvailableConnections(data.available_connections ?? []);
      setCoverageUsers(data.coverage_users ?? []);
      setSelectedCoverageUserIds(data.selected_coverage_user_ids ?? []);
      setCoverageStatuses(
        Object.fromEntries(
          (data.coverage_users ?? []).map((member) => [
            member.user_id,
            member.manual_status,
          ])
        )
      );
      setDirty(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el Agente IA.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountId || loadedAccountId.current === accountId) return;
    loadedAccountId.current = accountId;
    void fetchConfig();
  }, [accountId, fetchConfig]);

  function update<K extends keyof StructuredAiConfig>(
    key: K,
    value: StructuredAiConfig[K]
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function setAgentActive(checked: boolean) {
    setConfig((current) => ({
      ...current,
      is_active: checked,
      ...(!checked
        ? {
            operating_mode: 'suggestion' as const,
            auto_reply_enabled: false,
          }
        : {}),
    }));
    setDirty(true);
  }

  function setReplyMode(mode: 'suggestion' | 'automatic') {
    setConfig((current) => ({
      ...current,
      is_active: true,
      operating_mode: mode,
      auto_reply_enabled: mode === 'automatic',
    }));

    if (mode === 'automatic' && enabledConnections.length === 0) {
      const connected = availableConnections.filter(
        (connection) => connection.status === 'connected'
      );
      if (connected.length === 1) {
        const connection = connected[0];
        setEnabledConnections([
          {
            whatsapp_config_id:
              connection.kind === 'whatsapp' ? connection.id : null,
            channel_connection_id:
              connection.kind === 'whatsapp' ? null : connection.id,
            is_enabled: true,
          },
        ]);
      }
    }

    setDirty(true);
  }

  function toggleList(
    key: 'lead_fields' | 'escalation_rules',
    value: string,
    checked: boolean
  ) {
    const next = checked
      ? [...new Set([...config[key], value])]
      : config[key].filter((item) => item !== value);
    update(key, next);
  }

  function connectionSelected(connection: AvailableAiConnection) {
    return enabledConnections.some((selected) =>
      connection.kind === 'whatsapp'
        ? selected.whatsapp_config_id === connection.id
        : selected.channel_connection_id === connection.id
    );
  }

  function toggleConnection(
    connection: AvailableAiConnection,
    checked: boolean
  ) {
    setEnabledConnections((current) =>
      checked
        ? [
            ...current,
            {
              whatsapp_config_id:
                connection.kind === 'whatsapp' ? connection.id : null,
              channel_connection_id:
                connection.kind === 'whatsapp' ? null : connection.id,
              is_enabled: true,
            },
          ]
        : current.filter((selected) =>
            connection.kind === 'whatsapp'
              ? selected.whatsapp_config_id !== connection.id
              : selected.channel_connection_id !== connection.id
          )
    );
    setDirty(true);
  }

  async function save() {
    if (config.is_active && (!platform.enabled || !platform.account_enabled)) {
      toast.error(
        !platform.enabled
          ? 'La IA global de Nexora aún no está disponible.'
          : 'Nexora debe habilitar primero la IA para esta empresa.'
      );
      return;
    }
    if (
      config.after_hours_coverage_enabled &&
      config.after_hours_scope === 'selected' &&
      selectedCoverageUserIds.length === 0
    ) {
      toast.error('Selecciona al menos un ejecutivo para la cobertura IA.');
      setSection('hours');
      return;
    }
    if (
      config.after_hours_coverage_enabled &&
      config.after_hours_no_points_behavior === 'static_message' &&
      !config.out_of_hours_message.trim()
    ) {
      toast.error('Escribe el mensaje fijo de respaldo fuera de horario.');
      setSection('hours');
      return;
    }
    if (
      config.operating_mode === 'automatic' &&
      config.auto_reply_enabled &&
      !availableConnections.some(
        (connection) =>
          connection.status === 'connected' && connectionSelected(connection)
      )
    ) {
      toast.error(
        'Selecciona al menos una conexión activa para responder automáticamente.'
      );
      setSection('connections');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          catalog_ai_enabled:
            config.permissions.query_catalog &&
            config.permissions.suggest_catalog_items,
          catalog_ai_auto_send: config.catalog_ai_auto_send,
          business_hours: hours,
          enabled_connections: enabledConnections,
          selected_coverage_user_ids: selectedCoverageUserIds,
          coverage_user_statuses: coverageUsers.map((member) => ({
            user_id: member.user_id,
            manual_status: coverageStatuses[member.user_id] ?? null,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      toast.success('Agente IA guardado correctamente.');
      await fetchConfig();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la configuración.'
      );
    } finally {
      setSaving(false);
    }
  }

  const completeness = useMemo(() => {
    const checks = [
      Boolean(config.agent_name.trim()),
      Boolean(config.agent_title.trim()),
      Boolean(
        config.business_description.trim() || config.system_prompt?.trim()
      ),
      enabledConnections.length > 0,
      config.permissions.generate_suggestions,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [config, enabledConnections]);

  if (loading || profileLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-20">
        <Loader2 className="mr-2 size-5 animate-spin" /> Cargando Agente IA...
      </div>
    );
  }

  const companyAvailable = platform.enabled && platform.account_enabled;
  const disabled = !canEdit || saving;
  const automaticReplyEnabled =
    config.operating_mode === 'automatic' && config.auto_reply_enabled;
  const selectedConnectionNames = availableConnections
    .filter(connectionSelected)
    .map((connection) => connection.name);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">
              {config.agent_name || 'Asistente Nexora'}
            </h2>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                config.is_active
                  ? 'bg-emerald-500/12 text-emerald-500'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {config.is_active ? 'Agente activo' : 'Agente desactivado'}
            </span>
            {!configured && (
              <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-500">
                Configuración inicial
              </span>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Un único agente para tu empresa. Configuración {completeness}%
            completa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs font-medium text-amber-500">
              Cambios sin guardar
            </span>
          )}
          <Button onClick={save} disabled={disabled || !dirty}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'flex gap-3 rounded-2xl border p-4',
          companyAvailable
            ? 'border-emerald-500/25 bg-emerald-500/8'
            : 'border-amber-500/25 bg-amber-500/8'
        )}
      >
        {companyAvailable ? (
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
        ) : (
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber-500" />
        )}
        <div>
          <p className="text-sm font-semibold">
            {companyAvailable
              ? 'IA administrada por Nexora disponible'
              : 'IA pendiente de habilitación'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {companyAvailable
              ? 'Tu equipo puede generar sugerencias sin ver ni administrar la API key de Nexora.'
              : 'El propietario de la plataforma debe configurar y habilitar la IA para esta empresa.'}
          </p>
        </div>
      </div>

      {!canEdit && (
        <p className="border-border bg-muted/40 text-muted-foreground rounded-xl border p-3 text-sm">
          Solo el administrador de la empresa puede modificar este agente.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav className="border-border bg-card rounded-2xl border p-2 lg:sticky lg:top-20">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors',
                  section === item.id
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <Card className="rounded-3xl">
          <CardContent className="space-y-7 p-6 sm:p-8">
            {section === 'general' && (
              <>
                <SectionTitle
                  icon={BrainCircuit}
                  title="Identidad y estado"
                  description="Define quién es tu asistente y activa su ayuda para el equipo."
                />
                <div className="border-border bg-muted/15 flex items-center justify-between gap-5 rounded-2xl border p-5">
                  <div>
                    <p className="font-semibold">Activar Agente IA</p>
                    <FieldHelp>
                      Enciende el asistente con el modo de atención que elijas
                      abajo.
                    </FieldHelp>
                  </div>
                  <Switch
                    checked={config.is_active}
                    onCheckedChange={setAgentActive}
                    disabled={disabled || !companyAvailable}
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Nombre del agente">
                    <Input
                      value={config.agent_name}
                      onChange={(event) =>
                        update('agent_name', event.target.value)
                      }
                      maxLength={80}
                      disabled={disabled}
                      placeholder="Sofía"
                    />
                  </FormField>
                  <FormField label="Cargo o descripción">
                    <Input
                      value={config.agent_title}
                      onChange={(event) =>
                        update('agent_title', event.target.value)
                      }
                      maxLength={120}
                      disabled={disabled}
                      placeholder="Asistente comercial"
                    />
                  </FormField>
                  <FormField label="Idioma">
                    <select
                      className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                      value={config.language}
                      onChange={(event) =>
                        update(
                          'language',
                          event.target.value as StructuredAiConfig['language']
                        )
                      }
                      disabled={disabled}
                    >
                      <option value="es-CL">Español (Chile)</option>
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt-BR">Português (Brasil)</option>
                    </select>
                  </FormField>
                  <FormField label="Avatar opcional (URL)">
                    <Input
                      value={config.agent_avatar_url ?? ''}
                      onChange={(event) =>
                        update('agent_avatar_url', event.target.value || null)
                      }
                      maxLength={1000}
                      disabled={disabled}
                      placeholder="https://..."
                    />
                  </FormField>
                </div>
                <div className="border-border rounded-2xl border p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>Presentarse cuando corresponda</Label>
                      <FieldHelp>
                        No se repetirá en todos los mensajes.
                      </FieldHelp>
                    </div>
                    <Switch
                      checked={config.introduction_enabled}
                      onCheckedChange={(checked) =>
                        update('introduction_enabled', checked)
                      }
                      disabled={disabled}
                    />
                  </div>
                  <Textarea
                    className="mt-4 min-h-24"
                    value={config.introduction_text}
                    onChange={(event) =>
                      update('introduction_text', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={1000}
                    placeholder="Hola, soy Sofía, asistente virtual de..."
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Mensaje de bienvenida">
                    <Textarea
                      value={config.welcome_message}
                      onChange={(event) =>
                        update('welcome_message', event.target.value)
                      }
                      disabled={disabled}
                      maxLength={1000}
                    />
                  </FormField>
                  <FormField label="Mensaje fuera de horario">
                    <Textarea
                      value={config.out_of_hours_message}
                      onChange={(event) =>
                        update('out_of_hours_message', event.target.value)
                      }
                      disabled={disabled}
                      maxLength={1000}
                    />
                  </FormField>
                </div>
                <div className="border-border rounded-2xl border p-5">
                  <div>
                    <p className="text-base font-bold">
                      ¿Cómo quieres que trabaje la IA?
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Elige una opción. Puedes cambiarla cuando quieras.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setReplyMode('suggestion')}
                      disabled={disabled || !companyAvailable}
                      className={cn(
                        'rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                        !automaticReplyEnabled
                          ? 'border-primary bg-primary/7 ring-primary/15 ring-2'
                          : 'border-border hover:bg-muted/40'
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                          <WandSparkles className="size-5" />
                        </span>
                        {!automaticReplyEnabled && (
                          <Check className="text-primary size-5" />
                        )}
                      </span>
                      <span className="mt-4 block font-bold">
                        Solo sugerencias
                      </span>
                      <span className="text-muted-foreground mt-1 block text-sm leading-6">
                        La IA prepara una respuesta y una persona decide si la
                        envía.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReplyMode('automatic')}
                      disabled={disabled || !companyAvailable}
                      className={cn(
                        'rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                        automaticReplyEnabled
                          ? 'border-emerald-500 bg-emerald-500/8 ring-2 ring-emerald-500/15'
                          : 'border-border hover:bg-muted/40'
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
                          <Bot className="size-5" />
                        </span>
                        {automaticReplyEnabled && (
                          <Check className="size-5 text-emerald-500" />
                        )}
                      </span>
                      <span className="mt-4 block font-bold">
                        Responder automáticamente
                      </span>
                      <span className="text-muted-foreground mt-1 block text-sm leading-6">
                        Atiende chats nuevos sin agente y deriva cuando necesita
                        ayuda humana.
                      </span>
                    </button>
                  </div>

                  {automaticReplyEnabled && (
                    <div className="mt-4 grid gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                      <div className="space-y-4">
                        <div>
                          <p className="font-semibold text-emerald-600">
                            Respuesta automática preparada
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm leading-6">
                            Solo responderá conversaciones sin ejecutivo
                            asignado. Al llegar al límite, el equipo humano
                            continuará.
                          </p>
                          <button
                            type="button"
                            onClick={() => setSection('connections')}
                            className="text-primary mt-2 text-sm font-semibold hover:underline"
                          >
                            {selectedConnectionNames.length
                              ? `Conexión: ${selectedConnectionNames.join(', ')}`
                              : 'Elegir conexión'}
                          </button>
                        </div>
                        <div className="border-border bg-background/70 flex items-center justify-between gap-4 rounded-xl border p-4">
                          <div>
                            <p className="font-semibold">
                              Enviar catálogo automáticamente
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm leading-5">
                              Si el cliente pide vehículos, la IA enviará solo
                              unidades aprobadas, disponibles y visibles de esta
                              empresa.
                            </p>
                          </div>
                          <Switch
                            checked={config.catalog_ai_auto_send}
                            onCheckedChange={(checked) =>
                              update('catalog_ai_auto_send', checked)
                            }
                            disabled={
                              disabled ||
                              !config.permissions.query_catalog ||
                              !config.permissions.suggest_catalog_items
                            }
                          />
                        </div>
                      </div>
                      <FormField label="Respuestas por chat">
                        <div className="border-border mb-3 flex items-center justify-between rounded-xl border px-4 py-3">
                          <div>
                            <p className="text-sm font-medium">Sin límite</p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              La IA continúa hasta que intervenga el equipo o se
                              produzca una derivación.
                            </p>
                          </div>
                          <Switch
                            checked={
                              config.auto_reply_max_per_conversation === null
                            }
                            onCheckedChange={(checked) =>
                              update(
                                'auto_reply_max_per_conversation',
                                checked ? null : MAX_AI_REPLIES_PER_CONVERSATION
                              )
                            }
                            disabled={disabled}
                          />
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_AI_REPLIES_PER_CONVERSATION}
                          value={config.auto_reply_max_per_conversation ?? ''}
                          onChange={(event) =>
                            update(
                              'auto_reply_max_per_conversation',
                              Math.min(
                                MAX_AI_REPLIES_PER_CONVERSATION,
                                Math.max(1, Number(event.target.value) || 1)
                              )
                            )
                          }
                          disabled={
                            disabled ||
                            config.auto_reply_max_per_conversation === null
                          }
                        />
                        <FieldHelp>
                          {config.auto_reply_max_per_conversation === null
                            ? 'No existe un corte por cantidad de mensajes.'
                            : `Máximo ${MAX_AI_REPLIES_PER_CONVERSATION} respuestas automáticas antes de dejar el chat al equipo humano.`}
                        </FieldHelp>
                      </FormField>
                    </div>
                  )}
                </div>
              </>
            )}

            {section === 'personality' && (
              <>
                <SectionTitle
                  icon={Sparkles}
                  title="Personalidad y objetivo"
                  description="Configura cómo habla el agente y qué debe intentar lograr."
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {TONES.map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update('tone', value)}
                      disabled={disabled}
                      className={cn(
                        'rounded-2xl border p-4 text-left transition-colors',
                        config.tone === value
                          ? 'border-primary bg-primary/7'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <p className="flex items-center justify-between font-semibold">
                        {label}
                        {config.tone === value && (
                          <Check className="text-primary size-4" />
                        )}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {description}
                      </p>
                    </button>
                  ))}
                </div>
                {config.tone === 'custom' && (
                  <FormField label="Tono personalizado">
                    <Textarea
                      value={config.custom_tone}
                      onChange={(event) =>
                        update('custom_tone', event.target.value)
                      }
                      disabled={disabled}
                      maxLength={2000}
                    />
                  </FormField>
                )}
                <FormField label="Objetivo principal">
                  <select
                    className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                    value={config.primary_objective}
                    onChange={(event) =>
                      update(
                        'primary_objective',
                        event.target
                          .value as StructuredAiConfig['primary_objective']
                      )
                    }
                    disabled={disabled}
                  >
                    {OBJECTIVES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
                {config.primary_objective === 'custom' && (
                  <FormField label="Objetivo personalizado">
                    <Textarea
                      value={config.custom_objective}
                      onChange={(event) =>
                        update('custom_objective', event.target.value)
                      }
                      disabled={disabled}
                      maxLength={3000}
                    />
                  </FormField>
                )}
                <FormField label="Instrucciones adicionales">
                  <Textarea
                    className="min-h-52"
                    value={config.additional_instructions}
                    onChange={(event) =>
                      update('additional_instructions', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={20_000}
                    placeholder="Habla de forma breve. No prometas financiamiento..."
                  />
                  <FieldHelp>
                    Nexora combina estas instrucciones con reglas de seguridad
                    que la empresa no puede anular.
                  </FieldHelp>
                </FormField>
              </>
            )}

            {section === 'business' && (
              <>
                <SectionTitle
                  icon={Building2}
                  title="Información del negocio"
                  description="El nombre comercial se toma de la empresa. Agrega solamente información autorizada."
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="Rubro">
                    <Input
                      value={config.business_industry}
                      onChange={(event) =>
                        update('business_industry', event.target.value)
                      }
                      disabled={disabled}
                      maxLength={160}
                      placeholder="Automotora"
                    />
                  </FormField>
                  <FormField label="Medios de atención (uno por línea)">
                    <Textarea
                      value={listToText(config.business_channels)}
                      onChange={(event) =>
                        update(
                          'business_channels',
                          textToList(event.target.value)
                        )
                      }
                      disabled={disabled}
                    />
                  </FormField>
                </div>
                <FormField label="Descripción de la empresa">
                  <Textarea
                    className="min-h-32"
                    value={config.business_description}
                    onChange={(event) =>
                      update('business_description', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={5000}
                  />
                </FormField>
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    ['business_addresses', 'Direcciones'],
                    ['business_phones', 'Teléfonos'],
                    ['business_emails', 'Correos'],
                    ['business_service_areas', 'Zonas de atención'],
                  ].map(([key, label]) => (
                    <FormField key={key} label={`${label} (uno por línea)`}>
                      <Textarea
                        value={listToText(
                          config[
                            key as keyof Pick<
                              StructuredAiConfig,
                              | 'business_addresses'
                              | 'business_phones'
                              | 'business_emails'
                              | 'business_service_areas'
                            >
                          ] as string[]
                        )}
                        onChange={(event) =>
                          update(
                            key as
                              | 'business_addresses'
                              | 'business_phones'
                              | 'business_emails'
                              | 'business_service_areas',
                            textToList(event.target.value)
                          )
                        }
                        disabled={disabled}
                      />
                    </FormField>
                  ))}
                </div>
                <FormField label="Políticas generales">
                  <Textarea
                    value={config.general_policies}
                    onChange={(event) =>
                      update('general_policies', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={10_000}
                  />
                </FormField>
                <FormField label="Requisitos generales">
                  <Textarea
                    value={config.general_requirements}
                    onChange={(event) =>
                      update('general_requirements', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={5000}
                  />
                </FormField>
                <FormField label="Información comercial autorizada">
                  <Textarea
                    className="min-h-32"
                    value={config.authorized_commercial_info}
                    onChange={(event) =>
                      update('authorized_commercial_info', event.target.value)
                    }
                    disabled={disabled}
                    maxLength={10_000}
                  />
                </FormField>
              </>
            )}

            {section === 'faqs' && (
              <>
                <AgentFaqs disabled={disabled} />
                <div className="border-border border-t pt-7">
                  <div className="mb-4 flex items-center gap-2">
                    <Database className="text-primary size-5" />
                    <div>
                      <h3 className="font-bold">Documentos de conocimiento</h3>
                      <p className="text-muted-foreground text-sm">
                        Políticas o información extensa ya compatible con el
                        motor existente.
                      </p>
                    </div>
                  </div>
                  <AiKnowledgeCard
                    accountId={accountId}
                    canEdit={canEdit}
                    hasEmbeddingsKey={false}
                  />
                </div>
              </>
            )}

            {section === 'hours' && (
              <>
                <SectionTitle
                  icon={Clock3}
                  title="Horarios"
                  description="Define la jornada de referencia y la zona horaria del agente."
                />
                <FormField label="Zona horaria">
                  <Input
                    value={config.timezone}
                    onChange={(event) => update('timezone', event.target.value)}
                    disabled={disabled}
                    maxLength={80}
                  />
                </FormField>
                <div className="space-y-3">
                  {hours.map((hour, index) => (
                    <div
                      key={hour.day_of_week}
                      className="border-border grid items-center gap-3 rounded-2xl border p-4 sm:grid-cols-[130px_1fr_1fr]"
                    >
                      <label className="flex items-center gap-3 font-medium">
                        <Checkbox
                          checked={hour.is_active}
                          onCheckedChange={(checked) => {
                            setHours((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, is_active: checked === true }
                                  : item
                              )
                            );
                            setDirty(true);
                          }}
                          disabled={disabled}
                        />
                        {DAY_NAMES[hour.day_of_week]}
                      </label>
                      <Input
                        type="time"
                        value={hour.starts_at.slice(0, 5)}
                        onChange={(event) => {
                          setHours((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, starts_at: event.target.value }
                                : item
                            )
                          );
                          setDirty(true);
                        }}
                        disabled={disabled || !hour.is_active}
                      />
                      <Input
                        type="time"
                        value={hour.ends_at.slice(0, 5)}
                        onChange={(event) => {
                          setHours((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, ends_at: event.target.value }
                                : item
                            )
                          );
                          setDirty(true);
                        }}
                        disabled={disabled || !hour.is_active}
                      />
                    </div>
                  ))}
                </div>
                <FormField label="Comportamiento fuera de horario">
                  <select
                    className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                    value={config.after_hours_behavior}
                    onChange={(event) =>
                      update(
                        'after_hours_behavior',
                        event.target
                          .value as StructuredAiConfig['after_hours_behavior']
                      )
                    }
                    disabled={disabled}
                  >
                    <option value="suggestions_only">
                      Solo generar sugerencias
                    </option>
                    <option value="automatic">
                      Responder automáticamente cuando corresponda
                    </option>
                    <option value="log_only" disabled>
                      Registrar consulta — Próximamente
                    </option>
                    <option value="handoff" disabled>
                      Derivar al equipo — Próximamente
                    </option>
                    <option value="send_out_of_hours_message" disabled>
                      Responder automáticamente — Próximamente
                    </option>
                    <option value="disabled">
                      Permanecer desactivado fuera de horario
                    </option>
                  </select>
                </FormField>

                <div className="border-primary/20 bg-primary/5 space-y-5 rounded-3xl border p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold">
                        Cobertura IA fuera de horario
                      </h3>
                      <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-6">
                        El mismo Agente IA atiende temporalmente el chat cuando
                        el ejecutivo asignado está fuera de su jornada. La
                        asignación no cambia y el humano puede retomarlo en un
                        clic.
                      </p>
                    </div>
                    <Switch
                      checked={config.after_hours_coverage_enabled}
                      onCheckedChange={(checked) => {
                        update('after_hours_coverage_enabled', checked);
                        if (checked)
                          update('after_hours_behavior', 'automatic');
                      }}
                      disabled={
                        disabled || config.operating_mode !== 'automatic'
                      }
                    />
                  </div>

                  {config.after_hours_coverage_enabled && (
                    <div className="space-y-5 border-t pt-5">
                      <FormField label="Ejecutivos cubiertos">
                        <select
                          className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                          value={config.after_hours_scope}
                          onChange={(event) =>
                            update(
                              'after_hours_scope',
                              event.target
                                .value as StructuredAiConfig['after_hours_scope']
                            )
                          }
                          disabled={disabled}
                        >
                          <option value="all">Todos los ejecutivos</option>
                          <option value="selected">Solo seleccionados</option>
                        </select>
                      </FormField>

                      {coverageUsers.length > 0 && (
                        <div>
                          <p className="text-muted-foreground mb-2 text-xs">
                            La disponibilidad manual prevalece sobre el horario
                            semanal hasta que vuelvas a seleccionar “Usar
                            horario”.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {coverageUsers.map((member) => (
                              <div
                                key={member.user_id}
                                className="border-border bg-background flex items-center gap-3 rounded-xl border p-3"
                              >
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                  {config.after_hours_scope === 'selected' && (
                                    <Checkbox
                                      checked={selectedCoverageUserIds.includes(
                                        member.user_id
                                      )}
                                      onCheckedChange={(checked) => {
                                        setSelectedCoverageUserIds((current) =>
                                          checked === true
                                            ? [
                                                ...new Set([
                                                  ...current,
                                                  member.user_id,
                                                ]),
                                              ]
                                            : current.filter(
                                                (id) => id !== member.user_id
                                              )
                                        );
                                        setDirty(true);
                                      }}
                                      disabled={disabled}
                                    />
                                  )}
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                      {member.full_name ||
                                        member.email ||
                                        'Ejecutivo'}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      {member.account_role === 'agent'
                                        ? 'Agente'
                                        : 'Administrador'}
                                    </span>
                                  </span>
                                </label>
                                <select
                                  aria-label={`Disponibilidad de ${member.full_name || member.email || 'ejecutivo'}`}
                                  className="border-input bg-background h-9 max-w-36 rounded-md border px-2 text-xs"
                                  value={coverageStatuses[member.user_id] ?? ''}
                                  onChange={(event) => {
                                    setCoverageStatuses((current) => ({
                                      ...current,
                                      [member.user_id]: (event.target.value ||
                                        null) as ConfigResponse['coverage_users'][number]['manual_status'],
                                    }));
                                    setDirty(true);
                                  }}
                                  disabled={disabled}
                                >
                                  <option value="">Usar horario</option>
                                  <option value="available">
                                    Disponible ahora
                                  </option>
                                  <option value="unavailable">
                                    No disponible
                                  </option>
                                  <option value="lunch">Almuerzo</option>
                                  <option value="meeting">En reunión</option>
                                  <option value="vacation">Vacaciones</option>
                                  <option value="offline">Desconectado</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField label="Respuestas máximas por cobertura">
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            value={
                              config.after_hours_max_replies_per_conversation
                            }
                            onChange={(event) =>
                              update(
                                'after_hours_max_replies_per_conversation',
                                Number(event.target.value) || 5
                              )
                            }
                            disabled={disabled}
                          />
                        </FormField>
                        <FormField label="Límite diario de puntos">
                          <Input
                            type="number"
                            min={1}
                            placeholder="Sin límite propio"
                            value={config.after_hours_daily_points_limit ?? ''}
                            onChange={(event) =>
                              update(
                                'after_hours_daily_points_limit',
                                event.target.value
                                  ? Number(event.target.value)
                                  : null
                              )
                            }
                            disabled={disabled}
                          />
                        </FormField>
                        <FormField label="Límite mensual de puntos">
                          <Input
                            type="number"
                            min={1}
                            placeholder="Sin límite propio"
                            value={
                              config.after_hours_monthly_points_limit ?? ''
                            }
                            onChange={(event) =>
                              update(
                                'after_hours_monthly_points_limit',
                                event.target.value
                                  ? Number(event.target.value)
                                  : null
                              )
                            }
                            disabled={disabled}
                          />
                        </FormField>
                      </div>

                      <FormField label="Si no quedan Puntos Nexora">
                        <select
                          className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                          value={config.after_hours_no_points_behavior}
                          onChange={(event) =>
                            update(
                              'after_hours_no_points_behavior',
                              event.target
                                .value as StructuredAiConfig['after_hours_no_points_behavior']
                            )
                          }
                          disabled={disabled}
                        >
                          <option value="leave_pending">
                            Dejar pendiente para el equipo
                          </option>
                          <option value="static_message">
                            Enviar el mensaje fuera de horario
                          </option>
                          <option value="no_reply">No responder</option>
                        </select>
                      </FormField>
                      {config.after_hours_no_points_behavior ===
                        'static_message' && (
                        <FormField label="Mensaje fijo sin IA (0 puntos)">
                          <Textarea
                            value={config.out_of_hours_message}
                            onChange={(event) =>
                              update('out_of_hours_message', event.target.value)
                            }
                            placeholder="Gracias por escribirnos. Nuestro equipo responderá apenas esté disponible."
                            maxLength={1000}
                            disabled={disabled}
                          />
                        </FormField>
                      )}
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        Esta función puede consumir Puntos Nexora. El mensaje
                        fijo de respaldo no consume puntos.
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-border flex items-start justify-between gap-4 rounded-2xl border p-5">
                  <div>
                    <h3 className="font-semibold">Permitir “Dejar con IA”</h3>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      El administrador, o el ejecutivo de su propio chat, puede
                      delegarlo manualmente a la IA incluso dentro del horario.
                    </p>
                  </div>
                  <Switch
                    checked={config.manual_ai_delegation_enabled}
                    onCheckedChange={(checked) =>
                      update('manual_ai_delegation_enabled', checked)
                    }
                    disabled={disabled || config.operating_mode !== 'automatic'}
                  />
                </div>
              </>
            )}

            {section === 'connections' && (
              <>
                <SectionTitle
                  icon={Link2}
                  title="Conexiones habilitadas"
                  description="Elige canales reales de esta empresa. Ninguna conexión de otra empresa puede aparecer aquí."
                />
                {availableConnections.length === 0 ? (
                  <div className="border-border text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
                    No hay conexiones disponibles. Agrégalas primero en
                    Configuración.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableConnections.map((connection) => (
                      <label
                        key={`${connection.kind}-${connection.id}`}
                        className="border-border flex cursor-pointer items-center gap-4 rounded-2xl border p-4"
                      >
                        <Checkbox
                          checked={connectionSelected(connection)}
                          onCheckedChange={(checked) =>
                            toggleConnection(connection, checked === true)
                          }
                          disabled={disabled}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{connection.name}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {connection.kind === 'whatsapp'
                              ? 'WhatsApp'
                              : connection.kind === 'instagram'
                                ? 'Instagram'
                                : 'Facebook'}
                            {connection.detail ? ` · ${connection.detail}` : ''}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs',
                            connection.status === 'connected'
                              ? 'bg-emerald-500/12 text-emerald-500'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {connection.status === 'connected'
                            ? 'Conectada'
                            : connection.status}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="border-primary/20 bg-primary/5 text-muted-foreground rounded-2xl border p-4 text-sm leading-6">
                  Si no seleccionas ninguna, se mantienen habilitadas todas las
                  conexiones actuales de la empresa por compatibilidad. Al
                  seleccionar una o más, la lista se convierte en una regla
                  estricta.
                </p>
              </>
            )}

            {section === 'permissions' && (
              <>
                <SectionTitle
                  icon={ShieldCheck}
                  title="Permisos"
                  description="Los interruptores disponibles se validan también en el backend."
                />
                <div className="space-y-3">
                  {PERMISSIONS.map((permission) =>
                    (() => {
                      const permissionAvailable =
                        permission.available &&
                        (!permission.requiresAudio || platform.audio_enabled);
                      return (
                        <div
                          key={permission.key}
                          className="border-border flex items-center justify-between gap-5 rounded-2xl border p-5"
                        >
                          <div>
                            <p className="font-semibold">
                              {permission.label}
                              {!permissionAvailable && (
                                <span className="bg-muted text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase">
                                  {permission.requiresAudio
                                    ? 'Requiere activación de Nexora'
                                    : 'Próximamente'}
                                </span>
                              )}
                            </p>
                            <FieldHelp>{permission.description}</FieldHelp>
                          </div>
                          <Switch
                            checked={
                              permissionAvailable &&
                              config.permissions[permission.key]
                            }
                            onCheckedChange={(checked) => {
                              update('permissions', {
                                ...config.permissions,
                                [permission.key]: checked,
                              });
                            }}
                            disabled={disabled || !permissionAvailable}
                          />
                        </div>
                      );
                    })()
                  )}
                </div>
              </>
            )}

            {section === 'leads' && (
              <>
                <SectionTitle
                  icon={Target}
                  title="Datos para calificar leads"
                  description="El agente conversa, pregunta de forma progresiva y guarda solo la información que el cliente confirma."
                />
                <div className="border-primary/20 bg-primary/5 flex items-center justify-between gap-5 rounded-2xl border p-5">
                  <div>
                    <p className="font-semibold">
                      Activar ficha de precalificación
                    </p>
                    <FieldHelp>
                      La IA guardará una ficha privada mientras atiende al lead
                      sin mostrar sus notas internas en WhatsApp.
                    </FieldHelp>
                  </div>
                  <Switch
                    checked={config.permissions.classify_leads}
                    onCheckedChange={(checked) =>
                      update('permissions', {
                        ...config.permissions,
                        classify_leads: checked,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DEFAULT_LEAD_FIELDS.map((field) => (
                    <label
                      key={field}
                      className="border-border flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm"
                    >
                      <Checkbox
                        checked={config.lead_fields.includes(field)}
                        onCheckedChange={(checked) =>
                          toggleList('lead_fields', field, checked === true)
                        }
                        disabled={
                          disabled || !config.permissions.classify_leads
                        }
                      />
                      <span className="capitalize">{field}</span>
                    </label>
                  ))}
                </div>
                <p className="border-primary/20 bg-primary/5 text-muted-foreground rounded-2xl border p-4 text-sm leading-6">
                  La ficha aparecerá en la Bandeja cuando el ejecutivo tome la
                  conversación. Los antecedentes financieros son declarados por
                  el cliente y no representan una aprobación crediticia.
                </p>
              </>
            )}

            {section === 'handoff' && (
              <>
                <SectionTitle
                  icon={UsersRound}
                  title="Reglas de derivación"
                  description="Define cuándo la IA debe recomendar que continúe una persona."
                />
                <div className="space-y-3">
                  {HANDOFF_RULES.map((rule) => (
                    <label
                      key={rule}
                      className="border-border flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm"
                    >
                      <Checkbox
                        checked={config.escalation_rules.includes(rule)}
                        onCheckedChange={(checked) =>
                          toggleList('escalation_rules', rule, checked === true)
                        }
                        disabled={disabled}
                      />
                      {rule}
                    </label>
                  ))}
                </div>
                <p className="border-primary/20 bg-primary/5 text-muted-foreground rounded-2xl border p-4 text-sm leading-6">
                  El agente puede recomendar una derivación, pero no cambia al
                  ejecutivo asignado ni transfiere conversaciones por sí mismo.
                </p>
              </>
            )}

            {section === 'future' && (
              <>
                <SectionTitle
                  icon={CalendarClock}
                  title="Integraciones futuras"
                  description="La estructura está preparada, pero estas funciones no están operativas."
                />
                {[
                  [
                    CalendarClock,
                    'Consultar disponibilidad',
                    'Nexora aún no tiene un calendario funcional conectado.',
                  ],
                  [
                    CalendarClock,
                    'Solicitar una visita',
                    'No se crean citas reales ni simuladas.',
                  ],
                ].map(([Icon, title, description]) => {
                  const FutureIcon = Icon as typeof Bot;
                  return (
                    <div
                      key={String(title)}
                      className="border-border bg-muted/15 flex items-center gap-4 rounded-2xl border p-5 opacity-75"
                    >
                      <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
                        <FutureIcon className="size-5" />
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">{String(title)}</p>
                        <FieldHelp>{String(description)}</FieldHelp>
                      </div>
                      <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase">
                        Próximamente
                      </span>
                      <Switch checked={false} disabled />
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </span>
      <div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          {description}
        </p>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
    </div>
  );
}
