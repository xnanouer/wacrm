import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Section header shown at the top of every settings panel — a title,
 * a one-line description, and an optional right-aligned action (e.g.
 * "New template", "Invite member"). Mirrors the mockup's `.panel-head`.
 */
export function SettingsPanelHead({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-foreground text-2xl font-semibold tracking-[-0.035em]">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-[66ch] text-base leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
