'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const subscribeToHydration = () => () => {};

/**
 * Shared light/dark control. The icon and optional label describe the mode
 * that will be activated; ThemeProvider persists the choice between pages.
 */
export function ModeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { mode, toggleMode } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
  const isDark = mounted ? mode === 'dark' : true;
  const label = isDark ? 'Modo claro' : 'Modo oscuro';

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={`Cambiar a ${label.toLowerCase()}`}
      title={`Cambiar a ${label.toLowerCase()}`}
      className={cn(
        'border-border/70 bg-card/70 text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 items-center justify-center gap-2 rounded-xl border shadow-sm backdrop-blur-md transition-colors',
        showLabel ? 'px-3' : 'w-10',
        className
      )}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {showLabel ? (
        <span className="hidden text-xs font-semibold sm:inline">{label}</span>
      ) : null}
    </button>
  );
}
