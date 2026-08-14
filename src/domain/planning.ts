import {
  intervalDurationMinutes,
  intervalsOverlap,
  overlapMinutes,
  type TimeInterval,
} from './interval';
import {
  isSchoolDay,
  localTimeToMinutes,
  parseLocalTime,
  parseSchoolDate,
  shiftCalendarDate,
  type SchoolDate,
} from './calendar';
import {
  appliesToDay,
  type PlanDayType,
  type ScheduleDayType,
} from './schedule';

export interface ScheduleResponsibility {
  readonly id: string;
  readonly dayType: ScheduleDayType;
  readonly startTime: string;
  readonly endTime: string;
  readonly requiresSub: boolean;
}

export interface AffectedResponsibility {
  readonly sourceId: string;
  readonly startTime: string;
  readonly endTime: string;
}

export function affectedResponsibilities(
  entries: readonly ScheduleResponsibility[],
  dayType: PlanDayType,
  absence: {
    readonly startTime?: string | null;
    readonly endTime?: string | null;
  },
): AffectedResponsibility[] {
  const absenceInterval =
    absence.startTime && absence.endTime
      ? interval(absence.startTime, absence.endTime)
      : null;

  return entries
    .filter(
      (entry) => entry.requiresSub && appliesToDay(entry.dayType, dayType),
    )
    .filter(
      (entry) =>
        !absenceInterval ||
        intervalsOverlap(
          interval(entry.startTime, entry.endTime),
          absenceInterval,
        ),
    )
    .map((entry) => {
      if (!absenceInterval) {
        return {
          sourceId: entry.id,
          startTime: entry.startTime,
          endTime: entry.endTime,
        };
      }
      const start = Math.max(
        localTimeToMinutes(parseLocalTime(entry.startTime)),
        localTimeToMinutes(absenceInterval.start),
      );
      const end = Math.min(
        localTimeToMinutes(parseLocalTime(entry.endTime)),
        localTimeToMinutes(absenceInterval.end),
      );
      return {
        sourceId: entry.id,
        startTime: minutesToLocalTime(start),
        endTime: minutesToLocalTime(end),
      };
    });
}

export function enumerateWeekdaySchoolDates(
  start: string,
  end: string,
): SchoolDate[] {
  const first = parseSchoolDate(start);
  const last = parseSchoolDate(end);
  if (first > last)
    throw new Error('The start date must not be after the end date.');
  const dates: SchoolDate[] = [];
  let current = first;
  while (current <= last) {
    if (isSchoolDay(current)) dates.push(current);
    current = shiftSchoolDate(current, 1);
  }
  return dates;
}

export function shiftSchoolDate(date: string, days: number): SchoolDate {
  return shiftCalendarDate(date, days);
}

export function expectedDayType(
  date: string,
  effectiveFrom: string,
): PlanDayType {
  const target = parseSchoolDate(date);
  const start = parseSchoolDate(effectiveFrom);
  if (target <= start) return 'A';
  let schoolDays = 0;
  for (
    let cursor = shiftSchoolDate(start, 1);
    cursor <= target;
    cursor = shiftSchoolDate(cursor, 1)
  ) {
    if (isSchoolDay(cursor)) schoolDays += 1;
  }
  return schoolDays % 2 === 0 ? 'A' : 'B';
}

export interface CoverageInterval {
  readonly startTime: string;
  readonly endTime: string;
}

export interface PlanBlock {
  readonly startTime: string;
  readonly endTime: string;
}

export interface StandardPeriodScheduleEntry {
  readonly dayType: ScheduleDayType;
  readonly startTime: string;
  readonly endTime: string;
  readonly activityType: string;
}

export function inferStandardPeriodMinutes(
  entries: readonly StandardPeriodScheduleEntry[],
  dayType: PlanDayType,
): number | null {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    if (
      entry.activityType !== 'instruction' ||
      !appliesToDay(entry.dayType, dayType)
    ) {
      continue;
    }
    const duration = intervalDurationMinutes(
      interval(entry.startTime, entry.endTime),
    );
    if (duration === 40 || duration === 50) {
      counts.set(duration, (counts.get(duration) ?? 0) + 1);
    }
  }
  return (
    [...counts.entries()].sort(
      ([leftDuration, leftCount], [rightDuration, rightCount]) =>
        rightCount - leftCount || leftDuration - rightDuration,
    )[0]?.[0] ?? null
  );
}

export function resolveStandardPeriodMinutes(input: {
  readonly configuredMinutes: number | null;
  readonly dayType: PlanDayType;
  readonly normalEntries: readonly StandardPeriodScheduleEntry[];
  readonly applicableEntries?: readonly StandardPeriodScheduleEntry[];
}): number | null {
  if (input.configuredMinutes && input.configuredMinutes > 0) {
    return input.configuredMinutes;
  }
  const normal = inferStandardPeriodMinutes(input.normalEntries, input.dayType);
  if (normal) return normal;
  const applicable = inferStandardPeriodMinutes(
    input.applicableEntries ?? [],
    input.dayType,
  );
  if (applicable) return applicable;
  return null;
}

