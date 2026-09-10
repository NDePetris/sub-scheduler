import {
  calculatePlanPeriodsLost,
  resolveStandardPeriodMinutes,
  roundBurden,
} from './planning';
import {
  isSchoolDay,
  parseLocalTime,
  parseSchoolDate,
  shiftCalendarDate,
} from './calendar';
import { createTimeInterval, intervalDurationMinutes } from './interval';
import { isTeacherRole } from './staff';

export interface ReportingStaff {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly isSchoolSub: boolean;
  readonly standardPeriodMinutes?: number | null;
}

export interface ReportingCalendarDate {
  readonly date: string;
  readonly isSchoolDay: boolean;
  readonly isBlackoutDay: boolean;
  readonly label?: string | null;
}

export interface ReportingAbsence {
  readonly staffId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
}

export interface ReportingCoverageInterval {
  readonly staffId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ReportingCoverageFact extends ReportingCoverageInterval {
  readonly assignmentId: string;
  readonly segmentId: string | null;
  readonly dayType: 'A' | 'B';
  readonly scheduleVersionId: string | null;
  readonly specialScheduleId: string | null;
  readonly responsibilityType: string;
  readonly description: string;
  readonly absentStaffId: string;
  readonly absentStaffName: string;
  readonly resolutionType: string | null;
}

export interface ReportingScheduleEntry {
  readonly sourceType: 'normal' | 'special';
  readonly sourceId: string;
  readonly staffId: string;
  readonly dayType: 'A' | 'B' | 'ALL';
  readonly startTime: string;
  readonly endTime: string;
  readonly activityType: string;
}

export interface TeacherPerformanceRow {
  readonly staffId: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly absences: number;
  readonly blackoutDays: number;
  readonly partialAbsences: number;
  readonly coverageMinutes: number;
}

export interface TeacherPerformanceProjection {
  readonly calendar: {
    readonly complete: boolean;
    readonly missingWeekdayDates: number;
  };
  readonly teachers: readonly TeacherPerformanceRow[];
}

export interface TeacherPerformanceDetailProjection {
  readonly calendar: TeacherPerformanceProjection['calendar'];
  readonly teacher: {
    readonly staffId: string;
    readonly displayName: string;
    readonly isActive: boolean;
    readonly standardPeriodMinutes: number | null;
    readonly standardPeriodSource:
      'configured' | 'historical_schedule' | 'mixed' | 'unknown';
  };
  readonly absenceSummary: {
    readonly absences: number;
    readonly regularFullDayAbsences: number;
    readonly blackoutDays: number;
    readonly partialAbsences: number;
    readonly partialAbsenceMinutes: number;
  };
  readonly coverageSummary: {
    readonly coverageMinutes: number;
    readonly coverageSegments: number;
    readonly coveragePeriodEquivalents: number | null;
    readonly planPeriodsLost: number | null;
  };
  readonly absenceDetails: {
    readonly fullDayAbsences: readonly {
      readonly date: string;
      readonly isBlackoutDay: boolean;
      readonly calendarLabel: string | null;
    }[];
    readonly partialAbsences: readonly {
      readonly date: string;
      readonly totalMinutes: number;
      readonly intervals: readonly {
        readonly startTime: string;
        readonly endTime: string;
        readonly minutes: number;
      }[];
      readonly calendarLabel: string | null;
    }[];
  };
  readonly coverageDetails: readonly CoverageDateDetail[];
}

interface CoverageDateDetail {
  readonly date: string;
  readonly coverageMinutes: number;
  readonly coverageSegments: number;
  readonly coveragePeriodEquivalents: number | null;
  readonly planPeriodsLost: number | null;
  readonly standardPeriodMinutes: number | null;
  readonly standardPeriodSource:
    'configured' | 'historical_schedule' | 'unknown';
  readonly entries: readonly {
    readonly assignmentId: string;
    readonly segmentId: string | null;
    readonly startTime: string;
    readonly endTime: string;
    readonly minutes: number;
    readonly responsibilityType: string;
    readonly description: string;
    readonly absentStaffId: string;
    readonly absentStaffName: string;
    readonly resolutionType: string | null;
  }[];
}

export function projectTeacherPerformance(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly staff: readonly ReportingStaff[];
  readonly calendarDates: readonly ReportingCalendarDate[];
  readonly absences: readonly ReportingAbsence[];
  readonly coverage: readonly ReportingCoverageInterval[];
}): TeacherPerformanceProjection {
  const calendar = reportCalendar(
    input.startDate,
    input.endDate,
    input.calendarDates,
  );
  const teachers = input.staff.filter(
    (person) => isTeacherRole(person.role) && !person.isSchoolSub,
  );
  const coverageByTeacherDate = new Map<string, ReportingCoverageInterval[]>();
  for (const interval of input.coverage) {
    if (interval.date < input.startDate || interval.date > input.endDate)
      continue;
    const key = reportKey(interval.staffId, interval.date);
    const intervals = coverageByTeacherDate.get(key) ?? [];
    intervals.push(interval);
    coverageByTeacherDate.set(key, intervals);
  }
  return {
    calendar: calendar.summary,
    teachers: teachers
      .map((person) => {
        const absence = projectAbsences({
          startDate: input.startDate,
          endDate: input.endDate,
          staffId: person.id,
          absences: input.absences,
          calendar,
        });
        return {
          staffId: person.id,
          displayName: person.displayName,
          isActive: person.isActive,
          absences: absence.summary.absences,
          blackoutDays: absence.summary.blackoutDays,
          partialAbsences: absence.summary.partialAbsences,
          coverageMinutes: coverageMinutesForStaff(
            coverageByTeacherDate,
            person.id,
          ),
        };
      })
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName, 'en-US') ||
          left.staffId.localeCompare(right.staffId, 'en-US'),
      ),
  };
}

