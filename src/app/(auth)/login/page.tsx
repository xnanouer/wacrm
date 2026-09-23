'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { ProductPreview } from '@/components/marketing/product-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo iniciar sesión');
      }

      window.location.assign(
        inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : '/dashboard'
      );
    } catch (loginError) {
      setError(
        loginError instanceof DOMException && loginError.name === 'AbortError'
          ? 'La conexión tardó demasiado. Intenta nuevamente.'
          : loginError instanceof Error
            ? loginError.message
            : 'No se pudo iniciar sesión'
      );
      setLoading(false);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  return (
    <div className="subtle-grid bg-background min-h-screen p-3 sm:p-5">
      <div className="border-border/60 bg-card relative mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-[1600px] overflow-hidden rounded-[32px] border shadow-[0_32px_100px_-46px_rgba(0,0,0,.48)] sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[0.8fr_1.2fr]">
        <main className="bg-background relative z-10 flex items-center overflow-hidden px-7 py-12 sm:px-14 lg:px-16 xl:px-24">
          <div className="bg-primary/8 pointer-events-none absolute -top-52 -left-44 size-[34rem] rounded-full blur-[110px]" />
          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                aria-label="Volver al inicio de Nexora"
                className="focus-visible:ring-primary/50 inline-flex rounded-xl outline-none focus-visible:ring-2"
              >
                <BrandLockup className="h-[64px] w-[190px] sm:h-[82px] sm:w-[246px]" />
              </Link>
              <ModeToggle showLabel className="shrink-0" />
            </div>

            <div className="mt-12 sm:mt-14">
              {inviteToken && (
                <div className="text-primary mb-4 flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase">
                  <UsersRound className="size-4" /> Invitación a un equipo
                </div>
              )}
              <h1 className="text-foreground text-4xl font-bold tracking-[-0.055em] sm:text-[44px] sm:leading-[1.05]">
                {inviteToken ? 'Accede para unirte' : 'Bienvenido de nuevo'}
              </h1>
              <p className="text-muted-foreground mt-4 text-base leading-7 sm:text-[17px]">
                {inviteToken
                  ? 'Inicia sesión para aceptar la invitación y entrar al espacio de tu equipo.'
                  : 'Ingresa tus datos para continuar a tu espacio de trabajo.'}
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-9 space-y-6">
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-[15px] text-red-500"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-foreground text-[15px] font-semibold"
                >
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="border-border bg-muted/55 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 h-[54px] rounded-2xl px-4 text-base"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label
                    htmlFor="password"
                    className="text-foreground text-[15px] font-semibold"
                  >
                    Contraseña
                  </Label>
                  <Link
                    href="/forgot-password"
                    className="text-primary hover:text-primary-hover text-[15px] font-medium transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="border-border bg-muted/55 text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20 h-[54px] rounded-2xl px-4 pr-12 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="size-[18px]" />
                    ) : (
                      <Eye className="size-[18px]" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary-hover h-[54px] w-full rounded-2xl text-base font-bold shadow-xl transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-55"
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
                {!loading && <ArrowRight className="size-4" />}
              </Button>
            </form>

            <div className="border-border mt-7 border-t pt-6 text-center">
              <p className="text-muted-foreground text-[15px]">
                ¿Aún no tienes una cuenta?{' '}
                <Link
                  href={
                    inviteToken
                      ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                      : '/signup'
                  }
                  className="text-primary hover:text-primary-hover font-semibold transition-colors"
                >
                  Crear cuenta
                </Link>
              </p>
            </div>

            <div className="text-muted-foreground mt-10 flex items-center justify-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-emerald-500" />
              Acceso seguro y datos separados por empresa
            </div>
          </div>
        </main>

        <aside className="dark relative hidden overflow-hidden bg-[linear-gradient(145deg,#14142b_0%,#0a0b18_46%,#11102a_100%)] p-8 text-white lg:flex lg:flex-col lg:justify-center xl:p-12">
          <div className="subtle-grid pointer-events-none absolute inset-0 opacity-20" />
          <div className="pointer-events-none absolute -top-44 -left-24 size-[34rem] rounded-full bg-violet-600/25 blur-[120px]" />
          <div className="pointer-events-none absolute -right-40 -bottom-44 size-[30rem] rounded-full bg-blue-500/15 blur-[110px]" />

          <div className="relative mx-auto w-full max-w-[800px]">
            <div>
              <div className="max-w-xl">
                <p className="text-xs font-bold tracking-[0.2em] text-violet-300 uppercase">
                  Nexora en acción
                </p>
                <h2 className="mt-4 text-4xl font-bold tracking-[-0.055em] text-white xl:text-5xl xl:leading-[1.04]">
                  Todo tu equipo, en una sola conversación.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
                  Atiende, organiza y convierte oportunidades sin perder el
                  contexto de cada cliente.
                </p>
              </div>
            </div>

            <div className="relative mt-7">
              <div className="pointer-events-none absolute inset-x-[10%] bottom-[-4%] h-28 rounded-[50%] bg-violet-500/25 blur-[45px]" />
              <div
                className="relative mx-auto w-[108%] origin-center"
                style={{
                  transform:
                    'perspective(1500px) rotateY(-4deg) rotateX(1.5deg) scale(.88)',
                }}
              >
                <ProductPreview />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-7 text-sm text-slate-300">
              {[
                'Bandeja compartida',
                'Seguimiento comercial',
                'Automatizaciones',
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                    <Check className="size-2.5" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
