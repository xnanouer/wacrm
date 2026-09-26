'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Resumen',
  '/inbox': 'Bandeja',
  '/notifications': 'Notificaciones',
  '/contacts': 'Contactos',
  '/catalogo': 'Catálogo',
  '/pipelines': 'Oportunidades',
  '/broadcasts': 'Campañas',
  '/automations': 'Automatizaciones',
  '/flows': 'Flujos',
  '/agents': 'Agentes IA',
  '/support': 'Ayuda y soporte',
  '/settings': 'Configuración',
};

const pageDescriptions: Record<string, string> = {
  '/dashboard': 'Resumen de tu operación',
  '/inbox': 'Conversaciones del equipo',
  '/notifications': 'Actividad que requiere atención',
  '/contacts': 'Personas y empresas',
  '/catalogo': 'Inventario de vehículos',
  '/pipelines': 'Oportunidades comerciales',
  '/broadcasts': 'Campañas y envíos',
  '/automations': 'Procesos automáticos',
  '/flows': 'Experiencias conversacionales',
  '/agents': 'Asistentes inteligentes',
  '/support': 'Soporte oficial de Nexora',
  '/settings': 'Configuración del espacio',
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'Dashboard';
}

function getPageDescription(pathname: string): string {
  if (pageDescriptions[pathname]) return pageDescriptions[pathname];
  const match = Object.entries(pageDescriptions).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : pageDescriptions['/dashboard'];
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { profile, account, signOut } = useAuth();
  const title = getPageTitle(pathname);
  const description = getPageDescription(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border/60 bg-background/76 supports-[backdrop-filter]:bg-background/64 flex h-[72px] shrink-0 items-center justify-between gap-3 border-b px-4 shadow-[0_1px_0_color-mix(in_oklab,white_5%,transparent)_inset] backdrop-blur-2xl sm:px-7 md:h-[84px] lg:px-10 xl:px-12">
      <div className="flex min-w-0 items-center gap-4">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="border-border/70 bg-card/70 text-muted-foreground hover:bg-muted hover:text-foreground hidden size-11 items-center justify-center rounded-xl border transition-colors md:flex lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-foreground truncate text-lg font-semibold tracking-[-0.03em] sm:text-xl">
              {title}
            </h1>
            <span className="text-border hidden sm:inline">/</span>
            <span className="text-muted-foreground hidden max-w-80 truncate text-[15px] sm:inline">
              {description}
            </span>
          </div>
          {account?.name && (
            <p className="text-muted-foreground/75 mt-1 hidden truncate text-sm font-medium md:block">
              {account.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <div className="mr-1 hidden items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/8 px-4 py-2.5 text-sm font-semibold text-emerald-500 xl:flex">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          Sistema operativo
        </div>
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:border-border/70 hover:bg-card/70 focus:bg-card/70 data-popup-open:bg-card/70 flex items-center gap-2 rounded-xl border border-transparent px-1 py-1 transition-colors focus:outline-none sm:gap-3 sm:pr-3 sm:pl-1"
            aria-label="Open account menu"
          >
            <Avatar className="ring-primary/15 size-10 ring-2">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? 'Avatar'}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-foreground hidden text-[15px] font-medium sm:inline">
              {profile?.full_name ?? 'User'}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border min-w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <User className="size-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=whatsapp"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
