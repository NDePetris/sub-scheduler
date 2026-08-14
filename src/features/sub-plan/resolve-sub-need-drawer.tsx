import { AlertTriangle, Search, Split, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getCandidates,
  resolveAssignment,
  type CandidatePreview,
  type PlanAssignment,
  type PlanDetail,
  type StaffData,
} from '@/lib/api';

export function ResolveSubNeedDrawer({
  assignment,
  detail,
  staff,
  onClose,
  onChange,
}: {
  readonly assignment: PlanAssignment;
  readonly detail: PlanDetail;
  readonly staff: readonly StaffData[];
  readonly onClose: () => void;
  readonly onChange: (detail: PlanDetail) => void;
}) {
  const [candidates, setCandidates] = useState<CandidatePreview[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCandidateId, setConfirmingCandidateId] = useState<
    string | null
  >(null);
  const [otherStaffSearch, setOtherStaffSearch] = useState('');
  const [splitOpen, setSplitOpen] = useState(false);
  const [confirmLeaveUncovered, setConfirmLeaveUncovered] = useState(false);
  const [firstStaff, setFirstStaff] = useState('');
  const [secondStaff, setSecondStaff] = useState('');
  const [splitTime, setSplitTime] = useState(() =>
    addMinutes(assignment.startTime, 40),
  );

  useEffect(() => {
    const controller = new AbortController();
    void getCandidates(assignment.id, controller.signal)
      .then((values) => {
        setCandidates(values);
        setFirstStaff(values[0]?.id ?? '');
        setSecondStaff(values[1]?.id ?? values[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setCandidateError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCandidatesLoading(false);
      });
    return () => controller.abort();
  }, [assignment.id]);

  const recommended = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.availability !== 'manual' &&
          candidate.conflicts.length === 0,
      ),
    [candidates],
  );
  const otherStaff = useMemo(() => {
    const query = otherStaffSearch.trim().toLocaleLowerCase('en-US');
    return candidates.filter((candidate) => {
      if (
        candidate.availability !== 'manual' &&
        candidate.conflicts.length === 0
      )
        return false;
      return (
        !query ||
        `${candidate.displayName} ${candidate.availabilitySource} ${candidate.conflicts.join(' ')}`
          .toLocaleLowerCase('en-US')
          .includes(query)
      );
    });
  }, [candidates, otherStaffSearch]);
  const otherStaffCount = candidates.length - recommended.length;

  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      onChange(await resolveAssignment(assignment.id, input));
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="resolve-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="border-border absolute inset-y-0 right-0 w-[580px] overflow-y-auto border-l bg-white shadow-xl"
      >
        <div className="border-border sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 id="resolve-title" className="font-bold">
              Resolve Sub Need
            </h2>
            <p className="text-muted-foreground text-xs">
              {detail.plan.date} · {detail.plan.dayType} Day
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          {actionError && <ErrorBanner message={actionError} />}
          <section className="bg-muted grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg p-4 text-sm">
            <Data
              label="Time"
              value={`${assignment.startTime}–${assignment.endTime}`}
            />
            <Data
              label="Absent Teacher"
              value={assignment.absentStaff.displayName}
            />
            <Data
              label="Type"
              value={assignment.responsibilityType.replace('_', ' ')}
            />
            <Data label="Room" value={assignment.room ?? '—'} />
            <div className="col-span-2">
              <Data
                label="Class / Responsibility"
                value={assignment.description}
              />
            </div>
          </section>

          {assignment.status !== 'unresolved' && (
            <CurrentChoice assignment={assignment} />
          )}

          <section aria-labelledby="assign-a-sub-title">
            <div>
              <h3 id="assign-a-sub-title" className="text-base font-bold">
                Assign a Sub
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Recommended staff are automatically available and ordered by
                preference, then recent Plan Periods Lost.
              </p>
              {assignment.status === 'unresolved' &&
                assignment.defaultAction &&
                assignment.conflictExplanation && (
                  <p className="text-danger-dark mt-2 flex gap-1.5 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    Default unavailable: {assignment.conflictExplanation}
                  </p>
                )}
            </div>

            <div className="mt-3 space-y-3" aria-busy={candidatesLoading}>
              <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                Recommended
              </h4>
              {candidatesLoading ? (
                <CandidateSkeleton />
              ) : candidateError ? (
                <ErrorBanner message={candidateError} />
              ) : recommended.length > 0 ? (
                <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
                  {recommended.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      busy={busy}
                      confirming={confirmingCandidateId === candidate.id}
                      onRequestAssign={() =>
                        candidate.conflicts.length > 0
                          ? setConfirmingCandidateId(candidate.id)
                          : void act({
                              action: 'assign',
                              staffId: candidate.id,
                              assignAnyway: false,
                            })
                      }
                      onCancelOverride={() => setConfirmingCandidateId(null)}
                      onConfirmOverride={() => {
                        setConfirmingCandidateId(null);
                        void act({
                          action: 'assign',
                          staffId: candidate.id,
                          assignAnyway: true,
                        });
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                  No staff are automatically available for the full Assignment.
                  Check Other Staff to make an override.
                </p>
              )}

              {!candidatesLoading && !candidateError && otherStaffCount > 0 && (
                <details className="border-border rounded-md border">
                  <summary className="hover:bg-muted/40 cursor-pointer px-3 py-2.5 text-sm font-semibold">
                    Other Staff ({otherStaffCount})
                  </summary>
                  <div className="border-border border-t p-3">
                    <label className="border-border mb-3 flex h-8 items-center gap-2 rounded-md border bg-white px-2">
                      <Search className="text-muted-foreground size-3.5" />
                      <span className="sr-only">Search Other Staff</span>
                      <input
                        value={otherStaffSearch}
                        onChange={(event) =>
                          setOtherStaffSearch(event.target.value)
                        }
                        placeholder="Search Other Staff"
                        className="w-full bg-transparent text-xs outline-none"
                      />
                    </label>
                    {otherStaff.length > 0 ? (
                      <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
                        {otherStaff.map((candidate) => (
                          <CandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            busy={busy}
                            confirming={confirmingCandidateId === candidate.id}
                            onRequestAssign={() =>
                              candidate.conflicts.length > 0
                                ? setConfirmingCandidateId(candidate.id)
                                : void act({
                                    action: 'assign',
                                    staffId: candidate.id,
                                    assignAnyway: false,
                                  })
                            }
                            onCancelOverride={() =>
                              setConfirmingCandidateId(null)
                            }
                            onConfirmOverride={() => {
                              setConfirmingCandidateId(null);
                              void act({
                                action: 'assign',
                                staffId: candidate.id,
                                assignAnyway: true,
                              });
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        No staff match this search.
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          </section>

          <section className="bg-muted/40 border-border space-y-2 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-bold">
                Other ways to resolve this need
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Use these less-common options when a normal sub assignment is
                not the right fit.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSplitOpen((value) => !value)}
              >
                <Split className="size-3.5" /> Split Assignment
              </Button>
              {assignment.responsibilityType === 'instruction' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void act({
                        action: 'structured',
                        resolutionType: 'redistribution',
                        details: {
                          decision: 'Conceptual class redistribution',
                        },
                      })
                    }
                  >
                    Redistribute Class
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void act({
                        action: 'structured',
                        resolutionType: 'combine_class',
                        details: { decision: 'Combine class' },
                      })
                    }
                  >
                    Combine Class
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void act({
                        action: 'structured',
                        resolutionType: 'move_room',
                        details: {
                          decision: 'Move room; room to be included in message',
                        },
                      })
                    }
                  >
                    Move Room
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const needsAck =
                    assignment.responsibilityType === 'instruction';
                  if (needsAck) {
                    setConfirmLeaveUncovered(true);
                  } else {
                    void act({
                      action: 'leave_uncovered',
                      acknowledged: false,
                    });
                  }
                }}
              >
                Leave Uncovered
              </Button>
            </div>
            {confirmLeaveUncovered && (
              <div
                className="border-danger/30 bg-danger-soft mt-3 rounded-md border p-3"
                role="alertdialog"
                aria-labelledby="leave-uncovered-title"
              >
                <p
                  id="leave-uncovered-title"
                  className="text-danger-dark text-sm font-bold"
                >
                  Leave instructional coverage unresolved?
                </p>
                <p className="mt-1 text-xs">
                  This Assignment is instructional. Confirming will record the
                  administrator override as Intentionally Uncovered.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmLeaveUncovered(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setConfirmLeaveUncovered(false);
                      void act({
                        action: 'leave_uncovered',
                        acknowledged: true,
                      });
                    }}
                  >
                    Leave Uncovered Anyway
                  </Button>
                </div>
              </div>
            )}
            {splitOpen && (
              <div className="border-border mt-3 space-y-3 rounded-md border bg-white p-3">
                <p className="text-muted-foreground text-xs">
                  Segments must meet exactly; the suggested split follows the{' '}
                  {detail.settings.splitSnapMinutes}-minute editing convention.
                </p>
                <div className="grid grid-cols-[1fr_120px_1fr] items-end gap-2">
                  <Labeled label={`${assignment.startTime} to split`}>
                    <select
                      value={firstStaff}
                      onChange={(event) => setFirstStaff(event.target.value)}
                      className="field"
                    >
                      {staff
                        .filter(
                          (person) => person.id !== assignment.absentStaff.id,
                        )
                        .map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                          </option>
                        ))}
                    </select>
                  </Labeled>
                  <Labeled label="Split time">
                    <input
                      type="time"
                      step={detail.settings.splitSnapMinutes * 60}
                      min={assignment.startTime}
                      max={assignment.endTime}
                      value={splitTime}
                      onChange={(event) => setSplitTime(event.target.value)}
                      className="field"
                    />
                  </Labeled>
                  <Labeled label={`Split to ${assignment.endTime}`}>
                    <select
                      value={secondStaff}
                      onChange={(event) => setSecondStaff(event.target.value)}
                      className="field"
                    >
                      {staff
                        .filter(
                          (person) => person.id !== assignment.absentStaff.id,
                        )
                        .map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                          </option>
                        ))}
                    </select>
                  </Labeled>
                </div>
                <Button
                  size="sm"
                  disabled={
                    !firstStaff ||
                    !secondStaff ||
                    splitTime <= assignment.startTime ||
                    splitTime >= assignment.endTime
                  }
                  onClick={() =>
                    void act({
                      action: 'split',
                      segments: [
                        {
                          staffId: firstStaff,
                          startTime: assignment.startTime,
                          endTime: splitTime,
                        },
                        {
                          staffId: secondStaff,
                          startTime: splitTime,
                          endTime: assignment.endTime,
                        },
                      ],
                      assignAnyway: true,
                    })
                  }
                >
                  Save Split
                </Button>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  confirming,
  onRequestAssign,
  onCancelOverride,
  onConfirmOverride,
}: {
  readonly candidate: CandidatePreview;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly onRequestAssign: () => void;
  readonly onCancelOverride: () => void;
  readonly onConfirmOverride: () => void;
}) {
  const thresholdWarning =
    candidate.projectedBurden !== null &&
    candidate.projectedBurden >= candidate.threshold;
  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{candidate.displayName}</span>
            <Badge>{availabilityLabel(candidate)}</Badge>
            {candidate.isDefaultCandidate && (
              <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                Default
              </Badge>
            )}
          </div>
          <WorkloadSummary candidate={candidate} />
          {candidate.conflicts.map((conflict) => (
            <p
              key={conflict}
              className="text-danger-dark mt-1 flex gap-1.5 text-xs"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {conflict}
            </p>
          ))}
          {candidate.warnings
            .filter((warning) =>
              warning.startsWith('Plan-time calculation needs'),
            )
            .map((warning) => (
              <p
                key={warning}
                className="border-warning/40 bg-warning-soft text-warning-dark mt-2 rounded border px-2 py-1.5 text-xs font-semibold"
              >
                {warning}
              </p>
            ))}
          {thresholdWarning && (
            <p className="border-warning/40 bg-warning-soft text-warning-dark mt-2 rounded border px-2 py-1.5 text-xs font-semibold">
              After assignment, {candidate.projectedBurden.toFixed(2)} Plan
              Periods Lost reaches the {candidate.threshold.toFixed(2)} warning
              threshold.
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant={candidate.conflicts.length ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={onRequestAssign}
        >
          {candidate.conflicts.length ? 'Review conflict' : 'Assign'}
        </Button>
      </div>

      {confirming && (
        <div
          className="border-danger/30 bg-danger-soft mt-3 rounded-md border p-3"
          role="alertdialog"
          aria-labelledby={`conflict-title-${candidate.id}`}
          aria-describedby={`conflict-description-${candidate.id}`}
        >
          <p
            id={`conflict-title-${candidate.id}`}
            className="text-danger-dark text-sm font-bold"
          >
            {candidate.displayName} has a conflict
          </p>
          <ul
            id={`conflict-description-${candidate.id}`}
            className="text-danger-dark mt-1 list-inside list-disc space-y-1 text-xs"
          >
            {candidate.conflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            The administrator may override these warnings. The override will be
            recorded with the Assignment.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={onCancelOverride}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={onConfirmOverride}>
              Assign Anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkloadSummary({
  candidate,
}: {
  readonly candidate: CandidatePreview;
}) {
  if (candidate.isSchoolSub) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        School Sub assignments do not add Plan Periods Lost.
      </p>
    );
  }
  if (candidate.currentBurden === null || candidate.proposedBurden === null) {
    return null;
  }
  if (candidate.proposedBurden === 0) {
    return (
      <p className="text-muted-foreground mt-1 text-xs">
        <span className="font-semibold">Last {candidate.windowDays} days:</span>{' '}
        {candidate.currentBurden.toFixed(2)} · This assignment does not use plan
        time.
      </p>
    );
  }
  return (
    <dl className="text-muted-foreground mt-1 grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt className="font-semibold">Last {candidate.windowDays} days</dt>
        <dd>{candidate.currentBurden.toFixed(2)}</dd>
      </div>
      <div>
        <dt className="font-semibold">This assignment</dt>
        <dd>+{candidate.proposedBurden.toFixed(2)}</dd>
        <dd>
          {candidate.standardPeriodSource === 'auto' ? 'Auto: ' : ''}
          {candidate.standardPeriodMinutes}-minute standard period
        </dd>
      </div>
      <div>
        <dt className="font-semibold">After assignment</dt>
        <dd>
          {candidate.projectedBurden?.toFixed(2) ?? 'Needs configuration'}
        </dd>
      </div>
    </dl>
  );
}

function CandidateSkeleton() {
  return (
    <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
      {[0, 1, 2].map((value) => (
        <div key={value} className="animate-pulse space-y-2 p-3">
          <div className="bg-muted h-4 w-40 rounded" />
          <div className="bg-muted h-3 w-72 rounded" />
        </div>
      ))}
    </div>
  );
}

function availabilityLabel(candidate: CandidatePreview): string {
  if (candidate.availability === 'school_sub') return 'School Sub';
  if (candidate.availability === 'plan') return 'PLAN';
  if (candidate.availability === 'admin') return 'Admin';
  if (candidate.availability === 'open') return 'Available';
  if (candidate.availability === 'manual') return 'Manual';
  if (candidate.availabilitySource === 'School Sub') return 'School Sub';
  if (candidate.availabilitySource === 'Plan Period') return 'PLAN';
  if (candidate.availabilitySource === 'Admin') return 'Admin';
  if (candidate.availabilitySource === 'Available') return 'Available';
  return 'Manual';
}

function currentAssignmentLabel(assignment: PlanAssignment): string {
  if (assignment.assignedStaff)
    return `${assignment.assignedStaff.displayName} · ${assignment.status}`;
  if (assignment.segments.length > 0)
    return assignment.segments
      .map(
        (segment) =>
          `${segment.staffName} ${segment.startTime}–${segment.endTime}`,
      )
      .join('; ');
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (assignment.resolutionType)
    return assignment.resolutionType.replaceAll('_', ' ');
  return 'Unresolved';
}

function CurrentChoice({
  assignment,
}: {
  readonly assignment: PlanAssignment;
}) {
  return (
    <section>
      <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
        Currently Chosen
      </h3>
      <div className="border-border mt-2 rounded-md border p-3 text-sm">
        {assignment.assignedStaff ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">
              {assignment.assignedStaff.displayName}
            </span>
            {assignment.resolutionSource && (
              <Badge>{assignment.resolutionSource}</Badge>
            )}
            {assignment.isDefault && (
              <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                Default
              </Badge>
            )}
          </div>
        ) : assignment.segments.length > 0 ? (
          <div className="space-y-1">
            {assignment.segments.map((segment) => (
              <div key={segment.id}>
                <span className="font-semibold">{segment.staffName}</span>{' '}
                <span className="text-muted-foreground font-mono text-xs">
                  {segment.startTime}–{segment.endTime}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span>{currentAssignmentLabel(assignment)}</span>
        )}
      </div>
    </section>
  );
}

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div
      className="border-danger/30 bg-danger-soft text-danger-dark rounded-md border px-3 py-2 text-sm"
      role="alert"
    >
      {message}
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="text-muted-foreground block text-xs font-semibold">
      {label}
      <span className="text-foreground mt-1 block">{children}</span>
    </label>
  );
}

function Data({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5 capitalize">{value}</dd>
    </div>
  );
}

function minutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function addMinutes(value: string, amount: number): string {
  const result = minutes(value) + amount;
  return `${String(Math.floor(result / 60)).padStart(2, '0')}:${String(result % 60).padStart(2, '0')}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
