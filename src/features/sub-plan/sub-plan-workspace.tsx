import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  RefreshCw,
  Search,
  Split,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { shiftSchoolDate } from '@/domain/planning';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  addAbsence,
  editMessage,
  ensurePlan,
  getCandidates,
  listStaff,
  regenerateMessage,
  resolveAssignment,
  setPlanStatus,
  type BootstrapData,
  type CandidatePreview,
  type PlanAssignment,
  type PlanDetail,
  type StaffData,
} from '@/lib/api';
import { cn } from '@/lib/cn';

interface Props {
  readonly bootstrap: BootstrapData;
}

type AbsenceMode = 'specific' | 'range' | 'time';
type ViewMode = 'affected' | 'full';
type NeedFilter = 'all' | 'classes' | 'duties' | 'unresolved';

export function SubPlanWorkspace({ bootstrap }: Props) {
  const [date, setDate] = useState(() =>
    schoolToday(bootstrap.school.timezone),
  );
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [staff, setStaff] = useState<StaffData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAbsence, setShowAbsence] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<
    string | null
  >(null);
  const [showReview, setShowReview] = useState(false);
  const [view, setView] = useState<ViewMode>('affected');
  const [filter, setFilter] = useState<NeedFilter>('all');
  const [staffFilter, setStaffFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (targetDate: string, dayType?: 'A' | 'B') => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await ensurePlan(targetDate, dayType));
    } catch (cause) {
      setError(errorMessage(cause));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(date), 0);
    return () => window.clearTimeout(timeout);
  }, [date, load]);

  useEffect(() => {
    const controller = new AbortController();
    void listStaff(controller.signal)
      .then(setStaff)
      .catch((cause: unknown) => setError(errorMessage(cause)));
    return () => controller.abort();
  }, []);

  const assignments = useMemo(() => {
    if (!detail) return [];
    const query = search.trim().toLocaleLowerCase('en-US');
    return detail.assignments.filter((assignment) => {
      if (
        filter === 'classes' &&
        assignment.responsibilityType !== 'instruction'
      )
        return false;
      if (
        filter === 'duties' &&
        assignment.responsibilityType === 'instruction'
      )
        return false;
      if (filter === 'unresolved' && assignment.status !== 'unresolved')
        return false;
      if (staffFilter && assignment.absentStaff.id !== staffFilter)
        return false;
      if (
        query &&
        !`${assignment.description} ${assignment.absentStaff.displayName} ${assignment.assignedStaff?.displayName ?? ''}`
          .toLocaleLowerCase('en-US')
          .includes(query)
      )
        return false;
      return true;
    });
  }, [detail, filter, search, staffFilter]);

  const selectedAssignment = detail?.assignments.find(
    (assignment) => assignment.id === selectedAssignmentId,
  );

  function moveDate(days: number) {
    setSelectedAssignmentId(null);
    setDate(shiftSchoolDate(date, days));
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Sub Plan</h1>
            {detail?.plan.specialScheduleId && <Badge>Special Schedule</Badge>}
            {detail?.plan.status === 'finalized' && (
              <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                Finalized
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {detail
              ? `${detail.plan.scheduleName}${detail.plan.specialScheduleName ? ` Â· Special Schedule: ${detail.plan.specialScheduleName}` : ''}`
              : 'Resolving the pinned Schedule Version'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => moveDate(-1)}
            aria-label="Previous Day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <label className="sr-only" htmlFor="plan-date">
            Sub Plan date
          </label>
          <input
            id="plan-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="border-border h-9 rounded-md border bg-white px-3 text-sm font-semibold"
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => moveDate(1)}
            aria-label="Next Day"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDate(schoolToday(bootstrap.school.timezone))}
          >
            Today
          </Button>
          <div
            className="border-border flex h-9 rounded-md border bg-white p-0.5"
            aria-label="A/B override"
          >
            {(['A', 'B'] as const).map((dayType) => (
              <button
                key={dayType}
                type="button"
                disabled={!detail || detail.plan.status === 'finalized'}
                onClick={() => void load(date, dayType)}
                className={cn(
                  'w-9 rounded text-xs font-bold disabled:opacity-50',
                  detail?.plan.dayType === dayType
                    ? 'bg-brand text-white'
                    : 'text-muted-foreground',
                )}
              >
                {dayType}
              </button>
            ))}
          </div>
          <Button
            disabled={!detail || detail.plan.status === 'finalized'}
            onClick={() => setShowAbsence(true)}
          >
            <CalendarDays className="size-4" /> Add Absence
          </Button>
        </div>
      </header>

      {detail && detail.plan.dayType !== detail.plan.expectedDayType && (
        <div className="border-warning/30 bg-warning-soft text-warning-dark rounded-md border px-3 py-2 text-xs">
          A/B override active: expected {detail.plan.expectedDayType}, selected{' '}
          {detail.plan.dayType}.
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      {detail?.absences
        .filter((absence) => absence.informationalWarning)
        .map((absence) => (
          <div
            key={`absence-warning:${absence.id}`}
            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
            role="status"
          >
            <AlertTriangle className="mr-1.5 inline size-4" />
            {absence.informationalWarning}
          </div>
        ))}
      {loading && (
        <div className="border-border rounded-lg border bg-white p-5 text-sm">
          Loading persisted Sub Plan…
        </div>
      )}

      {detail && (
        <>
          <div className="grid grid-cols-5 gap-2">
            <Summary
              label="Teachers Absent"
              value={detail.summary.teachersAbsent}
            />
            <Summary label="Assignments" value={detail.summary.assignments} />
            <Summary
              label="Assigned"
              value={detail.summary.assigned}
              tone="success"
            />
            <Summary
              label="Unresolved"
              value={detail.summary.unresolved}
              tone={detail.summary.unresolved ? 'danger' : undefined}
            />
            <Summary
              label="Workload Warning"
              value={detail.summary.workloadWarnings}
              tone="warning"
            />
          </div>

          <section className="border-border overflow-hidden rounded-lg border bg-white">
            <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3">
              <div className="flex gap-1" role="tablist">
                <Tab
                  active={view === 'affected'}
                  onClick={() => setView('affected')}
                >
                  Affected Only
                </Tab>
                <Tab active={view === 'full'} onClick={() => setView('full')}>
                  Full Schedule
                </Tab>
              </div>
              <Button variant="secondary" onClick={() => setShowReview(true)}>
                Review &amp; Finalize
              </Button>
            </div>

            {view === 'affected' ? (
              <>
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                  {(['all', 'classes', 'duties', 'unresolved'] as const).map(
                    (value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-semibold capitalize',
                          filter === value
                            ? 'border-brand bg-brand-soft text-brand-dark'
                            : 'border-border text-muted-foreground bg-white',
                        )}
                      >
                        {value === 'all' ? 'All Needs' : value}
                      </button>
                    ),
                  )}
                  <select
                    aria-label="Filter by absent staff"
                    value={staffFilter}
                    onChange={(event) => setStaffFilter(event.target.value)}
                    className="border-border h-8 rounded-md border bg-white px-2 text-xs"
                  >
                    <option value="">All staff</option>
                    {detail.absences.map((absence) => (
                      <option key={absence.staffId} value={absence.staffId}>
                        {absence.staffName}
                      </option>
                    ))}
                  </select>
                  <label className="border-border ml-auto flex h-8 items-center gap-2 rounded-md border bg-white px-2">
                    <Search className="text-muted-foreground size-3.5" />
                    <span className="sr-only">Search Assignments</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search"
                      className="w-44 bg-transparent text-xs outline-none"
                    />
                  </label>
                </div>
                <AssignmentTable
                  assignments={assignments}
                  totalAssignments={detail.assignments.length}
                  onOpen={setSelectedAssignmentId}
                />
              </>
            ) : (
              <FullSchedule detail={detail} />
            )}
          </section>
        </>
      )}

      {showAbsence && detail && (
        <AbsenceDialog
          date={date}
          staff={staff.filter((person) => person.role === 'teacher')}
          onClose={() => setShowAbsence(false)}
          onSaved={async () => {
            setShowAbsence(false);
            await load(date);
          }}
        />
      )}
      {selectedAssignment && detail && (
        <ResolveDrawer
          assignment={selectedAssignment}
          detail={detail}
          staff={staff}
          onClose={() => setSelectedAssignmentId(null)}
          onChange={(next) => {
            setDetail(next);
            setSelectedAssignmentId(null);
          }}
        />
      )}
      {showReview && detail && (
        <ReviewDialog
          detail={detail}
          onClose={() => setShowReview(false)}
          onChange={setDetail}
        />
      )}
    </div>
  );
}