export function projectTeacherPerformanceDetail(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly teacher: ReportingStaff;
  readonly calendarDates: readonly ReportingCalendarDate[];
  readonly absences: readonly ReportingAbsence[];
  readonly coverage: readonly ReportingCoverageFact[];
  readonly scheduleEntries: readonly ReportingScheduleEntry[];
}): TeacherPerformanceDetailProjection {
  const calendar = reportCalendar(
    input.startDate,
    input.endDate,
    input.calendarDates,
  );
  const absence = projectAbsences({
    startDate: input.startDate,
    endDate: input.endDate,
    staffId: input.teacher.id,
    absences: input.absences,
    calendar,
  });
  const coverageDetails = projectCoverageDetails(input);
  const coveragePeriodEquivalents = coverageDetails.some(
    (detail) => detail.coveragePeriodEquivalents === null,
  )
    ? null
    : roundBurden(
        coverageDetails.reduce(
          (total, detail) =>
            total +
            detail.coverageMinutes / (detail.standardPeriodMinutes ?? 1),
          0,
        ),
      );
  const planPeriodsLost = coverageDetails.some(
    (detail) => detail.planPeriodsLost === null,
  )
    ? null
    : roundBurden(
        coverageDetails.reduce(
          (total, detail) => total + (detail.planPeriodsLost ?? 0),
          0,
        ),
      );
  return {
    calendar: calendar.summary,
    teacher: {
      staffId: input.teacher.id,
      displayName: input.teacher.displayName,
      isActive: input.teacher.isActive,
      ...overallStandardPeriod(input.teacher, coverageDetails),
    },
    absenceSummary: absence.summary,
    coverageSummary: {
      coverageMinutes: coverageDetails.reduce(
        (total, detail) => total + detail.coverageMinutes,
        0,
      ),
      coverageSegments: coverageDetails.reduce(
        (total, detail) => total + detail.coverageSegments,
        0,
      ),
      coveragePeriodEquivalents,
      planPeriodsLost,
    },
    absenceDetails: absence.details,
    coverageDetails,
  };
}

export function mergedMinutes(
  intervals: readonly Pick<
    ReportingCoverageInterval,
    'startTime' | 'endTime'
  >[],
): number {
  const sorted = intervals
    .map((interval) => ({
      start: parseLocalTime(interval.startTime),
      end: parseLocalTime(interval.endTime),
    }))
    .sort((left, right) => left.start.localeCompare(right.start));
  let total = 0;
  let current: (typeof sorted)[number] | null = null;
  for (const interval of sorted) {
    if (!current) current = interval;
    else if (interval.start <= current.end) {
      if (interval.end > current.end)
        current = { start: current.start, end: interval.end };
    } else {
      total += duration(current.start, current.end);
      current = interval;
    }
  }
  return current ? total + duration(current.start, current.end) : total;
}

