import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Info,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  getTeacherPerformanceDetailReport,
  getTeacherPerformanceReport,
  type TeacherPerformanceDetailReportData,
  type TeacherPerformanceReportData,
} from '@/lib/api';

import {
  nextSort,
  resolutionLabel,
  sortTeachers,
  type SortDirection,
  type TeacherPerformanceSortColumn,
} from './teacher-performance-presentation';

const metricDefinitions = {
  absences: 'Full-day absences on school days. Includes Blackout Days.',
  blackoutDays:
    'Full-day absences on dates configured as blackout school days. Included in Absences.',
  partialAbsences: 'School days with at least one partial-day absence.',
  coverageMinutes:
    'Unique minutes of finalized additional direct or split coverage that count toward workload.',
} as const;

interface DetailIdentity {
  readonly teacherId: string;
  readonly startDate: string;
  readonly endDate: string;
}

interface DetailState<T> {
  readonly identity: DetailIdentity;
  readonly value: T;
}

function sameDetailIdentity(
  left: DetailIdentity | null,
  right: DetailIdentity | null,
): boolean {
  return (
    left?.teacherId === right?.teacherId &&
    left?.startDate === right?.startDate &&
    left?.endDate === right?.endDate
  );
}

function localDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function TeacherPerformanceReport() {
  const [initialEndDate] = useState(localDate);
  const [startDate, setStartDate] = useState(() => localDate(-30));
  const [endDate, setEndDate] = useState(initialEndDate);
  const [schoolToday, setSchoolToday] = useState<string | null>(null);
  const [report, setReport] = useState<TeacherPerformanceReportData | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<{
    column: TeacherPerformanceSortColumn;
    direction: SortDirection;
  }>({ column: 'teacher', direction: 'ascending' });
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] =
    useState<DetailState<TeacherPerformanceDetailReportData> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<DetailState<string> | null>(
    null,
  );
  const selectedRow = useRef<HTMLButtonElement | null>(null);

  const rangeError =
    !startDate || !endDate
      ? 'Choose both a From and To date.'
      : startDate > endDate
        ? 'From date must be on or before To date.'
        : null;
  const activeDetailIdentity = selectedTeacherId
    ? { teacherId: selectedTeacherId, startDate, endDate }
    : null;
  const detailRequestId = useRef(0);

  useEffect(() => {
    if (rangeError) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      return getTeacherPerformanceReport(startDate, endDate, controller.signal)
        .then((next) => {
          setReport(next);
          setSchoolToday(next.range.today);
          if (endDate === initialEndDate && next.range.today !== endDate)
            setEndDate(next.range.today);
        })
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === 'AbortError'))
            setError(message(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    });
    return () => controller.abort();
  }, [endDate, initialEndDate, rangeError, reloadKey, startDate]);

  useEffect(() => {
    if (!selectedTeacherId || rangeError) return;
    const identity: DetailIdentity = {
      teacherId: selectedTeacherId,
      startDate,
      endDate,
    };
    const requestId = ++detailRequestId.current;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      return getTeacherPerformanceDetailReport(
        selectedTeacherId,
        startDate,
        endDate,
        controller.signal,
      )
        .then((next) => {
          if (detailRequestId.current === requestId)
            setDetail({ identity, value: next });
        })
        .catch((cause: unknown) => {
          if (
            !(cause instanceof DOMException && cause.name === 'AbortError') &&
            detailRequestId.current === requestId
          )
            setDetailError({ identity, value: message(cause) });
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            detailRequestId.current === requestId
          )
            setDetailLoading(false);
        });
    });
    return () => {
      controller.abort();
      detailRequestId.current += 1;
    };
  }, [endDate, rangeError, selectedTeacherId, startDate]);

  const visibleDetail = sameDetailIdentity(
    detail?.identity ?? null,
    activeDetailIdentity,
  )
    ? (detail?.value ?? null)
    : null;
  const visibleDetailError = sameDetailIdentity(
    detailError?.identity ?? null,
    activeDetailIdentity,
  )
    ? (detailError?.value ?? null)
    : null;
  const visibleDetailLoading =
    !rangeError && (detailLoading || (!visibleDetail && !visibleDetailError));

  const teachers = useMemo(
    () =>
      report ? sortTeachers(report.teachers, sort.column, sort.direction) : [],
    [report, sort],
  );
  const setToday = () => {
    if (schoolToday) setEndDate(schoolToday);
  };
  const closeDetail = () => {
    setSelectedTeacherId(null);
    setDetail(null);
    setDetailError(null);
    requestAnimationFrame(() => selectedRow.current?.focus());
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Reports
        </p>
        <h1 className="mt-1 text-2xl font-bold">Teacher Performance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Review absence and finalized coverage activity by Teacher.
        </p>
      </div>
      <section
        className="border-border flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
        aria-label="Report date range"
      >
        <DateField
          label="From date"
          value={startDate}
          onChange={setStartDate}
        />
        <DateField label="To date" value={endDate} onChange={setEndDate} />
        <Button
          variant="secondary"
          disabled={!schoolToday || endDate === schoolToday}
          onClick={setToday}
        >
          Today
        </Button>
        {rangeError && (
          <p className="text-danger-dark w-full text-sm" role="alert">
            {rangeError}
          </p>
        )}
      </section>
      {report?.range.includesFutureDates && (
        <Warning>
          <p>
            This range includes future dates. Some totals may reflect planned
            absences or finalized future coverage. Set the end date to Today for
            historical-only results.
          </p>
          <Button size="sm" variant="secondary" onClick={setToday}>
            Set end date to Today
          </Button>
        </Warning>
      )}
      {report && !report.calendar.complete && (
        <Warning>
          <p>
            Calendar setup is incomplete for this range
            {report.calendar.missingWeekdayDates
              ? ` (${report.calendar.missingWeekdayDates} weekdays are not configured)`
              : ''}
            . Absence totals use weekday fallback for dates without configured
            school-calendar information and may change when the calendar is
            completed.
          </p>
        </Warning>
      )}
      {error && (
        <div
          className="border-danger/30 bg-danger-soft text-danger-dark rounded-lg border p-3 text-sm"
          role="alert"
        >
          <p>{error}</p>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {loading && !report ? (
        <div className="border-border rounded-lg border bg-white p-8 text-center text-sm">
          Loading Teacher Performance report…
        </div>
      ) : (
        report && (
          <TeacherTable
            teachers={teachers}
            sort={sort}
            onSort={(column) => setSort((current) => nextSort(current, column))}
            onSelect={(id, element) => {
              selectedRow.current = element;
              setSelectedTeacherId(id);
            }}
          />
        )
      )}
      {selectedTeacherId && (
        <TeacherDetailDrawer
          detail={rangeError ? null : visibleDetail}
          loading={rangeError ? false : visibleDetailLoading}
          error={rangeError ? null : visibleDetailError}
          startDate={startDate}
          endDate={endDate}
          fallbackTeacher={
            report?.teachers.find(
              (teacher) => teacher.staffId === selectedTeacherId,
            ) ?? null
          }
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="text-muted-foreground text-xs font-semibold">
      {label}
      <input
        className="field mt-1 block"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Warning({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="border-warning/40 bg-warning-soft text-warning-dark flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
      role="status"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

function TeacherTable({
  teachers,
  sort,
  onSort,
  onSelect,
}: {
  readonly teachers: TeacherPerformanceReportData['teachers'];
  readonly sort: {
    column: TeacherPerformanceSortColumn;
    direction: SortDirection;
  };
  readonly onSort: (column: TeacherPerformanceSortColumn) => void;
  readonly onSelect: (id: string, element: HTMLButtonElement) => void;
}) {
  const columns: readonly {
    readonly key: TeacherPerformanceSortColumn;
    readonly label: string;
    readonly definition?: string;
  }[] = [
    { key: 'teacher', label: 'Teacher' },
    {
      key: 'absences',
      label: 'Absences',
      definition: metricDefinitions.absences,
    },
    {
      key: 'blackoutDays',
      label: 'Blackout Days',
      definition: metricDefinitions.blackoutDays,
    },
    {
      key: 'partialAbsences',
      label: 'Partial Absences',
      definition: metricDefinitions.partialAbsences,
    },
    {
      key: 'coverageMinutes',
      label: 'Coverage Minutes',
      definition: metricDefinitions.coverageMinutes,
    },
  ];
  return (
    <div
      className="border-border overflow-x-auto rounded-lg border bg-white"
      aria-busy={false}
    >
      <table className="w-full min-w-[800px] border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-muted-foreground text-xs uppercase">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                aria-sort={
                  sort.column === column.key
                    ? sort.direction === 'ascending'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="px-4 py-3"
              >
                <button
                  className="hover:text-foreground focus-visible:ring-brand/40 inline-flex items-center gap-1 font-semibold focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                  {column.definition && (
                    <span
                      title={column.definition}
                      aria-label={column.definition}
                    >
                      <CircleHelp className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                  {sort.column === column.key &&
                    (sort.direction === 'ascending' ? (
                      <ChevronUp className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    ))}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
            <tr
              key={teacher.staffId}
              className="border-border hover:bg-muted/35 border-t"
            >
              <td className="px-4 py-3">
                <button
                  className="focus-visible:ring-brand/40 text-left font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  onClick={(event) =>
                    onSelect(teacher.staffId, event.currentTarget)
                  }
                >
                  {teacher.displayName}
                </button>
                {!teacher.isActive && <Badge className="ml-2">Inactive</Badge>}
              </td>
              <td className="px-4 py-3">{teacher.absences}</td>
              <td className="px-4 py-3">{teacher.blackoutDays}</td>
              <td className="px-4 py-3">{teacher.partialAbsences}</td>
              <td className="px-4 py-3">{teacher.coverageMinutes}</td>
            </tr>
          ))}
          {teachers.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="text-muted-foreground px-4 py-10 text-center"
              >
                No Teachers were returned for this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeacherDetailDrawer({
  detail,
  loading,
  error,
  startDate,
  endDate,
  fallbackTeacher,
  onClose,
}: {
  readonly detail: TeacherPerformanceDetailReportData | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly fallbackTeacher:
    TeacherPerformanceReportData['teachers'][number] | null;
  readonly onClose: () => void;
}) {
  const teacher = detail?.teacher ?? fallbackTeacher;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-report-drawer-title"
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
      >
        <header className="border-border sticky top-0 z-10 flex min-h-16 items-center justify-between border-b bg-white px-5">
          <div>
            <h2 id="teacher-report-drawer-title" className="text-lg font-bold">
              {teacher?.displayName ?? 'Teacher report'}
            </h2>
            {teacher && !teacher.isActive && <Badge>Inactive</Badge>}
            <p className="text-muted-foreground text-xs">
              {formatDate(startDate)} – {formatDate(endDate)}
            </p>
          </div>
          <button
            aria-label="Close teacher report"
            className="hover:bg-muted focus-visible:ring-brand/40 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="space-y-6 p-5">
          {loading && (
            <p className="text-muted-foreground text-sm">
              Loading Teacher details…
            </p>
          )}
          {error && (
            <p className="text-danger-dark text-sm" role="alert">
              {error}
            </p>
          )}
          {detail && <DetailContent detail={detail} />}
        </div>
      </section>
    </div>
  );
}

function DetailContent({
  detail,
}: {
  readonly detail: TeacherPerformanceDetailReportData;
}) {
  const { absenceSummary, coverageSummary } = detail;
  return (
    <>
      <section>
        <h3 className="text-sm font-bold">Absences</h3>
        <MetricGrid
          values={[
            [
              'Full-Day Absences',
              String(absenceSummary.absences),
              'Includes Blackout Days.',
            ],
            ['Regular Full-Day', String(absenceSummary.regularFullDayAbsences)],
            ['Blackout Days', String(absenceSummary.blackoutDays)],
            ['Partial Absence Days', String(absenceSummary.partialAbsences)],
            ['Partial Minutes', `${absenceSummary.partialAbsenceMinutes} min`],
          ]}
        />
        <div className="mt-4 space-y-3">
          {detail.absenceDetails.fullDayAbsences.map((absence) => (
            <div key={absence.date} className="border-border border-t pt-3">
              <p className="font-semibold">
                {formatDate(absence.date)}{' '}
                {absence.isBlackoutDay && (
                  <Badge className="ml-1">Blackout</Badge>
                )}
              </p>
              {absence.calendarLabel && (
                <p className="text-muted-foreground text-xs">
                  {absence.calendarLabel}
                </p>
              )}
            </div>
          ))}
          {detail.absenceDetails.partialAbsences.map((absence) => (
            <div key={absence.date} className="border-border border-t pt-3">
              <p className="font-semibold">
                {formatDate(absence.date)}{' '}
                <span className="text-muted-foreground font-normal">
                  — {absence.totalMinutes} min total
                </span>
              </p>
              {absence.calendarLabel && (
                <p className="text-muted-foreground text-xs">
                  {absence.calendarLabel}
                </p>
              )}
              <ul className="text-muted-foreground mt-1 text-sm">
                {absence.intervals.map((interval) => (
                  <li key={`${interval.startTime}-${interval.endTime}`}>
                    {interval.startTime}–{interval.endTime} — {interval.minutes}{' '}
                    min
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-bold">Coverage</h3>
        <MetricGrid
          values={[
            [
              'Coverage Minutes',
              `${coverageSummary.coverageMinutes} min`,
              'Unique finalized additional coverage time.',
            ],
            [
              'Coverage Period Equivalents',
              nullableNumber(coverageSummary.coveragePeriodEquivalents),
              "Coverage Minutes divided by the Teacher's configured or inferred standard instructional period length.",
            ],
            [
              'Coverage Segments',
              String(coverageSummary.coverageSegments),
              'Number of separate direct or split coverage contributions.',
            ],
            [
              'Plan Periods Lost',
              nullableNumber(coverageSummary.planPeriodsLost),
              "Coverage time that overlaps the Teacher's PLAN periods, normalized to the Teacher's standard instructional period.",
            ],
          ]}
        />
        <PeriodContext teacher={detail.teacher} />
        <div className="mt-4 space-y-4">
          {detail.coverageDetails.map((day) => (
            <article key={day.date} className="border-border border-t pt-3">
              <p className="font-semibold">{formatDate(day.date)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Coverage: {day.coverageMinutes} min | {day.coverageSegments}{' '}
                segments | {nullableNumber(day.coveragePeriodEquivalents)}{' '}
                equivalents | {nullableNumber(day.planPeriodsLost)} PPL
                {day.standardPeriodMinutes
                  ? ` | ${day.standardPeriodMinutes} min (${sourceLabel(day.standardPeriodSource)})`
                  : ''}
              </p>
              <div className="mt-3 space-y-3">
                {day.entries.map((entry) => (
                  <div
                    key={`${entry.assignmentId}-${entry.segmentId ?? 'direct'}`}
                    className="text-sm"
                  >
                    <p className="font-semibold">
                      {entry.startTime}–{entry.endTime}
                    </p>
                    <p>
                      {entry.description} — covering {entry.absentStaffName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {entry.responsibilityType} · {entry.minutes} min
                      {resolutionLabel(entry.resolutionType)
                        ? ` · ${resolutionLabel(entry.resolutionType)}`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MetricGrid({
  values,
}: {
  readonly values: readonly (readonly [string, string, string?])[];
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {values.map(([label, value, definition]) => (
        <div key={label} className="border-border rounded-md border p-3">
          <dt className="text-muted-foreground flex items-center gap-1 text-xs font-semibold">
            {label}
            {definition && (
              <span title={definition} aria-label={definition}>
                <Info className="size-3" aria-hidden="true" />
              </span>
            )}
          </dt>
          <dd className="mt-1 font-bold">
            {value === '—' ? (
              <span title="A standard instructional period could not be determined.">
                Unknown
              </span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function PeriodContext({
  teacher,
}: {
  readonly teacher: TeacherPerformanceDetailReportData['teacher'];
}) {
  const label = teacher.standardPeriodMinutes
    ? `Standard period: ${teacher.standardPeriodMinutes} min (${sourceLabel(teacher.standardPeriodSource)})`
    : 'Standard period: Unknown';
  const note =
    teacher.standardPeriodSource === 'configured'
      ? 'Configured standard period length is current Staff configuration. Changing it can change historical Coverage Period Equivalents and Plan Periods Lost.'
      : teacher.standardPeriodSource === 'mixed'
        ? 'Period length varies by historical schedule/date; date-level values are used.'
        : null;
  return (
    <div className="text-muted-foreground mt-3 text-xs">
      <p>{label}</p>
      {note && (
        <p className="mt-1 flex gap-1">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}
    </div>
  );
}
function nullableNumber(value: number | null): string {
  return value === null
    ? '—'
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
}
function sourceLabel(value: string): string {
  return value === 'historical_schedule'
    ? 'historical schedule'
    : value === 'mixed'
      ? 'mixed by date'
      : value;
}
function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1));
}
function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The report could not be loaded.';
}
