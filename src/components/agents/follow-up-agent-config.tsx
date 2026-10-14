'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MessageCircleMore,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FOLLOW_UP_AGENT_ADDON, formatClp } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

const OBJECTIVES = [
  ['follow_up', 'Realizar seguimientos'],
  ['capture_customer_data', 'Captar información del cliente'],
  ['qualify_leads', 'Calificar leads'],
  ['create_opportunities', 'Ayudar a generar oportunidades'],
  ['get_visit', 'Conseguir una visita futura'],
  ['catalog_support', 'Apoyar consultas de catálogo'],
  ['handoff', 'Derivar a un ejecutivo'],
  ['custom', 'Objetivo personalizado'],
] as const;

const TONES = [
  ['commercial', 'Comercial'],
  ['friendly', 'Cercano'],
  ['professional', 'Profesional'],
  ['direct', 'Directo'],
  ['formal', 'Formal'],
  ['technical', 'Técnico'],
  ['custom', 'Personalizado'],
] as const;

const DAYS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [0, 'Dom'],
] as const;

const CHANNELS = [
  ['whatsapp', 'WhatsApp'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
] as const;

interface FollowUpConfig {
  is_active: boolean;
  agent_name: string;
  objective: string;
  custom_objective: string;
  tone: string;
  custom_tone: string;
  additional_instructions: string;
  first_delay_hours: number;
  second_delay_hours: number;
  max_attempts: number;
  timezone: string;
  active_days: number[];
  starts_at: string;
  ends_at: string;
  channels: string[];
  whatsapp_template_name: string;
  whatsapp_template_language: string;
}

interface ResponsePayload {
  entitled: boolean;
  addon: {
    status: string;
    monthly_price_snapshot: number;
    included_points: number;
    current_period_ends_at: string | null;
  } | null;
  config: FollowUpConfig;
  metrics: { total: number; sent: number; pending: number; blocked: number };
  error?: string;
}

function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {help ? (
        <p className="text-muted-foreground text-xs leading-5">{help}</p>
      ) : null}
    </div>
  );
}

