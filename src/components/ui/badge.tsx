import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-4 font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-white text-muted-foreground',
        success: 'border-brand/30 bg-brand-soft text-brand-dark',
        warning: 'border-warning/30 bg-warning-soft text-warning-dark',
        danger: 'border-danger/30 bg-danger-soft text-danger-dark',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}
