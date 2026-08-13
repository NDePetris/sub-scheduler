import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'border-border text-muted-foreground inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}
