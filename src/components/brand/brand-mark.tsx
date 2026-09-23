import Image from 'next/image';

import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'relative inline-flex size-10 shrink-0 items-center justify-center',
        className
      )}
      aria-hidden="true"
    >
      <Image
        src="/brand/nexora-transparent-mark.png"
        alt=""
        width={512}
        height={512}
        className="size-full object-contain"
      />
    </span>
  );
}

interface BrandLockupProps {
  compact?: boolean;
  className?: string;
  onDark?: boolean;
}

export function BrandLockup({
  compact = false,
  className,
  onDark = false,
}: BrandLockupProps) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 bg-contain bg-center bg-no-repeat',
        compact ? 'h-11 w-[133px]' : 'h-14 w-[170px]',
        className
      )}
      role="img"
      aria-label="Nexora CRM"
      style={{
        backgroundImage: onDark
          ? "url('/brand/nexora-transparent-lockup.png')"
          : 'var(--nexora-lockup-image)',
      }}
    />
  );
}
