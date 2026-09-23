import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-card/70 file:text-foreground placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:bg-card focus-visible:ring-ring/20 disabled:bg-input/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/20 dark:disabled:bg-input/60 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-12 w-full min-w-0 rounded-[14px] border px-4 py-2.5 text-base shadow-[0_1px_0_color-mix(in_oklab,white_7%,transparent)_inset] transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
        className
      )}
      {...props}
    />
  );
}

export { Input };
