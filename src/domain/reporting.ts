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
}

export interface ReportingCalendarDate {
  readonly date: string;
  readonly isSchoolDay: boolean;
  readonly isBlackoutDay: boolean;
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

export function projectTeacherPerformance(input: {
  readonly startDate: string;
  readonly endDate: string;
  readonly staff: readonly ReportingStaff[];
  readonly calendarDates: readonly ReportingCalendarDate[];
  readonly absences: readonly ReportingAbsence[];
  readonly coverage: readonly ReportingCoverageInterval[];
}): TeacherPerformanceProjection {
  const reportDates = enumerateCalendarDates(input.startDate, input.endDate);
  const calendarByDate = new Map(
    input.calendarDates.map((record) => [record.date, record]),
  );
  const missingWeekdayDates = reportDates.filter(
    (date) => isSchoolDay(date) && !calendarByDate.has(date),
  ).length;
  const teachers = input.staff.filter(
    (person) => isTeacherRole(person.role) && !person.isSchoolSub,
  );
  const teacherIds = new Set(teachers.map((person) => person.id));
  const fullAbsenceDates = new Set<string>();
  const blackoutDates = new Set<string>();
  const partialAbsenceDates = new Set<string>();

  for (const absence of input.absences) {
    if (!teacherIds.has(absence.staffId)) continue;
    if (absence.startTime === null && absence.endTime === null) {
      for (const date of enumerateCalendarDates(
        maxDate(input.startDate, absence.startDate),
        minDate(input.endDate, absence.endDate),
      )) {
        if (!reportSchoolDay(date, calendarByDate)) continue;
        const key = reportKey(absence.staffId, date);
        fullAbsenceDates.add(key);
        if (calendarByDate.get(date)?.isBlackoutDay) blackoutDates.add(key);
      }
    } else if (
      absence.startTime !== null &&
      absence.endTime !== null &&
      absence.startDate >= input.startDate &&
      absence.startDate <= input.endDate &&
      reportSchoolDay(absence.startDate, calendarByDate)
    ) {
      partialAbsenceDates.add(reportKey(absence.staffId, absence.startDate));
    }
  }

  const coverageByTeacherDate = new Map<string, ReportingCoverageInterval[]>();
  for (const interval of input.coverage) {
    if (
      !teacherIds.has(interval.staffId) ||
      interval.date < input.startDate ||
      interval.date > input.endDate
    ) {
      continue;
    }
    const key = reportKey(interval.staffId, interval.date);
    const intervals = coverageByTeacherDate.get(key) ?? [];
    intervals.push(interval);
    coverageByTeacherDate.set(key, intervals);
  }

  return {
    calendar: {
      complete: missingWeekdayDates === 0,
      missingWeekdayDates,
    },
    teachers: teachers
      .map((person) => ({
        staffId: person.id,
        displayName: person.displayName,
        isActive: person.isActive,
        absences: countKeysForStaff(fullAbsenceDates, person.id),
        blackoutDays: countKeysForStaff(blackoutDates, person.id),
        partialAbsences: countKeysForStaff(partialAbsenceDates, person.id),
        coverageMinutes: coverageMinutesForStaff(
          coverageByTeacherDate,
          person.id,
        ),
      }))
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName, 'en-US') ||
          left.staffId.localeCompare(right.staffId, 'en-US'),
      ),
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
    if (!current) {
      current = interval;
    } else if (interval.start <= current.end) {
      if (interval.end > current.end)
        current = { start: current.start, end: interval.end };
    } else {
      total += intervalDurationMinutes(
        createTimeInterval(current.start, current.end),
      );
      current = interval;
    }
  }
  return current
    ? total +
        intervalDurationMinutes(createTimeInterval(current.start, current.end))
    : total;
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

function countKeysForStaff(keys: ReadonlySet<string>, staffId: string): number {
  const prefix = `${staffId}\u0000`;
  return [...keys].filter((key) => key.startsWith(prefix)).length;
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