export function FollowUpAgentConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ResponsePayload | null>(null);
  const [config, setConfig] = useState<FollowUpConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/follow-up', { cache: 'no-store' });
      const payload = (await response.json()) as ResponsePayload;
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
      setConfig({
        ...payload.config,
        starts_at: payload.config.starts_at.slice(0, 5),
        ends_at: payload.config.ends_at.slice(0, 5),
        whatsapp_template_name: payload.config.whatsapp_template_name ?? '',
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el agente de seguimiento.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FollowUpConfig>(
    key: K,
    value: FollowUpConfig[K]
  ) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const response = await fetch('/api/ai/follow-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo guardar.');
      }
      toast.success('Agente de seguimiento guardado.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data || !config) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-20">
        <Loader2 className="mr-2 size-5 animate-spin" /> Cargando seguimiento...
      </div>
    );
  }

  if (!data.entitled) {
    return (
      <Card className="border-primary/20 overflow-hidden rounded-3xl">
        <CardContent className="relative p-7 sm:p-10">
          <div className="bg-primary/10 pointer-events-none absolute -top-24 right-0 size-72 rounded-full blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <Badge className="mb-4">Complemento opcional</Badge>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                Agente de Seguimiento Pro
              </h2>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-7">
                Recupera clientes que dejaron de responder con mensajes
                personalizados, horarios controlados y cancelación automática
                cuando el cliente vuelve a escribir.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  'Segundo agente independiente',
                  'Hasta 2 seguimientos por cliente',
                  '2.000 Puntos Nexora incluidos',
                  'Respeta las ventanas de Meta',
                ].map((benefit) => (
                  <p key={benefit} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    {benefit}
                  </p>
                ))}
              </div>
            </div>
            <div className="border-primary/20 bg-primary/5 rounded-2xl border p-6 text-center">
              <CreditCard className="text-primary mx-auto size-8" />
              <p className="mt-3 text-3xl font-black">
                {formatClp(FOLLOW_UP_AGENT_ADDON.monthlyPrice)}
              </p>
              <p className="text-muted-foreground text-sm">por mes</p>
              <Link
                href="/plans#follow-up-agent"
                className={cn(buttonVariants(), 'mt-5 w-full')}
              >
                Contratar complemento
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const toggleArray = (
    key: 'active_days' | 'channels',
    value: number | string,
    checked: boolean
  ) => {
    const current = config[key] as Array<number | string>;
    update(
      key,
      (checked
        ? [...new Set([...current, value])]
        : current.filter((item) => item !== value)) as never
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{config.agent_name}</h2>
            <Badge variant={config.is_active ? 'default' : 'outline'}>
              {config.is_active ? 'Activo' : 'Pausado'}
            </Badge>
            <Badge variant="outline">Complemento activo</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Los mensajes generados consumen Puntos Nexora después de los 2.000
            puntos mensuales incluidos.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Guardar seguimiento
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Programados',
            value: data.metrics.pending,
            icon: CalendarClock,
          },
          {
            label: 'Enviados',
            value: data.metrics.sent,
            icon: MessageCircleMore,
          },
          {
            label: 'Bloqueados',
            value: data.metrics.blocked,
            icon: ShieldCheck,
          },
          {
            label: 'Procesados',
            value: data.metrics.total,
            icon: Sparkles,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="text-xl font-black">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="text-primary size-5" /> Configuración del agente
          </CardTitle>
          <CardDescription>
            Solo se programa cuando el último mensaje fue enviado por la empresa
            y el cliente todavía no responde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-7">
          <div className="border-border bg-muted/20 flex items-center justify-between rounded-2xl border p-5">
            <div>
              <p className="font-semibold">Activar seguimientos automáticos</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Al pausarlo se cancelan los seguimientos pendientes.
              </p>
            </div>
            <Switch
              checked={config.is_active}
              onCheckedChange={(checked) => update('is_active', checked)}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nombre del agente">
              <Input
                value={config.agent_name}
                onChange={(event) => update('agent_name', event.target.value)}
              />
            </Field>
            <Field label="Objetivo">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={config.objective}
                onChange={(event) => update('objective', event.target.value)}
              >
                {OBJECTIVES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {config.objective === 'custom' ? (
              <div className="sm:col-span-2">
                <Field label="Objetivo personalizado">
                  <Textarea
                    value={config.custom_objective}
                    onChange={(event) =>
                      update('custom_objective', event.target.value)
                    }
                  />
                </Field>
              </div>
            ) : null}
            <Field label="Tono">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={config.tone}
                onChange={(event) => update('tone', event.target.value)}
              >
                {TONES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zona horaria">
              <Input
                value={config.timezone}
                onChange={(event) => update('timezone', event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Instrucciones adicionales"
            help="Se combinan con la información autorizada del agente principal."
          >
            <Textarea
              className="min-h-28"
              value={config.additional_instructions}
              onChange={(event) =>
                update('additional_instructions', event.target.value)
              }
              placeholder="Ej.: menciona la cotización o el vehículo consultado y ofrece ayuda sin presionar."
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="text-primary size-5" /> Frecuencia y horario
          </CardTitle>
          <CardDescription>
            El primer contacto queda en 20 horas para conservar una ventana
            segura antes del límite de 24 horas de Meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Primer seguimiento (horas)">
              <Input
                type="number"
                min={1}
                max={168}
                value={config.first_delay_hours}
                onChange={(event) =>
                  update('first_delay_hours', Number(event.target.value))
                }
              />
            </Field>
            <Field label="Segundo seguimiento (horas)">
              <Input
                type="number"
                min={1}
                max={336}
                value={config.second_delay_hours}
                onChange={(event) =>
                  update('second_delay_hours', Number(event.target.value))
                }
              />
            </Field>
            <Field label="Máximo de intentos">
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={config.max_attempts}
                onChange={(event) =>
                  update('max_attempts', Number(event.target.value))
                }
              >
                <option value={1}>1 intento</option>
                <option value={2}>2 intentos</option>
                <option value={3}>3 intentos</option>
              </select>
            </Field>
          </div>

          <div>
            <Label>Días de atención</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {DAYS.map(([day, label]) => (
                <label
                  key={day}
                  className="border-border flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={config.active_days.includes(day)}
                    onCheckedChange={(checked) =>
                      toggleArray('active_days', day, checked === true)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Desde">
              <Input
                type="time"
                value={config.starts_at}
                onChange={(event) => update('starts_at', event.target.value)}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="time"
                value={config.ends_at}
                onChange={(event) => update('ends_at', event.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Canales y reglas de Meta</CardTitle>
          <CardDescription>
            Facebook e Instagram se bloquean al cerrar su ventana. WhatsApp
            necesita una plantilla aprobada para continuar fuera de 24 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map(([channel, label]) => (
              <label
                key={channel}
                className="border-border flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm"
              >
                <Checkbox
                  checked={config.channels.includes(channel)}
                  onCheckedChange={(checked) =>
                    toggleArray('channels', channel, checked === true)
                  }
                />
                {label}
              </label>
            ))}
          </div>

          {config.channels.includes('whatsapp') ? (
            <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
              <Field
                label="Plantilla aprobada de WhatsApp"
                help="Nombre exacto en Meta. Se usa solamente cuando la ventana de conversación ya cerró."
              >
                <Input
                  value={config.whatsapp_template_name}
                  onChange={(event) =>
                    update('whatsapp_template_name', event.target.value)
                  }
                  placeholder="seguimiento_cotizacion"
                />
              </Field>
              <Field label="Idioma de plantilla">
                <Input
                  value={config.whatsapp_template_language}
                  onChange={(event) =>
                    update('whatsapp_template_language', event.target.value)
                  }
                  placeholder="es_CL"
                />
              </Field>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
