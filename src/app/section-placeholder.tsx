import { Construction } from 'lucide-react';

import type { NavigationItem } from './navigation';

export function SectionPlaceholder({
  item,
}: {
  readonly item: NavigationItem;
}) {
  const Icon = item.icon;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="bg-brand-soft text-brand-dark flex size-10 items-center justify-center rounded-lg">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{item.label}</h1>
          <p className="text-muted-foreground text-sm">{item.description}</p>
        </div>
      </div>
      <div className="border-border rounded-lg border border-dashed bg-white p-8 text-center">
        <Construction
          className="text-muted-foreground mx-auto size-5"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-semibold">Foundation route ready</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-lg text-sm">
          Navigation is established independently from domain modules. This
          section will be implemented only when its workflow enters scope.
        </p>
      </div>
    </div>
  );
}
