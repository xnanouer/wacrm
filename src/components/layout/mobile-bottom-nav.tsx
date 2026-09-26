'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CarFront,
  GitBranch,
  Home,
  Menu,
  MessageSquare,
  ReceiptText,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { hasMinRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  onOpenMore: () => void;
  moreOpen?: boolean;
  totalUnread?: number;
}

interface MobileNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function isCurrentPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav({
  onOpenMore,
  moreOpen = false,
  totalUnread = 0,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const { accountRole } = useAuth();
  const isAdmin = Boolean(accountRole && hasMinRole(accountRole, 'admin'));

  const items: MobileNavItem[] = isAdmin
    ? [
        { href: '/dashboard', label: 'Inicio', icon: Home },
        { href: '/inbox', label: 'Bandeja', icon: MessageSquare },
        { href: '/pipelines', label: 'Leads', icon: GitBranch },
        { href: '/contacts', label: 'Contactos', icon: Users },
      ]
    : [
        { href: '/inbox', label: 'Bandeja', icon: MessageSquare },
        { href: '/catalogo', label: 'Catálogo', icon: CarFront },
        { href: '/quotes', label: 'Cotizar', icon: ReceiptText },
        { href: '/coach', label: 'Coach IA', icon: Sparkles },
      ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="border-border/70 bg-background/96 z-30 grid shrink-0 grid-cols-5 border-t px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-10px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl md:hidden"
    >
      {items.map((item) => {
        const active = isCurrentPath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {item.href === '/inbox' && totalUnread > 0 ? (
                <span className="bg-destructive text-primary-foreground absolute -top-2 -right-2 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-4 font-bold">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onOpenMore}
        aria-expanded={moreOpen}
        aria-label="Abrir más opciones"
        className={cn(
          'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors',
          moreOpen
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Menu className="size-5" />
        <span>Más</span>
      </button>
    </nav>
  );
}
