import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, LockKeyhole } from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';

export interface LegalNavigationItem {
  id: string;
  label: string;
}

export function LegalPage({
  eyebrow,
  title,
  description,
  updatedAt,
  navigation,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  navigation: LegalNavigationItem[];
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-border/70 bg-background/90 sticky top-0 z-30 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-7">
          <Link href="/" aria-label="Volver al inicio de Nexora">
            <BrandLockup compact className="h-10 w-[122px]" />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground hidden rounded-lg px-3 py-2 font-semibold transition-colors sm:inline-flex"
            >
              Inicio
            </Link>
            <Link
              href="/login"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-xl px-4 py-2 font-bold transition-colors"
            >
              Ingresar
              <ArrowRight className="size-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-border/60 relative overflow-hidden border-b">
          <div className="subtle-grid absolute inset-0 opacity-35" />
          <div className="bg-primary/15 absolute -top-28 right-[8%] size-80 rounded-full blur-3xl" />
          <div className="relative mx-auto max-w-[1240px] px-5 py-14 sm:px-7 sm:py-20">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="size-4" />
              Volver a Nexora
            </Link>
            <div className="max-w-4xl">
              <div className="border-primary/20 bg-primary/10 text-primary mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black tracking-[0.15em] uppercase">
                {icon}
                {eyebrow}
              </div>
              <h1 className="max-w-3xl text-4xl leading-[1.04] font-black tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="text-muted-foreground mt-6 max-w-3xl text-base leading-7 sm:text-lg sm:leading-8">
                {description}
              </p>
              <div className="text-muted-foreground mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="text-primary size-4" />
                  Actualizada el {updatedAt}
                </span>
                <span className="inline-flex items-center gap-2">
                  <LockKeyhole className="size-4 text-emerald-500" />
                  Documento público
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1240px] items-start gap-8 px-5 py-10 sm:px-7 lg:grid-cols-[250px_minmax(0,1fr)] lg:py-14">
          <aside className="border-border/70 bg-card/70 rounded-2xl border p-4 lg:sticky lg:top-24">
            <p className="text-foreground px-2 text-xs font-black tracking-[0.14em] uppercase">
              En esta página
            </p>
            <nav className="mt-3 flex flex-col">
              {navigation.map((item, index) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="text-muted-foreground hover:bg-primary/8 hover:text-primary flex items-start gap-2 rounded-xl px-2.5 py-2 text-sm leading-5 transition-colors"
                >
                  <span className="text-primary/70 mt-0.5 w-5 shrink-0 font-mono text-[10px] font-bold">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 space-y-5">{children}</article>
        </div>
      </main>

      <footer className="border-border/70 bg-card/35 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <BrandLockup compact className="h-9 w-[110px]" />
            <p className="mt-2 text-xs">
              © {new Date().getFullYear()} Nexora CRM.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link
              href="/eliminacion-de-datos"
              className="hover:text-foreground"
            >
              Eliminación de datos
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Ingresar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-border/70 bg-card scroll-mt-24 rounded-3xl border p-5 shadow-sm sm:p-7"
    >
      <h2 className="text-xl font-black tracking-[-0.025em] sm:text-2xl">
        {title}
      </h2>
      <div className="text-muted-foreground mt-4 space-y-4 text-sm leading-7 sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="marker:text-primary ml-5 list-disc space-y-2 pl-1">
      {children}
    </ul>
  );
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border-primary/20 bg-primary/7 text-foreground rounded-2xl border px-4 py-3.5">
      {children}
    </div>
  );
}
