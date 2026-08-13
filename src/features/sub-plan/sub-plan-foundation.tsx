import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  School,
  UsersRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BootstrapData } from '@/lib/api';

interface SubPlanFoundationProps {
  readonly bootstrap: BootstrapData | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly onRetry: () => void;
}

export function SubPlanFoundation({
  bootstrap,
  error,
  isLoading,
  onRetry,
}: SubPlanFoundationProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Sub Plan</h1>
            <Badge>Setup pass</Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            The daily workflow is intentionally not active yet. This screen
            proves the shared React, Worker, and D1 foundation the workflow will
            use.
          </p>
        </div>
        <Button disabled>
          <CalendarDays className="size-4" aria-hidden="true" />
          Add Absence
        </Button>
      </div>

      {isLoading && (
        <div
          className="border-border rounded-lg border bg-white p-5"
          role="status"
        >
          <p className="text-sm font-medium">Loading seeded school data…</p>
          <p className="text-muted-foreground mt-1 text-xs">
            React → Worker API → local D1
          </p>
        </div>
      )}

      {error && (
        <div
          className="border-danger/30 bg-danger-soft rounded-lg border p-5"
          role="alert"
        >
          <p className="text-danger-dark text-sm font-semibold">
            Foundation data unavailable
          </p>
          <p className="text-danger-dark/80 mt-1 text-sm">{error}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            onClick={onRetry}
          >
            Retry connection
          </Button>
        </div>
      )}

      {bootstrap && (
        <>
          <div
            className="grid grid-cols-4 gap-3"
            aria-label="Seeded data summary"
          >
            <SummaryCard
              icon={UsersRound}
              label="Active staff"
              value={String(bootstrap.summary.activeStaff)}
              detail="stable Staff records"
            />
            <SummaryCard
              icon={School}
              label="Rooms"
              value={String(bootstrap.summary.activeRooms)}
              detail="text identifiers"
            />
            <SummaryCard
              icon={Clock3}
              label="Schedule blocks"
              value={String(bootstrap.summary.activeSchedule?.entryCount ?? 0)}
              detail="time-based entries"
            />
            <SummaryCard
              icon={Database}
              label="Database"
              value="Ready"
              detail="queried through Worker"
            />
          </div>

          <section className="border-border rounded-lg border bg-white">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
              <div>
                <h2 className="text-sm font-bold">
                  Active schedule foundation
                </h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Seeded records returned by the authenticated API boundary
                </p>
              </div>
              <span className="text-brand-dark inline-flex items-center gap-1.5 text-xs font-semibold">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Connected
              </span>
            </div>

            <dl className="divide-border grid grid-cols-3 divide-x">
              <DataPoint
                term="Schedule version"
                value={
                  bootstrap.summary.activeSchedule?.name ?? 'No active schedule'
                }
                detail={
                  bootstrap.summary.activeSchedule
                    ? `Effective ${bootstrap.summary.activeSchedule.effectiveFrom}`
                    : 'Run local database setup'
                }
              />
              <DataPoint
                term="A / B / shared entries"
                value={`${bootstrap.summary.dayTypeCounts.A} / ${bootstrap.summary.dayTypeCounts.B} / ${bootstrap.summary.dayTypeCounts.shared}`}
                detail="Shared entries apply to both day types"
              />
              <DataPoint
                term="School Sub"
                value={
                  bootstrap.summary.schoolSub?.displayName ?? 'Not configured'
                }
                detail="Normal Staff record with School Sub flag"
              />
            </dl>
          </section>

          <div className="border-warning/30 bg-warning-soft text-warning-dark flex items-center gap-2 rounded-md border px-4 py-3 text-sm">
            <Clock3 className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Workload policy: {bootstrap.school.name} uses its seeded settings
              in <strong>{bootstrap.school.timezone}</strong>. Workload
              calculations are not part of this setup pass.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

interface SummaryCardProps {
  readonly icon: typeof UsersRound;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

function SummaryCard({ icon: Icon, label, value, detail }: SummaryCardProps) {
  return (
    <div className="border-border rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-semibold">
          {label}
        </span>
        <Icon className="text-brand-dark size-4" aria-hidden="true" />
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p>
    </div>
  );
}

function DataPoint({
  term,
  value,
  detail,
}: {
  term: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-muted-foreground text-xs font-semibold">{term}</dt>
      <dd className="mt-1 text-sm font-bold">{value}</dd>
      <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p>
    </div>
  );
}
