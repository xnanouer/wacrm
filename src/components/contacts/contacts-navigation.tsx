'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookUser, Database } from 'lucide-react';

import { cn } from '@/lib/utils';

const items = [
  {
    href: '/contacts',
    label: 'Contactos',
    description: 'Gestión individual',
    icon: BookUser,
    exact: true,
  },
  {
    href: '/contacts/base',
    label: 'Base de clientes',
    description: 'Información y exportación',
    icon: Database,
    exact: false,
  },
] as const;

export function ContactsNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones de contactos"
      className="border-border bg-card/70 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border p-1 shadow-sm"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            <span>
              <span className="block text-sm leading-4 font-semibold">
                {item.label}
              </span>
              <span
                className={cn(
                  'block text-[10px] leading-4',
                  active
                    ? 'text-primary-foreground/75'
                    : 'text-muted-foreground'
                )}
              >
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
