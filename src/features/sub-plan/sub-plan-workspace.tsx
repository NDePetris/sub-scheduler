import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { normalizeToSchoolDay, shiftSchoolDay } from '@/domain/calendar';
import { isTeacherRole } from '@/domain/staff';
import { ResolveSubNeedDrawer } from '@/features/sub-plan/resolve-sub-need-drawer';
import { formatRoomLabel } from '@/features/sub-plan/sub-plan-presentation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  addAbsence,
  editMessage,
  ensurePlan,
  listStaff,
  regenerateMessage,
  setPlanStatus,
  type BootstrapData,
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
    normalizeToSchoolDay(schoolToday(bootstrap.school.timezone)),
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
    setDate(shiftSchoolDay(date, days));
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
              ? detail.plan.specialScheduleName
                ? `Special Schedule: ${detail.plan.specialScheduleName}`
                : detail.plan.scheduleName
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
            onChange={(event) => {
              if (event.target.value) {
                setDate(normalizeToSchoolDay(event.target.value));
              }
            }}
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
            onClick={() =>
              setDate(
                normalizeToSchoolDay(schoolToday(bootstrap.school.timezone)),
              )
            }
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

      {detail &&
        detail.plan.expectedDayType !== null &&
        detail.plan.dayType !== detail.plan.expectedDayType && (
          <div className="border-warning/30 bg-warning-soft text-warning-dark rounded-md border px-3 py-2 text-xs">
            A/B override active: expected {detail.plan.expectedDayType},
            selected {detail.plan.dayType}.
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
          staff={staff.filter((person) => isTeacherRole(person.role))}
          onClose={() => setShowAbsence(false)}
          onSaved={async () => {
            setShowAbsence(false);
            await load(date);
          }}
        />
      )}
      {selectedAssignment && detail && (
        <ResolveSubNeedDrawer
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
          <th className="w-[22rem] px-3 py-2.5">Class / Responsibility</th>
          <th className="w-72 px-3 py-2.5">Assigned</th>
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
            <td className="truncate px-3 py-3" title={assignment.description}>
              {assignment.description}
            </td>
            <td className="px-3 py-3">
              <AssignedCell assignment={assignment} />
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
  const [teacherQuery, setTeacherQuery] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(0);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:30');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matchingStaff = useMemo(() => {
    const query = teacherQuery.trim().toLocaleLowerCase('en-US');
    return staff.filter(
      (person) =>
        !query || person.displayName.toLocaleLowerCase('en-US').includes(query),
    );
  }, [staff, teacherQuery]);

  function chooseTeacher(person: StaffData) {
    setSelectedStaffId(person.id);
    setTeacherQuery(person.displayName);
    setOptionsOpen(false);
    setActiveOption(0);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const person = staff.find((candidate) => candidate.id === selectedStaffId);
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
          <div className="relative">
            <input
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={optionsOpen}
              aria-controls="teacher-options"
              aria-activedescendant={
                optionsOpen && matchingStaff[activeOption]
                  ? `teacher-option-${matchingStaff[activeOption].id}`
                  : undefined
              }
              value={teacherQuery}
              onFocus={() => setOptionsOpen(true)}
              onChange={(event) => {
                setTeacherQuery(event.target.value);
                setSelectedStaffId('');
                setOptionsOpen(true);
                setActiveOption(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOptionsOpen(true);
                  setActiveOption((value) =>
                    Math.max(0, Math.min(value + 1, matchingStaff.length - 1)),
                  );
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveOption((value) => Math.max(value - 1, 0));
                } else if (
                  event.key === 'Enter' &&
                  optionsOpen &&
                  matchingStaff[activeOption]
                ) {
                  event.preventDefault();
                  chooseTeacher(matchingStaff[activeOption]);
                } else if (event.key === 'Escape') {
                  setOptionsOpen(false);
                }
              }}
              onBlur={() => window.setTimeout(() => setOptionsOpen(false), 0)}
              placeholder="Search active teachers"
              className="field"
              required
            />
            {optionsOpen && (
              <div
                id="teacher-options"
                role="listbox"
                className="border-border absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-white py-1 shadow-lg"
              >
                {matchingStaff.length > 0 ? (
                  matchingStaff.map((person, index) => (
                    <button
                      id={`teacher-option-${person.id}`}
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={person.id === selectedStaffId}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveOption(index)}
                      onClick={() => chooseTeacher(person)}
                      className={cn(
                        'block w-full px-3 py-2 text-left text-sm',
                        index === activeOption
                          ? 'bg-brand-soft text-brand-dark'
                          : 'hover:bg-muted',
                      )}
                    >
                      {person.displayName}
                    </button>
                  ))
                ) : (
                  <p className="text-muted-foreground px-3 py-2 text-sm">
                    No active teachers match.
                  </p>
                )}
              </div>
            )}
          </div>
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
                  const roomLabel = formatRoomLabel(entry.room);
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
                      {roomLabel && (
                        <span className="block opacity-70">{roomLabel}</span>
                      )}
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

function AssignedCell({ assignment }: { readonly assignment: PlanAssignment }) {
  if (assignment.segments.length > 0) {
    return (
      <div className="space-y-0.5 text-xs">
        {assignment.segments.map((segment) => (
          <div key={segment.id}>
            <span className="font-semibold">{segment.staffName}</span>{' '}
            <span className="text-muted-foreground font-mono">
              {segment.startTime}–{segment.endTime}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={cn(assignment.assignedStaff && 'font-semibold')}>
        {assignmentLabel(assignment)}
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
  );
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be completed.';
}