export function calculatePlanPeriodsLost(
  planBlocks: readonly PlanBlock[],
  coverage: readonly CoverageInterval[],
  standardPeriodMinutes?: number | null,
): number | null {
  let total = 0;
  for (const planBlock of planBlocks) {
    const block = interval(planBlock.startTime, planBlock.endTime);
    for (const segment of coverage) {
      const minutes = overlapMinutes(
        block,
        interval(segment.startTime, segment.endTime),
      );
      if (minutes === 0) continue;
      if (!standardPeriodMinutes || standardPeriodMinutes <= 0) return null;
      total += minutes / standardPeriodMinutes;
    }
  }
  return roundBurden(total);
}

export function projectedPlanPeriodsLost(
  current: number | null,
  proposed: number | null,
): number | null {
  if (current === null || proposed === null) return null;
  return roundBurden(current + proposed);
}

export interface SplitSegmentInput extends CoverageInterval {
  readonly staffId: string;
}

export function validateSplitSegments(
  parent: CoverageInterval,
  segments: readonly SplitSegmentInput[],
): void {
  if (segments.length < 2)
    throw new Error('Split coverage requires at least two segments.');
  const ordered = [...segments].sort((left, right) =>
    left.startTime.localeCompare(right.startTime),
  );
  let cursor = parent.startTime;
  for (const segment of ordered) {
    interval(segment.startTime, segment.endTime);
    if (segment.startTime !== cursor) {
      throw new Error(
        'Split segments must cover the Assignment without gaps or overlaps.',
      );
    }
    if (
      segment.startTime < parent.startTime ||
      segment.endTime > parent.endTime
    ) {
      throw new Error(
        'Split segments must remain inside the Assignment interval.',
      );
    }
    cursor = segment.endTime;
  }
  if (cursor !== parent.endTime) {
    throw new Error(
      'Split segments must cover the entire Assignment interval.',
    );
  }
}

export type CandidateAvailability =
  'default' | 'school_sub' | 'plan' | 'admin' | 'open' | 'manual';

export interface RankedCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly availability: CandidateAvailability;
  readonly currentBurden: number | null;
  readonly workloadKnown?: boolean;
  readonly conflicts?: readonly unknown[];
}

export function rankCandidates<T extends RankedCandidate>(
  candidates: readonly T[],
): T[] {
  const tier: Record<CandidateAvailability, number> = {
    default: 0,
    school_sub: 1,
    plan: 2,
    admin: 2,
    open: 2,
    manual: 3,
  };
  return [...candidates].sort(
    (left, right) =>
      Number(right.availability !== 'manual' && !right.conflicts?.length) -
        Number(left.availability !== 'manual' && !left.conflicts?.length) ||
      tier[left.availability] - tier[right.availability] ||
      Number(!(left.workloadKnown ?? left.currentBurden !== null)) -
        Number(!(right.workloadKnown ?? right.currentBurden !== null)) ||
      Number(left.currentBurden === null) -
        Number(right.currentBurden === null) ||
      (left.currentBurden ?? 0) - (right.currentBurden ?? 0) ||
      left.displayName.localeCompare(right.displayName) ||
      left.id.localeCompare(right.id),
  );
}

export interface MessageAssignment {
  readonly startTime: string;
  readonly endTime: string;
  readonly absentTeacher: string;
  readonly description: string;
  readonly resolution: string;
}

export function renderSubPlanMessage(input: {
  readonly template: string;
  readonly schoolName: string;
  readonly date: string;
  readonly dayType: PlanDayType;
  readonly absentTeachers: readonly string[];
  readonly assignments: readonly MessageAssignment[];
}): string {
  const assignmentText = input.assignments.length
    ? input.assignments
        .map(
          (assignment) =>
            `• ${assignment.startTime}–${assignment.endTime}: ${assignment.description} (${assignment.absentTeacher}) — ${assignment.resolution}`,
        )
        .join('\n')
    : 'No Needs Sub Assignments.';
  const absentText = input.absentTeachers.length
    ? input.absentTeachers.join(', ')
    : 'None';
  return input.template
    .replaceAll('{{school_name}}', input.schoolName)
    .replaceAll('{{date}}', input.date)
    .replaceAll('{{day_type}}', input.dayType)
    .replaceAll('{{absent_teachers}}', absentText)
    .replaceAll(
      '{{assignments}}',
      `Absent: ${absentText}\n\n${assignmentText}`,
    );
}

function interval(start: string, end: string): TimeInterval {
  const parsedStart = parseLocalTime(start);
  const parsedEnd = parseLocalTime(end);
  if (parsedStart >= parsedEnd)
    throw new Error('A time interval must have start before end.');
  return { start: parsedStart, end: parsedEnd };
}

function minutesToLocalTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function roundBurden(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
