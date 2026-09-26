'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { BrandLockup } from '@/components/brand/brand-mark';
import { useAuth } from '@/hooks/use-auth';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import {
  Bell,
  Bot,
  BrainCircuit,
  CarFront,
  Building2,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  LifeBuoy,
  Radio,
  ReceiptText,
  FileSignature,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  WalletCards,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';
import { homePathForRole } from '@/lib/auth/route-access';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; label: string; className: string }
> = {
  owner: {
    icon: Shield,
    label: 'Administrador',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  admin: {
    icon: Shield,
    label: 'Administrador',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  supervisor: {
    icon: UsersRound,
    label: 'Supervisor',
    className: 'border-sky-500/35 bg-sky-500/10 text-sky-400',
  },
  agent: {
    icon: UserCog,
    label: 'Agente',
    // Neutral slate: the operational default.
    className: 'border-border bg-muted text-foreground',
  },
  viewer: {
    icon: User,
    label: 'Visor',
    // Muted slate: read-only role; visually quieter than agent.
    className: 'border-border bg-card text-muted-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
  /** Visible roadmap item without a route or click behaviour. */
  comingSoon?: boolean;
  minRole?: AccountRole;
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Resumen',
    icon: LayoutDashboard,
    minRole: 'admin',
  },
  { href: '/inbox', label: 'Bandeja', icon: MessageSquare },
  { href: '/notifications', label: 'Notificaciones', icon: Bell },
  { href: '/contacts', label: 'Contactos', icon: Users, minRole: 'admin' },
  { href: '/catalogo', label: 'Catálogo', icon: CarFront, minRole: 'agent' },
  {
    href: '/quotes',
    label: 'Cotizaciones',
    icon: ReceiptText,
    minRole: 'agent',
  },
  {
    href: '/contracts',
    label: 'Contratos',
    icon: FileSignature,
    minRole: 'agent',
  },
  {
    href: '/pipelines',
    label: 'Oportunidades',
    icon: GitBranch,
    minRole: 'admin',
  },
  { href: '/broadcasts', label: 'Campañas', icon: Radio, minRole: 'admin' },
  {
    href: '/marketing',
    label: 'Nexora Marketing',
    icon: Megaphone,
    comingSoon: true,
  },
  {
    href: '/automations',
    label: 'Automatizaciones',
    icon: Zap,
    minRole: 'admin',
  },
  {
    href: '/flows',
    label: 'Flujos',
    icon: Workflow,
    beta: true,
    minRole: 'admin',
  },
  { href: '/agents', label: 'Agentes IA', icon: Bot, minRole: 'admin' },
  { href: '/coach', label: 'Coach IA', icon: BrainCircuit, minRole: 'agent' },
];

const bottomNavItems: NavItem[] = [
  {
    href: '/support',
    label: 'Ayuda y soporte',
    icon: LifeBuoy,
  },
  {
    href: '/plans',
    label: 'Planes y pagos',
    icon: WalletCards,
    minRole: 'admin',
  },
  { href: '/settings', label: 'Configuración', icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
  /** Total unread inbox messages, shared with the browser-tab badge. */
  totalUnread?: number;
}

export function Sidebar({
  open = false,
  onClose,
  totalUnread = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const {
    profile,
    profileLoading,
    account,
    accountRole,
    platformRole,
    signOut,
  } = useAuth();
  const unreadNotifications = useUnreadNotifications();
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading && !!account?.name && account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          'bg-background/70 fixed inset-0 z-30 backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          'border-sidebar-border/70 bg-sidebar/94 fixed inset-y-0 left-0 z-40 flex h-dvh w-[min(88vw,304px)] flex-col border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/20 backdrop-blur-2xl',
          'transition-transform duration-200 ease-out will-change-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static, always visible — reset all the mobile framing.
          'lg:static lg:z-0 lg:h-full lg:w-[304px] lg:translate-x-0 lg:pt-0 lg:pb-0 lg:shadow-none lg:transition-none'
        )}
        aria-label="Primary"
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div className="flex h-[104px] shrink-0 items-center justify-between gap-2 px-7">
          <Link
            href={homePathForRole(accountRole)}
            className="focus-visible:ring-primary rounded-xl outline-none focus-visible:ring-2"
          >
            <BrandLockup />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <ScrollArea className="min-h-0 flex-1">
          <nav className="px-4 py-5">
            <p className="text-muted-foreground/70 mb-3 px-3.5 text-xs font-bold tracking-[0.16em] uppercase">
              Espacio de trabajo
            </p>
            <ul className="flex flex-col gap-2">
              {navItems
                .filter(
                  (item) =>
                    !item.minRole ||
                    (!!accountRole && hasMinRole(accountRole, item.minRole))
                )
                .map((item) => {
                  if (item.comingSoon) {
                    return (
                      <li key={item.href}>
                        <div
                          aria-disabled="true"
                          title="Nexora Marketing estará disponible muy pronto"
                          className="text-muted-foreground/65 flex min-h-12 cursor-not-allowed items-center gap-3.5 rounded-2xl px-4 py-3 text-base font-medium select-none"
                        >
                          <item.icon className="size-5" />
                          <span className="flex-1">{item.label}</span>
                          <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-1 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase">
                            Muy pronto
                          </span>
                        </div>
                      </li>
                    );
                  }

                  const isActive =
                    pathname === item.href ||
                    (item.href !== '/dashboard' &&
                      pathname.startsWith(item.href));

                  const showUnreadDot =
                    item.href === '/inbox' && totalUnread > 0 && !isActive;

                  // Unlike the inbox dot, the notifications count stays visible
                  // even while the page is active — it reflects unread state
                  // (cleared by marking notifications read), not "currently
                  // viewing this section".
                  const showNotificationBadge =
                    item.href === '/notifications' && unreadNotifications > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          // Taller on mobile so fingers can hit the row reliably (≥44px).
                          'group relative flex min-h-12 items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3 text-base font-medium transition-all duration-200',
                          isActive
                            ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-full shadow-[0_0_12px_var(--primary)]" />
                        )}
                        <item.icon
                          className={cn(
                            'size-5 transition-transform duration-200 group-hover:scale-105',
                            isActive && 'stroke-[2.4]'
                          )}
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.beta && (
                          <span
                            aria-label="Beta feature"
                            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-amber-300 uppercase"
                          >
                            Beta
                          </span>
                        )}
                        {showUnreadDot && (
                          <span
                            aria-label={`${totalUnread} unread conversation${totalUnread === 1 ? '' : 's'}`}
                            className="relative flex h-2 w-2"
                          >
                            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                            <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
                          </span>
                        )}
                        {showNotificationBadge && (
                          <span
                            aria-label={`${unreadNotifications} unread notification${unreadNotifications === 1 ? '' : 's'}`}
                            className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold"
                          >
                            {unreadNotifications > 9
                              ? '9+'
                              : unreadNotifications}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>

            <div className="border-sidebar-border my-4 border-t" />

            <p className="text-muted-foreground/70 mb-2.5 px-3 text-[11px] font-bold tracking-[0.16em] uppercase">
              Administración
            </p>

            <ul className="flex flex-col gap-1.5">
              {platformRole && (
                <li>
                  <Link
                    href="/platform"
                    className={cn(
                      'group relative flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-200',
                      pathname.startsWith('/platform')
                        ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <Building2 className="size-[18px]" />
                    Plataforma Nexora
                  </Link>
                </li>
              )}
              {bottomNavItems
                .filter(
                  (item) =>
                    !item.minRole ||
                    (!!accountRole && hasMinRole(accountRole, item.minRole))
                )
                .map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'group relative flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-200',
                          isActive
                            ? 'bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        {isActive && (
                          <span className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-full" />
                        )}
                        <item.icon className="size-[18px]" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </nav>
        </ScrollArea>

        {/* User section */}
        <div className="border-sidebar-border/80 bg-sidebar-accent/18 shrink-0 border-t p-3.5">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div className="text-muted-foreground mb-2.5 flex items-center gap-2 px-2 text-sm">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole
                ? // Always render the chip — owners used to be
                  // invisible here, which made them indistinguishable
                  // from admins at a glance. Now everyone sees their
                  // role (with a colour cue) regardless of tier.
                  (() => {
                    const meta = ROLE_CHIP[accountRole];
                    const Icon = meta.icon;
                    return (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium tracking-wider uppercase ${meta.className}`}
                      >
                        <Icon className="size-3" />
                        {meta.label}
                      </span>
                    );
                  })()
                : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger className="surface-elevated hover:bg-sidebar-accent/70 focus:bg-sidebar-accent/70 data-popup-open:bg-sidebar-accent/70 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all focus:outline-none">
              <Avatar className="ring-primary/15 size-10 shrink-0 ring-2">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? 'Avatar'}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-[15px] font-semibold">
                  {profile?.full_name ?? 'User'}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {profile?.email ?? ''}
                </p>
              </div>
              <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_3px_color-mix(in_oklab,var(--card)_85%,transparent),0_0_12px_rgba(52,211,153,0.45)]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="bg-popover text-popover-foreground ring-border min-w-56"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
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
                    href={
                      accountRole && hasMinRole(accountRole, 'admin')
                        ? '/settings?tab=whatsapp'
                        : '/settings?tab=profile'
                    }
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
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
      </aside>
    </>
  );
}
