import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-card/55 placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:bg-card focus-visible:ring-ring/20 disabled:bg-input/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/20 dark:disabled:bg-input/60 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-24 w-full rounded-xl border px-3.5 py-3 text-[15px] leading-6 transition-[border-color,box-shadow,background-color] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