function projectAbsences(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly staffId: string;
  readonly absences: readonly ReportingAbsence[];
  readonly calendar: ReturnType<typeof reportCalendar>;
}) {
  const fullDates = new Set<string>();
  const partialByDate = new Map<string, ReportingAbsence[]>();
  for (const absence of input.absences) {
    if (absence.staffId !== input.staffId) continue;
    if (absence.startTime === null && absence.endTime === null) {
      for (const date of enumerateCalendarDates(
        maxDate(input.startDate, absence.startDate),
        minDate(input.endDate, absence.endDate),
      )) {
        if (reportSchoolDay(date, input.calendar.byDate)) fullDates.add(date);
      }
    } else if (
      absence.startTime !== null &&
      absence.endTime !== null &&
      absence.startDate >= input.startDate &&
      absence.startDate <= input.endDate &&
      reportSchoolDay(absence.startDate, input.calendar.byDate)
    ) {
      const intervals = partialByDate.get(absence.startDate) ?? [];
      intervals.push(absence);
      partialByDate.set(absence.startDate, intervals);
    }
  }
  const fullDayAbsences = [...fullDates].sort().map((date) => ({
    date,
    isBlackoutDay: input.calendar.byDate.get(date)?.isBlackoutDay ?? false,
    calendarLabel: input.calendar.byDate.get(date)?.label ?? null,
  }));
  const partialAbsences = [...partialByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, absences]) => ({
      date,
      totalMinutes: mergedMinutes(
        absences.map((absence) => timeRange(absence)),
      ),
      intervals: absences
        .map((absence) => ({
          ...timeRange(absence),
          minutes: duration(
            absence.startTime ?? '00:00',
            absence.endTime ?? '00:00',
          ),
        }))
        .sort(
          (left, right) =>
            left.startTime.localeCompare(right.startTime) ||
            left.endTime.localeCompare(right.endTime),
        ),
      calendarLabel: input.calendar.byDate.get(date)?.label ?? null,
    }));
  const blackoutDays = fullDayAbsences.filter(
    (item) => item.isBlackoutDay,
  ).length;
  return {
    summary: {
      absences: fullDayAbsences.length,
      regularFullDayAbsences: fullDayAbsences.length - blackoutDays,
      blackoutDays,
      partialAbsences: partialAbsences.length,
      partialAbsenceMinutes: partialAbsences.reduce(
        (total, absence) => total + absence.totalMinutes,
        0,
      ),
    },
    details: { fullDayAbsences, partialAbsences },
  };
}

function projectCoverageDetails(input: {
  readonly teacher: ReportingStaff;
  readonly coverage: readonly ReportingCoverageFact[];
  readonly scheduleEntries: readonly ReportingScheduleEntry[];
}): readonly CoverageDateDetail[] {
  const factsByDate = new Map<string, ReportingCoverageFact[]>();
  for (const fact of input.coverage) {
    const facts = factsByDate.get(fact.date) ?? [];
    facts.push(fact);
    factsByDate.set(fact.date, facts);
  }
  return [...factsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, facts]) => {
      const context = facts[0];
      if (!context) throw new Error('Coverage detail requires a plan context.');
      const applicableSourceType = context.specialScheduleId
        ? 'special'
        : 'normal';
      const applicableSourceId =
        context.specialScheduleId ?? context.scheduleVersionId;
      const applicableEntries = applicableSourceId
        ? entriesForSource(
            input.scheduleEntries,
            input.teacher.id,
            applicableSourceType,
            applicableSourceId,
          )
        : [];
      const normalEntries = context.scheduleVersionId
        ? entriesForSource(
            input.scheduleEntries,
            input.teacher.id,
            'normal',
            context.scheduleVersionId,
          )
        : [];
      const standardPeriodMinutes = resolveStandardPeriodMinutes({
        configuredMinutes: input.teacher.standardPeriodMinutes ?? null,
        dayType: context.dayType,
        normalEntries,
        applicableEntries,
      });
      const standardPeriodSource = input.teacher.standardPeriodMinutes
        ? 'configured'
        : standardPeriodMinutes
          ? 'historical_schedule'
          : 'unknown';
      const coverage = facts.map((fact) => ({
        startTime: fact.startTime,
        endTime: fact.endTime,
      }));
      const planBlocks = applicableEntries
        .filter(
          (entry) =>
            entry.activityType === 'plan' &&
            (entry.dayType === 'ALL' || entry.dayType === context.dayType),
        )
        .map((entry) => ({
          startTime: entry.startTime,
          endTime: entry.endTime,
        }));
      const coverageMinutes = mergedMinutes(coverage);
      return {
        date,
        coverageMinutes,
        coverageSegments: facts.length,
        coveragePeriodEquivalents: standardPeriodMinutes
          ? roundBurden(coverageMinutes / standardPeriodMinutes)
          : null,
        planPeriodsLost: calculatePlanPeriodsLost(
          planBlocks,
          coverage,
          standardPeriodMinutes,
        ),
        standardPeriodMinutes,
        standardPeriodSource,
        entries: facts
          .map((fact) => ({
            assignmentId: fact.assignmentId,
            segmentId: fact.segmentId,
            startTime: fact.startTime,
            endTime: fact.endTime,
            minutes: duration(fact.startTime, fact.endTime),
            responsibilityType: fact.responsibilityType,
            description: fact.description,
            absentStaffId: fact.absentStaffId,
            absentStaffName: fact.absentStaffName,
            resolutionType: fact.resolutionType,
          }))
          .sort(
            (left, right) =>
              left.startTime.localeCompare(right.startTime) ||
              left.endTime.localeCompare(right.endTime) ||
              left.assignmentId.localeCompare(right.assignmentId),
          ),
      };
    });
}

