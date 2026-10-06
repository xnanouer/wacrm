'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

interface CoachingSettings {
  account_id: string;
  enabled: boolean;
  analyze_on_close: boolean;
  notify_agent: boolean;
  notify_admins: boolean;
  min_human_messages: number;
}

interface CoachingReview {
  id: string;
  conversation_id: string;
  agent_user_id: string;
  status: 'processing' | 'completed' | 'failed';
  contact_name: string | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  next_actions: string[];
  scores: Record<string, number>;
  overall_score: number | null;
  analyzed_message_count: number;
  created_at: string;
}

interface CoachProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface CoachResponse {
  role: AccountRole;
  current_user_id: string;
  settings: CoachingSettings;
  reviews: CoachingReview[];
  profiles: CoachProfile[];
}

function scoreTone(score: number | null) {
  if (score === null) return 'border-border bg-muted text-muted-foreground';
  if (score >= 80)
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500';
  if (score >= 60) return 'border-amber-500/25 bg-amber-500/10 text-amber-500';
  return 'border-rose-500/25 bg-rose-500/10 text-rose-500';
}

export default function CoachPage() {
  const [data, setData] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentFilter, setAgentFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ai/coach', { cache: 'no-store' });
      const payload = (await response.json()) as CoachResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar');
      setData(payload);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cargar el Coach IA'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateSettings = useCallback(
    async (patch: Partial<CoachingSettings>) => {
      if (!data) return;
      const previous = data.settings;
      const next = { ...previous, ...patch };
      setData({ ...data, settings: next });
      setSaving(true);
      try {
        const response = await fetch('/api/ai/coach', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        const payload = (await response.json()) as {
          settings?: CoachingSettings;
          error?: string;
        };
        if (!response.ok || !payload.settings) {
          throw new Error(payload.error || 'No se pudo guardar');
        }
        setData((current) =>
          current
            ? { ...current, settings: payload.settings as CoachingSettings }
            : current
        );
        toast.success('Configuracion del Coach IA actualizada');
      } catch (error) {
        setData((current) =>
          current ? { ...current, settings: previous } : current
        );
        toast.error(
          error instanceof Error ? error.message : 'No se pudo guardar'
        );
      } finally {
        setSaving(false);
      }
    },
    [data]
  );

  const profilesById = useMemo(
    () => new Map(data?.profiles.map((profile) => [profile.user_id, profile])),
    [data?.profiles]
  );
  const isManager = Boolean(data?.role && hasMinRole(data.role, 'admin'));
  const visibleReviews = useMemo(
    () =>
      (data?.reviews ?? []).filter(
        (review) =>
          agentFilter === 'all' || review.agent_user_id === agentFilter
      ),
    [agentFilter, data?.reviews]
  );
  const completedReviews = visibleReviews.filter(
    (review) => review.status === 'completed'
  );
  const averageScore = completedReviews.length
    ? Math.round(
        completedReviews.reduce(
          (sum, review) => sum + (review.overall_score ?? 0),
          0
        ) / completedReviews.length
      )
    : null;

  if (loading && !data) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="text-primary size-7 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-border bg-card rounded-3xl border p-10 text-center">
        <p className="text-foreground font-semibold">
          No fue posible abrir el Coach IA
        </p>
        <Button className="mt-4" onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="nexora-page-stack max-w-full min-w-0 overflow-x-hidden">
      <section className="border-primary/20 from-primary/10 via-card to-card relative min-w-0 overflow-hidden rounded-[24px] border bg-gradient-to-br p-5 sm:rounded-[32px] sm:p-9">
        <div className="bg-primary/15 pointer-events-none absolute -top-20 right-10 size-64 rounded-full blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="bg-primary/12 text-primary ring-primary/20 flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 sm:size-12">
                <BrainCircuit className="size-6" />
              </span>
              <div>
                <p className="nexora-kicker">Desarrollo del equipo</p>
                <h1 className="text-foreground mt-1 text-[1.7rem] leading-tight font-bold tracking-[-0.04em] sm:text-4xl">
                  Coach IA Nexora
                </h1>
              </div>
            </div>
            <p className="text-muted-foreground mt-5 max-w-3xl text-base leading-7">
              Recomendaciones privadas y constructivas basadas solamente en
              conversaciones atendidas por personas. Los mensajes del Agente IA
              nunca se califican como trabajo del ejecutivo.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </section>

      {isManager ? (
        <section className="border-border bg-card min-w-0 overflow-hidden rounded-[24px] border p-5 sm:rounded-[28px] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h2 className="text-foreground text-lg font-semibold">
                  Analisis automatico al cerrar
                </h2>
                <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-6">
                  Solo se ejecuta cuando hay un ejecutivo asignado y mensajes
                  humanos suficientes. Cada analisis utiliza 2 Puntos Nexora.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm">
                {data.settings.enabled ? 'Activo' : 'Desactivado'}
              </span>
              <Switch
                checked={data.settings.enabled}
                onCheckedChange={(checked) =>
                  updateSettings({ enabled: checked })
                }
                disabled={saving}
                aria-label="Activar Coach IA"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <SettingToggle
              title="Avisar al agente"
              description="Entrega su recomendacion de forma privada."
              checked={data.settings.notify_agent}
              disabled={saving || !data.settings.enabled}
              onChange={(checked) => updateSettings({ notify_agent: checked })}
            />
            <SettingToggle
              title="Avisar a administradores"
              description="Informa cuando exista una nueva revision."
              checked={data.settings.notify_admins}
              disabled={saving || !data.settings.enabled}
              onChange={(checked) => updateSettings({ notify_admins: checked })}
            />
            <div className="border-border bg-muted/25 rounded-2xl border p-4">
              <p className="text-foreground text-sm font-semibold">
                Minimo de respuestas humanas
              </p>
              <select
                value={data.settings.min_human_messages}
                onChange={(event) =>
                  updateSettings({
                    min_human_messages: Number(event.target.value),
                  })
                }
                disabled={saving || !data.settings.enabled}
                className="border-border bg-background text-foreground mt-3 h-10 w-full rounded-xl border px-3 text-sm disabled:opacity-50"
              >
                {[1, 2, 3, 4, 5, 8, 10].map((value) => (
                  <option key={value} value={value}>
                    {value} respuesta{value === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={Sparkles}
          label="Revisiones disponibles"
          value={String(completedReviews.length)}
        />
        <MetricCard
          icon={Target}
          label="Puntaje promedio"
          value={averageScore === null ? 'Sin datos' : `${averageScore}/100`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Privacidad"
          value="Solo humanos"
        />
      </section>

      <section>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="nexora-kicker">
              {isManager ? 'Supervision del equipo' : 'Mi desarrollo'}
            </p>
            <h2 className="text-foreground mt-2 text-2xl font-bold tracking-[-0.03em]">
              Recomendaciones recientes
            </h2>
          </div>
          {isManager && data.profiles.length > 0 ? (
            <select
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="border-border bg-card text-foreground h-12 w-full max-w-full rounded-xl border px-4 text-base sm:h-11 sm:w-auto sm:text-sm"
            >
              <option value="all">Todo el equipo</option>
              {data.profiles.map((profile) => (
                <option key={profile.user_id} value={profile.user_id}>
                  {profile.full_name || profile.email || 'Ejecutivo'}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {visibleReviews.length === 0 ? (
          <div className="border-border bg-card flex min-h-72 flex-col items-center justify-center rounded-[28px] border border-dashed p-8 text-center">
            <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
              <BrainCircuit className="size-7" />
            </span>
            <h3 className="text-foreground mt-5 text-lg font-semibold">
              Todavia no hay recomendaciones
            </h3>
            <p className="text-muted-foreground mt-2 max-w-lg text-sm leading-6">
              {data.settings.enabled
                ? 'Apareceran despues de cerrar una conversacion atendida por un ejecutivo.'
                : 'Un administrador debe activar el Coach IA para comenzar los analisis.'}
            </p>
          </div>
        ) : (
          <div className="grid max-w-full min-w-0 gap-4 xl:grid-cols-2">
            {visibleReviews.map((review) => {
              const profile = profilesById.get(review.agent_user_id);
              return (
                <ReviewCard key={review.id} review={review} profile={profile} />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-border bg-muted/25 flex items-center justify-between gap-4 rounded-2xl border p-4">
      <div>
        <p className="text-foreground text-sm font-semibold">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-muted-foreground text-xs font-medium uppercase">
            {label}
          </p>
          <p className="text-foreground mt-1 text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  profile,
}: {
  review: CoachingReview;
  profile?: CoachProfile;
}) {
  const agentName = profile?.full_name || profile?.email || 'Ejecutivo';
  const initials = agentName.charAt(0).toUpperCase();

  if (review.status !== 'completed') {
    return (
      <article className="border-border bg-card flex max-w-full min-w-0 items-center gap-4 overflow-hidden rounded-[24px] border p-5">
        {review.status === 'processing' ? (
          <Loader2 className="text-primary size-5 animate-spin" />
        ) : (
          <BrainCircuit className="text-muted-foreground size-5" />
        )}
        <div>
          <p className="text-foreground text-sm font-semibold">
            {review.status === 'processing'
              ? 'Analizando conversacion humana'
              : 'No fue posible completar este analisis'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">{agentName}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="border-border bg-card w-full max-w-full min-w-0 overflow-hidden rounded-[22px] border p-4 shadow-sm sm:rounded-[26px] sm:p-6">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="ring-primary/15 size-10 shrink-0 ring-2 sm:size-11">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={agentName} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-foreground line-clamp-2 min-w-0 leading-5 font-semibold break-words">
              {agentName}
            </p>
            <p className="text-muted-foreground mt-0.5 min-w-0 text-xs leading-4 [overflow-wrap:anywhere] break-words">
              {review.contact_name
                ? `Conversacion con ${review.contact_name}`
                : 'Conversacion atendida'}{' '}
              ·{' '}
              {formatDistanceToNow(new Date(review.created_at), {
                addSuffix: true,
                locale: es,
              })}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-1 text-xs font-bold sm:px-3 sm:py-1.5 sm:text-sm',
            scoreTone(review.overall_score)
          )}
        >
          {review.overall_score ?? '--'}/100
        </span>
      </div>

      <p className="text-foreground/90 mt-4 min-w-0 text-sm leading-6 [overflow-wrap:anywhere] break-words sm:mt-5">
        {review.summary}
      </p>

      <div className="mt-4 grid min-w-0 gap-3 sm:mt-5 sm:grid-cols-2">
        <FeedbackList
          icon={CheckCircle2}
          title="Lo que hiciste bien"
          items={review.strengths}
          tone="success"
        />
        <FeedbackList
          icon={Lightbulb}
          title="Proxima mejora"
          items={review.improvements}
          tone="primary"
        />
      </div>

      {review.next_actions.length > 0 ? (
        <div className="border-primary/15 bg-primary/5 mt-3 min-w-0 overflow-hidden rounded-2xl border p-3.5 sm:p-4">
          <p className="text-primary flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
            <Target className="size-4" /> Acciones recomendadas
          </p>
          <ul className="text-foreground/85 mt-3 min-w-0 space-y-2 text-sm">
            {review.next_actions.map((item) => (
              <li key={item} className="flex min-w-0 gap-2">
                <ChevronRight className="text-primary mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere] break-words">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="text-muted-foreground mt-4 flex min-w-0 items-center gap-2 text-xs break-words">
        <UsersRound className="size-3.5" />
        {review.analyzed_message_count} mensajes humanos considerados
      </div>
    </article>
  );
}

function FeedbackList({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof CheckCircle2;
  title: string;
  items: string[];
  tone: 'success' | 'primary';
}) {
  return (
    <div className="border-border bg-muted/20 max-w-full min-w-0 overflow-hidden rounded-2xl border p-3.5 sm:p-4">
      <p
        className={cn(
          'flex items-center gap-2 text-xs font-bold tracking-wide uppercase',
          tone === 'success' ? 'text-emerald-500' : 'text-primary'
        )}
      >
        <Icon className="size-4" /> {title}
      </p>
      {items.length > 0 ? (
        <ul className="text-foreground/85 mt-3 min-w-0 list-disc space-y-2 pl-5 text-sm leading-5 marker:text-current">
          {items.map((item) => (
            <li
              key={item}
              className="min-w-0 [overflow-wrap:anywhere] break-words"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">Sin observaciones.</p>
      )}
    </div>
  );
}
