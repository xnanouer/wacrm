'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Menu, X } from 'lucide-react';

import { BrandLockup } from '@/components/brand/brand-mark';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navigation = [
  { label: 'Producto', href: '#producto' },
  { label: 'Funciones', href: '#funciones' },
  { label: 'Integraciones', href: '#integraciones' },
  { label: 'IA', href: '#ia' },
  { label: 'Planes', href: '#planes' },
  { label: 'Preguntas frecuentes', href: '#preguntas' },
] as const;

export function PublicHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <header
      className={cn(
        'z-50 border-b transition-colors',
        overlay
          ? 'bg-background/20 absolute inset-x-0 top-0 border-transparent backdrop-blur-[2px]'
          : 'border-border/70 bg-background/82 sticky top-0 backdrop-blur-xl'
      )}
    >
      <div className="mx-auto flex h-18 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Nexora, página de inicio"
          className="focus-visible:ring-primary rounded-xl outline-none focus-visible:ring-2"
        >
          <BrandLockup compact className="h-12 w-[145px]" />
        </Link>

        <nav
          className="hidden items-center gap-0.5 xl:flex"
          aria-label="Principal"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ModeToggle className="border-border/60 bg-background/65" />
          <Link
            href="/login"
            className={buttonVariants({
              variant: 'ghost',
              className: 'h-10 px-4',
            })}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            className={buttonVariants({
              className:
                'group shadow-primary/25 h-10 rounded-full px-5 shadow-lg',
            })}
          >
            Comenzar gratis
            <ArrowRight
              data-icon="inline-end"
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <ModeToggle className="border-border/60 bg-background/65 ml-auto md:hidden" />

        <button
          type="button"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          onClick={() => setOpen((current) => !current)}
          className="border-border bg-card text-foreground hover:bg-muted flex size-10 items-center justify-center rounded-xl border transition-colors xl:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className={cn(
          'bg-background/96 fixed inset-x-0 top-18 bottom-0 z-40 px-4 py-6 backdrop-blur-xl transition xl:hidden',
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-3 opacity-0'
        )}
        id="public-mobile-menu"
        aria-hidden={!open}
      >
        <nav
          className="mx-auto flex max-w-lg flex-col gap-1"
          aria-label="Principal móvil"
        >
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className="border-border/70 text-foreground hover:border-primary/30 hover:bg-primary/8 flex items-center justify-between border-b px-3 py-4 text-base font-semibold transition-colors"
            >
              <span>
                <span className="text-primary mr-3 text-xs tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {item.label}
              </span>
              <ArrowRight className="text-muted-foreground size-4" />
            </Link>
          ))}
          <div className="mt-6 grid gap-3">
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className={buttonVariants({
                size: 'lg',
                className: 'h-12 rounded-xl',
              })}
            >
              Comenzar gratis
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className={buttonVariants({
                variant: 'outline',
                size: 'lg',
                className: 'h-12 rounded-xl',
              })}
            >
              Iniciar sesión
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