function AssignmentTable({
  assignments,
  totalAssignments,
  onOpen,
}: {
  readonly assignments: readonly PlanAssignment[];
  readonly totalAssignments: number;
  readonly onOpen: (id: string) => void;
}) {
  if (assignments.length === 0) {
    return (
      <div className="text-muted-foreground p-10 text-center text-sm">
        {totalAssignments === 0
          ? 'No Needs Sub Assignments were generated for the recorded absences on this date.'
          : 'No Needs Sub Assignments match these filters.'}
      </div>
    );
  }
  return (
    <table className="w-full table-fixed text-left text-sm">
      <thead className="bg-muted/50 text-muted-foreground text-xs">
        <tr>
          <th className="w-32 px-4 py-2.5">Time</th>
          <th className="w-44 px-3 py-2.5">Absent Teacher</th>
          <th className="w-28 px-3 py-2.5">Type</th>
          <th className="px-3 py-2.5">Class / Responsibility</th>
          <th className="w-48 px-3 py-2.5">Assigned</th>
          <th className="w-36 px-3 py-2.5">Status</th>
        </tr>
      </thead>
      <tbody className="divide-border divide-y">
        {assignments.map((assignment) => (
          <tr
            key={assignment.id}
            tabIndex={0}
            role="button"
            onClick={() => onOpen(assignment.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ')
                onOpen(assignment.id);
            }}
            className="hover:bg-muted/40 focus:bg-brand-soft cursor-pointer focus:outline-none"
          >
            <td className="px-4 py-3 font-mono text-xs">
              {assignment.startTime}–{assignment.endTime}
            </td>
            <td className="px-3 py-3 font-semibold">
              {assignment.absentStaff.displayName}
            </td>
            <td className="px-3 py-3 capitalize">
              {assignment.responsibilityType.replace('_', ' ')}
            </td>
            <td className="truncate px-3 py-3">{assignment.description}</td>
            <td className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{assignmentLabel(assignment)}</span>
                {assignment.isDefault && (
                  <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                    Default
                  </Badge>
                )}
              </div>
            </td>
            <td className="px-3 py-3">
              <StatusBadge status={assignment.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResolveDrawer({
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [firstStaff, setFirstStaff] = useState('');
  const [secondStaff, setSecondStaff] = useState('');
  const [splitTime, setSplitTime] = useState(() =>
    addMinutes(assignment.startTime, 40),
  );

  useEffect(() => {
    void getCandidates(assignment.id)
      .then((values) => {
        setCandidates(values);
        setFirstStaff(values[0]?.id ?? '');
        setSecondStaff(values[1]?.id ?? values[0]?.id ?? '');
      })
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [assignment.id]);

  async function act(input: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await resolveAssignment(assignment.id, input));
    } catch (cause) {
      setError(errorMessage(cause));
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
        className="border-border absolute inset-y-0 right-0 w-[560px] overflow-y-auto border-l bg-white shadow-xl"
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
          {error && <ErrorBanner message={error} />}
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

          <section>
            <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              Default Sub Plan
            </h3>
            <div className="border-border mt-2 rounded-md border p-3 text-sm">
              {assignment.defaultAction ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {defaultActionLabel(assignment)}
                    </span>
                    <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                      Default
                    </Badge>
                  </div>
                  {assignment.conflictExplanation && (
                    <p className="text-danger-dark mt-2 flex gap-1.5 text-xs">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{' '}
                      {assignment.conflictExplanation}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  No matching structured default.
                </span>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              Recommended Candidates
            </h3>
            <div className="border-border mt-2 divide-y overflow-hidden rounded-md border">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">
                          {candidate.displayName}
                        </span>
                        <Badge>{candidate.availabilitySource}</Badge>
                        {candidate.availability === 'default' && (
                          <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Current {candidate.currentBurden.toFixed(2)} · Proposed
                        +{candidate.proposedBurden.toFixed(2)} · Projected{' '}
                        {candidate.projectedBurden.toFixed(2)}
                      </p>
                      {[...candidate.conflicts, ...candidate.warnings].map(
                        (warning) => (
                          <p
                            key={warning}
                            className={cn(
                              'mt-1 text-xs',
                              candidate.conflicts.includes(warning)
                                ? 'text-danger-dark'
                                : 'text-warning-dark',
                            )}
                          >
                            ⚠ {warning}
                          </p>
                        ),
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={
                        candidate.conflicts.length ? 'secondary' : 'primary'
                      }
                      disabled={busy}
                      onClick={() => {
                        const override = candidate.conflicts.length > 0;
                        if (
                          !override ||
                          window.confirm(
                            `${candidate.conflicts.join(' ')} Assign Anyway?`,
                          )
                        ) {
                          void act({
                            action: 'assign',
                            staffId: candidate.id,
                            assignAnyway: override,
                          });
                        }
                      }}
                    >
                      {candidate.conflicts.length ? 'Assign Anyway' : 'Assign'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              Other Options
            </h3>
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
                  if (
                    !needsAck ||
                    window.confirm(
                      'This is instructional coverage. Leave Uncovered anyway?',
                    )
                  ) {
                    void act({
                      action: 'leave_uncovered',
                      acknowledged: needsAck,
                    });
                  }
                }}
              >
                Leave Uncovered
              </Button>
            </div>
            {splitOpen && (
              <div className="border-border mt-3 space-y-3 rounded-md border p-3">
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

function AbsenceDialog({
  date,
  staff,
  onClose,
  onSaved,
}: {
  readonly date: string;
  readonly staff: readonly StaffData[];
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<AbsenceMode>('specific');
  const [staffName, setStaffName] = useState('');
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:30');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const person = staff.find(
      (candidate) => candidate.displayName === staffName,
    );
    if (!person) {
      setError('Choose an active teacher from the list.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addAbsence({
        staffId: person.id,
        startDate,
        endDate: mode === 'range' ? endDate : startDate,
        startTime: mode === 'time' ? startTime : null,
        endTime: mode === 'time' ? endTime : null,
      });
      await onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Absence" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Labeled label="Absent Teacher">
          <input
            list="teacher-options"
            value={staffName}
            onChange={(event) => setStaffName(event.target.value)}
            placeholder="Search active teachers"
            className="field"
            required
          />
          <datalist id="teacher-options">
            {staff.map((person) => (
              <option key={person.id} value={person.displayName} />
            ))}
          </datalist>
        </Labeled>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            When will they be absent?
          </legend>
          <div className="space-y-2 text-sm">
            {(
              [
                ['specific', 'Specific date'],
                ['range', 'Date range'],
                ['time', 'Time range on a specific date'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />{' '}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label={mode === 'range' ? 'Start date' : 'Date'}>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="field"
              required
            />
          </Labeled>
          {mode === 'range' && (
            <Labeled label="End date">
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="field"
                required
              />
            </Labeled>
          )}
          {mode === 'time' && (
            <>
              <Labeled label="Start time">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="field"
                  required
                />
              </Labeled>
              <Labeled label="End time">
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="field"
                  required
                />
              </Labeled>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Add Absence
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewDialog({
  detail,
  onClose,
  onChange,
}: {
  readonly detail: PlanDetail;
  readonly onClose: () => void;
  readonly onChange: (value: PlanDetail) => void;
}) {
  const [text, setText] = useState(detail.message?.editedText ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(operation: () => Promise<PlanDetail>) {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      onChange(next);
      setText(next.message?.editedText ?? '');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Review & Finalize" onClose={onClose} wide>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Message edits are independent of structured Assignments.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => regenerateMessage(detail.plan.date))
              }
            >
              <RefreshCw className="size-3.5" /> Regenerate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!text}
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              <Clipboard className="size-3.5" /> Copy to Clipboard
            </Button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="border-border min-h-80 w-full resize-y rounded-md border p-3 font-mono text-sm"
          placeholder="Regenerate to build the current Sub Plan message."
        />
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            disabled={!detail.message || busy}
            onClick={() => void run(() => editMessage(detail.plan.date, text))}
          >
            Save Message Edit
          </Button>
          {detail.plan.status === 'draft' ? (
            <Button
              disabled={busy || detail.summary.unresolved > 0}
              onClick={() =>
                void run(() => setPlanStatus(detail.plan.date, 'finalized'))
              }
            >
              <Check className="size-4" /> Finalize
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(() => setPlanStatus(detail.plan.date, 'draft'))
              }
            >
              Reopen to Draft
            </Button>
          )}
        </div>
        {detail.summary.unresolved > 0 && (
          <p className="text-danger-dark text-xs">
            Resolve {detail.summary.unresolved} remaining Assignment(s) before
            finalizing.
          </p>
        )}
        {detail.plan.finalizedAt && (
          <p className="text-muted-foreground text-xs">
            Most recently finalized{' '}
            {new Date(detail.plan.finalizedAt).toLocaleString()}.
          </p>
        )}
      </div>
    </Modal>
  );
}

function FullSchedule({ detail }: { readonly detail: PlanDetail }) {
  const rows = [...new Set(detail.schedule.map((entry) => entry.staffId))].map(
    (staffId) => ({
      staffId,
      name:
        detail.schedule.find((entry) => entry.staffId === staffId)?.staffName ??
        '',
      entries: detail.schedule.filter(
        (entry) =>
          entry.staffId === staffId &&
          (entry.dayType === 'ALL' || entry.dayType === detail.plan.dayType),
      ),
    }),
  );
  return (
    <div className="overflow-x-auto p-4">
      <div className="min-w-[1000px]">
        <div className="text-muted-foreground mb-2 grid grid-cols-[180px_1fr] text-xs">
          <span>Teacher</span>
          <div className="flex justify-between">
            <span>8:00</span>
            <span>10:00</span>
            <span>12:00</span>
            <span>2:00</span>
            <span>4:00</span>
          </div>
        </div>
        <div className="divide-border border-border divide-y border-y">
          {rows.map((row) => (
            <div
              key={row.staffId}
              className="grid min-h-12 grid-cols-[180px_1fr]"
            >
              <div className="border-border flex items-center border-r pr-3 text-xs font-semibold">
                {row.name}
              </div>
              <div className="relative bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[length:25%_100%]">
                {row.entries.map((entry) => {
                  const left = ((minutes(entry.startTime) - 480) / 480) * 100;
                  const width =
                    ((minutes(entry.endTime) - minutes(entry.startTime)) /
                      480) *
                    100;
                  return (
                    <div
                      key={entry.id}
                      title={`${entry.startTime}–${entry.endTime} ${entry.description}`}
                      className={cn(
                        'absolute top-1 bottom-1 overflow-hidden rounded border px-1 py-0.5 text-[10px] leading-tight',
                        categoryClass(entry.category),
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {entry.description}
                      <span className="block opacity-70">{entry.room}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly wide?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          'border-border max-h-[90vh] w-full overflow-y-auto rounded-xl border bg-white shadow-xl',
          wide ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'success' | 'danger' | 'warning';
}) {
  return (
    <div
      className={cn(
        'border-border rounded-lg border bg-white px-4 py-3',
        tone === 'danger' && 'border-danger/30 bg-danger-soft',
        tone === 'warning' && 'border-warning/30 bg-warning-soft',
      )}
    >
      <p className="text-muted-foreground text-xs font-semibold">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold',
          tone === 'success' && 'text-brand-dark',
          tone === 'danger' && 'text-danger-dark',
          tone === 'warning' && 'text-warning-dark',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-semibold',
        active
          ? 'bg-brand-soft text-brand-dark'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  status,
}: {
  readonly status: PlanAssignment['status'];
}) {
  if (status === 'assigned')
    return (
      <Badge className="border-brand/30 bg-brand-soft text-brand-dark">
        <Check className="size-3" /> Assigned
      </Badge>
    );
  if (status === 'intentionally_uncovered')
    return <Badge>Intentionally Uncovered</Badge>;
  return (
    <Badge className="border-danger/30 bg-danger-soft text-danger-dark">
      <AlertTriangle className="size-3" /> Unresolved
    </Badge>
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

function assignmentLabel(assignment: PlanAssignment): string {
  if (assignment.assignedStaff) return assignment.assignedStaff.displayName;
  if (assignment.segments.length)
    return assignment.segments.map((segment) => segment.staffName).join(' / ');
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (assignment.resolutionType)
    return assignment.resolutionType.replaceAll('_', ' ');
  return '—';
}

function defaultActionLabel(assignment: PlanAssignment): string {
  const action = assignment.defaultAction;
  if (!action) return 'No default';
  if (action.staffName)
    return `${action.staffName} · ${action.actionType.replaceAll('_', ' ')}`;
  return action.actionType.replaceAll('_', ' ');
}

function categoryClass(category: string): string {
  const values: Record<string, string> = {
    PRI: 'bg-sky-50 border-sky-200 text-sky-950',
    EL: 'bg-violet-50 border-violet-200 text-violet-950',
    INT: 'bg-cyan-50 border-cyan-200 text-cyan-950',
    MS: 'bg-orange-50 border-orange-200 text-orange-950',
    HS: 'bg-rose-50 border-rose-200 text-rose-950',
    PLAN_ADMIN: 'bg-slate-100 border-slate-300 text-slate-900',
    LUNCH: 'bg-amber-50 border-amber-200 text-amber-950',
    AFTER_SCHOOL_OTHER: 'bg-stone-100 border-stone-300 text-stone-900',
  };
  return values[category] ?? values.AFTER_SCHOOL_OTHER ?? '';
}

function schoolToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
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
