import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly eyebrow?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Shared hierarchy for administrative pages. Operational workspaces may use a
 * purpose-built header when their controls are part of the work itself.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {eyebrow}
          </p>
        )}
        <h1
          className={cn('text-2xl font-bold tracking-tight', eyebrow && 'mt-1')}
        >
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
