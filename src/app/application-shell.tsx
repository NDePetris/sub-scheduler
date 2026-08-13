import { ChevronRight, GraduationCap, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { BootstrapData } from '@/lib/api';

import { navigationItems } from './navigation';

interface ApplicationShellProps {
  readonly activePath: string;
  readonly bootstrap: BootstrapData | null;
  readonly children: ReactNode;
  readonly onNavigate: (path: string) => void;
}

export function ApplicationShell({
  activePath,
  bootstrap,
  children,
  onNavigate,
}: ApplicationShellProps) {
  const schoolName = bootstrap?.school.name ?? 'School Sub Planning';

  return (
    <div className="bg-canvas text-foreground min-h-screen">
      <aside className="border-border fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r bg-white">
        <div className="border-border flex h-16 items-center gap-3 border-b px-4">
          {bootstrap?.school.logoUrl ? (
            <img
              src={bootstrap.school.logoUrl}
              alt={`${schoolName} logo`}
              className="size-9 rounded-md object-contain"
            />
          ) : (
            <span
              className="bg-brand-soft text-brand-dark flex size-9 shrink-0 items-center justify-center rounded-md"
              aria-hidden="true"
            >
              <GraduationCap className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{schoolName}</p>
            <p className="text-muted-foreground text-xs">
              Administrator workspace
            </p>
          </div>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 p-3">
          {navigationItems.map((item) => {
            const isActive = item.path === activePath;
            const Icon = item.icon;
            return (
              <a
                key={item.path}
                href={item.path}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(item.path);
                }}
                className={cn(
                  'group focus-visible:ring-brand/40 flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  isActive
                    ? 'bg-brand-soft text-brand-dark'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {isActive && (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
              </a>
            );
          })}
        </nav>

        <div className="border-border border-t p-4">
          <div className="text-foreground mb-2 flex items-center gap-2 text-xs font-medium">
            <ShieldCheck
              className="text-brand-dark size-3.5"
              aria-hidden="true"
            />
            {bootstrap?.actor.displayName ?? 'Connecting securely…'}
          </div>
          <p className="text-muted-foreground truncate text-xs">
            {bootstrap?.actor.email ?? 'Local identity pending'}
          </p>
        </div>
      </aside>

      <main className="ml-60 min-h-screen">
        <header className="border-border sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/95 px-6 backdrop-blur">
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              School administration
            </p>
            <p className="text-sm font-semibold">Sub planning</p>
          </div>
          <Badge>
            <span
              className="bg-brand size-1.5 rounded-full"
              aria-hidden="true"
            />
            Foundation environment
          </Badge>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