function overallStandardPeriod(
  teacher: ReportingStaff,
  coverageDetails: readonly CoverageDateDetail[],
) {
  if (teacher.standardPeriodMinutes)
    return {
      standardPeriodMinutes: teacher.standardPeriodMinutes,
      standardPeriodSource: 'configured' as const,
    };
  const known = coverageDetails.filter(
    (detail) => detail.standardPeriodMinutes !== null,
  );
  if (known.length === 0)
    return {
      standardPeriodMinutes: null,
      standardPeriodSource: 'unknown' as const,
    };
  const first = known[0];
  if (
    known.length !== coverageDetails.length ||
    known.some(
      (detail) => detail.standardPeriodMinutes !== first?.standardPeriodMinutes,
    )
  ) {
    return {
      standardPeriodMinutes: null,
      standardPeriodSource: 'mixed' as const,
    };
  }
  return {
    standardPeriodMinutes: first?.standardPeriodMinutes ?? null,
    standardPeriodSource: 'historical_schedule' as const,
  };
}

function entriesForSource(
  entries: readonly ReportingScheduleEntry[],
  staffId: string,
  sourceType: 'normal' | 'special',
  sourceId: string,
) {
  return entries.filter(
    (entry) =>
      entry.staffId === staffId &&
      entry.sourceType === sourceType &&
      entry.sourceId === sourceId,
  );
}

function reportCalendar(
  startDate: string,
  endDate: string,
  calendarDates: readonly ReportingCalendarDate[],
) {
  const byDate = new Map(calendarDates.map((record) => [record.date, record]));
  const missingWeekdayDates = enumerateCalendarDates(startDate, endDate).filter(
    (date) => isSchoolDay(date) && !byDate.has(date),
  ).length;
  return {
    byDate,
    summary: { complete: missingWeekdayDates === 0, missingWeekdayDates },
  };
}

function enumerateCalendarDates(startDate: string, endDate: string): string[] {
  const start = parseSchoolDate(startDate);
  const end = parseSchoolDate(endDate);
  if (start > end) return [];
  const dates: string[] = [];
  for (
    let current = start;
    current <= end;
    current = shiftCalendarDate(current, 1)
  ) {
    dates.push(current);
  }
  return dates;
}

function reportSchoolDay(
  date: string,
  calendarByDate: ReadonlyMap<string, ReportingCalendarDate>,
): boolean {
  return calendarByDate.get(date)?.isSchoolDay ?? isSchoolDay(date);
}

function coverageMinutesForStaff(
  intervalsByTeacherDate: ReadonlyMap<string, ReportingCoverageInterval[]>,
  staffId: string,
): number {
  const prefix = `${staffId}\u0000`;
  let minutes = 0;
  for (const [key, intervals] of intervalsByTeacherDate) {
    if (key.startsWith(prefix)) minutes += mergedMinutes(intervals);
  }
  return minutes;
}

function timeRange(absence: ReportingAbsence) {
  return {
    startTime: absence.startTime ?? '00:00',
    endTime: absence.endTime ?? '00:00',
  };
}

function duration(startTime: string, endTime: string): number {
  return intervalDurationMinutes(
    createTimeInterval(parseLocalTime(startTime), parseLocalTime(endTime)),
  );
}

function reportKey(staffId: string, date: string): string {
  return `${staffId}\u0000${date}`;
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}
