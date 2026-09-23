'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mic2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  AI_PROVIDER_DEFAULT_MODEL,
  DEFAULT_AUDIO_MODELS,
} from '@/lib/ai/defaults';
import type { AiProvider } from '@/lib/ai/types';

interface SafeSettings {
  provider: AiProvider;
  model: string;
  hasKey: boolean;
  keyLastFour: string | null;
  globalEnabled: boolean;
  audioEnabled: boolean;
  transcriptionModel: string;
  speechModel: string;
  speechVoice: string;
}

interface ActionCost {
  action_key: string;
  customer_label: string;
  category: string;
  billing_unit: string;
  points_per_unit: number;
  max_duration_seconds: number | null;
  enabled: boolean;
}

export function PlatformAiSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SafeSettings | null>(null);
  const [costs, setCosts] = useState<ActionCost[]>([]);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState(AI_PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState('');
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [transcriptionModel, setTranscriptionModel] = useState<string>(
    DEFAULT_AUDIO_MODELS.transcription
  );
  const [speechModel, setSpeechModel] = useState<string>(
    DEFAULT_AUDIO_MODELS.speech
  );
  const [speechVoice, setSpeechVoice] = useState<string>(
    DEFAULT_AUDIO_MODELS.voice
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/platform/ai/config', {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        settings?: SafeSettings;
        costs?: ActionCost[];
        error?: string;
      };
      if (!response.ok || !data.settings) {
        throw new Error(data.error ?? 'No se pudo cargar la configuración.');
      }
      setSettings(data.settings);
      setCosts(data.costs ?? []);
      setProvider(data.settings.provider);
      setModel(data.settings.model);
      setGlobalEnabled(data.settings.globalEnabled);
      setAudioEnabled(data.settings.audioEnabled);
      setTranscriptionModel(data.settings.transcriptionModel);
      setSpeechModel(data.settings.speechModel);
      setSpeechVoice(data.settings.speechVoice);
      setApiKey('');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la configuración.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function changeProvider(next: AiProvider) {
    setProvider(next);
    setModel(AI_PROVIDER_DEFAULT_MODEL[next]);
    if (next !== 'openai') setAudioEnabled(false);
  }

  async function save() {
    if (!model.trim()) {
      toast.error('Ingresa el modelo que utilizará Nexora.');
      return;
    }
    if (!settings?.hasKey && !apiKey.trim()) {
      toast.error('Ingresa la API key global.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/platform/ai/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: model.trim(),
          api_key: apiKey.trim() || undefined,
          global_enabled: globalEnabled,
          audio_enabled: audioEnabled,
          transcription_model: transcriptionModel.trim(),
          speech_model: speechModel.trim(),
          speech_voice: speechVoice.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo guardar.');
      }
      toast.success('Configuración global de IA guardada.');
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/80 bg-background/85 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLockup compact />
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/platform" />}
          >
            <ArrowLeft /> Volver a empresas
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-7 sm:px-6 lg:px-8">
        <section className="surface-elevated relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="bg-primary/10 pointer-events-none absolute -top-20 -right-16 size-72 rounded-full blur-3xl" />
          <div className="relative">
            <div className="text-primary mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
              <BrainCircuit className="size-4" /> Infraestructura privada
            </div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">
              Inteligencia Artificial global
            </h1>
            <p className="text-muted-foreground mt-3 max-w-3xl leading-7">
              Esta clave pertenece a Nexora. Se cifra en el servidor, nunca se
              devuelve al navegador y no es visible para administradores ni
              agentes de las empresas.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="text-muted-foreground flex justify-center py-16">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="text-primary size-4" /> Proveedor de
                  texto
                </CardTitle>
                <CardDescription>
                  La clave se valida con el proveedor antes de guardarse.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Proveedor</Label>
                    <Select
                      value={provider}
                      onValueChange={(value) =>
                        changeProvider(value as AiProvider)
                      }
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform-ai-model">Modelo</Label>
                    <Input
                      id="platform-ai-model"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform-ai-key">API key global</Label>
                  <Input
                    id="platform-ai-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      settings?.hasKey
                        ? `Clave guardada terminada en ${settings.keyLastFour ?? '••••'}`
                        : provider === 'openai'
                          ? 'sk-...'
                          : 'sk-ant-...'
                    }
                    autoComplete="new-password"
                    disabled={saving}
                  />
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <LockKeyhole className="size-3.5" />
                    Déjala vacía para conservar la clave guardada.
                  </p>
                </div>

                <div className="border-border flex items-center justify-between gap-4 rounded-xl border p-4">
                  <div>
                    <p className="text-foreground flex items-center gap-2 text-sm font-medium">
                      <ShieldCheck className="size-4" /> Activar IA en Nexora
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Interruptor maestro. Cada empresa también debe habilitarse
                      individualmente.
                    </p>
                  </div>
                  <Switch
                    checked={globalEnabled}
                    onCheckedChange={setGlobalEnabled}
                    disabled={saving}
                  />
                </div>

                <Button onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Validar y guardar
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Costo en Puntos Nexora
                </CardTitle>
                <CardDescription>
                  Reglas activas aplicadas antes de cada solicitud.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {costs.map((cost) => (
                  <div
                    key={cost.action_key}
                    className="border-border flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {cost.customer_label}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {cost.billing_unit === 'per_minute'
                          ? 'Por minuto iniciado'
                          : 'Por operación'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {cost.points_per_unit.toLocaleString('es-CL')} pts
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mic2 className="text-primary size-4" /> Voz del Agente IA
                </CardTitle>
                <CardDescription>
                  Permite comprender notas de voz y deja que el agente decida
                  cuándo una respuesta funciona mejor como audio.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="transcription-model">
                      Modelo de transcripción
                    </Label>
                    <Input
                      id="transcription-model"
                      value={transcriptionModel}
                      onChange={(event) =>
                        setTranscriptionModel(event.target.value)
                      }
                      disabled={saving || audioEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="speech-model">Modelo de voz</Label>
                    <Input
                      id="speech-model"
                      value={speechModel}
                      onChange={(event) => setSpeechModel(event.target.value)}
                      disabled={saving || audioEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Voz</Label>
                    <Select
                      value={speechVoice}
                      onValueChange={(value) => {
                        if (value) setSpeechVoice(value);
                      }}
                      disabled={saving || audioEnabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'alloy',
                          'echo',
                          'fable',
                          'nova',
                          'onyx',
                          'shimmer',
                        ].map((voice) => (
                          <SelectItem key={voice} value={voice}>
                            {voice}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-border flex items-center justify-between gap-4 rounded-xl border p-4">
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      Activar funciones de audio
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Requiere OpenAI. Después, cada empresa decide si permite
                      escuchar y responder con voz.
                    </p>
                  </div>
                  <Switch
                    checked={audioEnabled}
                    onCheckedChange={setAudioEnabled}
                    disabled={saving || provider !== 'openai' || !globalEnabled}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
