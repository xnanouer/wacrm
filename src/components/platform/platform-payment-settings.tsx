'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { BrandLockup } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface SafePaymentSettings {
  provider: 'mercadopago';
  environment: 'test' | 'production';
  enabled: boolean;
  hasAccessToken: boolean;
  accessTokenLastFour: string | null;
  hasWebhookSecret: boolean;
  webhookSecretLastFour: string | null;
}

export function PlatformPaymentSettings() {
  const [settings, setSettings] = useState<SafePaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [environment, setEnvironment] = useState<'test' | 'production'>('test');
  const [enabled, setEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/platform/payments/config', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        settings?: SafePaymentSettings;
        error?: string;
      };
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || 'No se pudo cargar la configuración.');
      }
      setSettings(payload.settings);
      setEnvironment(payload.settings.environment);
      setEnabled(payload.settings.enabled);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/billing/mercadopago/webhook`);
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/platform/payments/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          environment,
          enabled,
          accessToken,
          webhookSecret,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        settings?: SafePaymentSettings;
        error?: string;
      } | null;
      if (!response.ok || !payload?.settings) {
        throw new Error(payload?.error || 'No se pudo guardar.');
      }
      setSettings(payload.settings);
      setAccessToken('');
      setWebhookSecret('');
      toast.success('Configuración de pagos guardada');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border bg-background/90 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLockup compact />
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/platform" />}
          >
            <ArrowLeft /> Volver a Plataforma
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            Solo creador de plataforma
          </p>
          <h1 className="mt-2 text-3xl font-bold">Pagos de Nexora</h1>
          <p className="text-muted-foreground mt-2">
            Conecta tu cuenta de Mercado Pago. Ninguna empresa puede ver estas
            credenciales.
          </p>
        </div>

        {loading || !settings ? (
          <Card>
            <CardContent className="flex min-h-64 items-center justify-center">
              <Loader2 className="text-primary size-7 animate-spin" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="text-primary" /> Mercado Pago
                Suscripciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modo</Label>
                  <Select
                    value={environment}
                    onValueChange={(value) =>
                      setEnvironment(
                        value === 'production' ? 'production' : 'test'
                      )
                    }
                    disabled={saving || enabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">
                        Pruebas (sin cobros reales)
                      </SelectItem>
                      <SelectItem value="production">
                        Producción (cobros reales)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="border-border flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <p className="text-sm font-semibold">Habilitar cobros</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Interruptor maestro de seguridad.
                    </p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mp-access-token">
                  Access Token{' '}
                  {settings.hasAccessToken
                    ? `(guardado ···${settings.accessTokenLastFour})`
                    : ''}
                </Label>
                <div className="relative">
                  <KeyRound className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="mp-access-token"
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    placeholder={
                      settings.hasAccessToken
                        ? 'Dejar vacío para conservar'
                        : 'APP_USR-... o TEST-...'
                    }
                    className="pl-10"
                    autoComplete="new-password"
                    disabled={saving}
                  />
                </div>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <LockKeyhole className="size-3.5" /> Se cifra antes de
                  guardarse.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mp-webhook-secret">
                  Firma secreta del webhook{' '}
                  {settings.hasWebhookSecret
                    ? `(guardada ···${settings.webhookSecretLastFour})`
                    : ''}
                </Label>
                <Input
                  id="mp-webhook-secret"
                  type="password"
                  value={webhookSecret}
                  onChange={(event) => setWebhookSecret(event.target.value)}
                  placeholder="Firma secreta de Mercado Pago"
                  autoComplete="new-password"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>URL del webhook</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(webhookUrl);
                      toast.success('URL copiada');
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  En producción debe usar tu dominio HTTPS.
                </p>
              </div>

              <div className="border-border bg-muted/30 flex gap-3 rounded-xl border p-4">
                <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
                <p className="text-muted-foreground text-sm">
                  Mantén el modo de pruebas hasta completar un pago, un rechazo
                  y una reactivación controlada.
                </p>
              </div>

              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <CheckCircle2 />
                )}
                Validar y guardar
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
