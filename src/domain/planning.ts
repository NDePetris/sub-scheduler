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

export interface AvailabilityScheduleEntry extends CoverageInterval {
  readonly activityType: string;
}

export type ScheduleAvailability =
  'plan' | 'admin' | 'open' | 'manual' | 'off_site';

export interface ScheduleAvailabilityResult<
  T extends AvailabilityScheduleEntry = AvailabilityScheduleEntry,
> {
  readonly availability: ScheduleAvailability;
  readonly conflictingEntries: readonly T[];
}

export function classifyScheduleAvailability<
  T extends AvailabilityScheduleEntry,
>(
  applicableEntries: readonly T[],
  coverage: CoverageInterval,
): ScheduleAvailabilityResult<T> {
  const required = interval(coverage.startTime, coverage.endTime);
  const overlappingEntries = applicableEntries.filter((entry) =>
    intervalsOverlap(interval(entry.startTime, entry.endTime), required),
  );
  const conflictingEntries = overlappingEntries.filter(
    (entry) => entry.activityType !== 'plan' && entry.activityType !== 'admin',
  );
  if (overlappingEntries.some((entry) => entry.activityType === 'off_site')) {
    return { availability: 'off_site', conflictingEntries };
  }
  if (
    coversTimeRange(
      overlappingEntries.filter((entry) => entry.activityType === 'plan'),
      coverage,
    )
  ) {
    return { availability: 'plan', conflictingEntries };
  }
  if (
    coversTimeRange(
      overlappingEntries.filter((entry) => entry.activityType === 'admin'),
      coverage,
    )
  ) {
    return { availability: 'admin', conflictingEntries };
  }
  if (applicableEntries.length > 0 && overlappingEntries.length === 0) {
    return { availability: 'open', conflictingEntries };
  }
  return { availability: 'manual', conflictingEntries };
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
  const intersections: Array<{ start: number; end: number }> = [];
  for (const planBlock of planBlocks) {
    const block = interval(planBlock.startTime, planBlock.endTime);
    for (const segment of coverage) {
      const covered = interval(segment.startTime, segment.endTime);
      const minutes = overlapMinutes(block, covered);
      if (minutes === 0) continue;
      intersections.push({
        start: Math.max(
          localTimeToMinutes(block.start),
          localTimeToMinutes(covered.start),
        ),
        end: Math.min(
          localTimeToMinutes(block.end),
          localTimeToMinutes(covered.end),
        ),
      });
    }
  }
  if (intersections.length === 0) return 0;
  if (!standardPeriodMinutes || standardPeriodMinutes <= 0) return null;
  const merged = mergeMinuteRanges(intersections);
  const totalMinutes = merged.reduce(
    (total, range) => total + range.end - range.start,
    0,
  );
  return roundBurden(totalMinutes / standardPeriodMinutes);
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

export function defaultSplitBoundary(
  parent: CoverageInterval,
  snapMinutes: number,
): string {
  const start = localTimeToMinutes(parseLocalTime(parent.startTime));
  const end = localTimeToMinutes(parseLocalTime(parent.endTime));
  const duration = end - start;
  if (duration < 2)
    throw new Error('Split coverage requires room for two segments.');
  if (duration === 50) return minutesToLocalTime(start + 40);
  const trailing = Math.max(1, snapMinutes);
  return minutesToLocalTime(
    start +
      (duration > trailing ? duration - trailing : Math.floor(duration / 2)),
  );
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
  readonly absentStaffId?: string;
  readonly description: string;
  readonly resolution: MessageResolution | string;
  readonly room?: string | null;
  readonly sharedResponsibilityKey?: string | null;
}

export type MessageResolution =
  | {
      readonly kind: 'direct';
      readonly staffName: string;
      readonly solo?: boolean;
    }
  | {
      readonly kind: 'split';
      readonly segments: readonly {
        readonly startTime: string;
        readonly endTime: string;
        readonly staffName: string;
      }[];
    }
  | { readonly kind: 'structured'; readonly text: string }
  | { readonly kind: 'unresolved'; readonly text: string };

export interface RenderedSubPlanMessage {
  readonly html: string;
  readonly text: string;
}

/** A deterministic, teacher-grouped projection of the structured Daily Sub Plan. */
export function renderRichSubPlanMessage(input: {
  readonly absentTeachers: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly assignments: readonly MessageAssignment[];
}): RenderedSubPlanMessage {
  const teachers = new Map<string, { id: string; name: string }>();
  for (const teacher of input.absentTeachers) teachers.set(teacher.id, teacher);
  for (const assignment of input.assignments) {
    const id = assignment.absentStaffId ?? assignment.absentTeacher;
    if (!teachers.has(id))
      teachers.set(id, { id, name: assignment.absentTeacher });
  }
  const seenShared = new Set<string>();
  const sections = [...teachers.values()].map((teacher) => {
    const lines = input.assignments
      .filter(
        (item) => (item.absentStaffId ?? item.absentTeacher) === teacher.id,
      )
      .filter((item) => {
        if (!item.sharedResponsibilityKey) return true;
        const key = item.sharedResponsibilityKey;
        if (seenShared.has(key)) return false;
        seenShared.add(key);
        return true;
      })
      .sort(
        (left, right) =>
          left.startTime.localeCompare(right.startTime) ||
          left.endTime.localeCompare(right.endTime),
      )
      .map(renderMessageLine);
    return { teacher, lines };
  });
  const html = [
    '<p>Hi all,</p>',
    ...sections.flatMap(({ teacher, lines }) => [
      `<p>${escapeHtml(teacher.name)} needs to be out today, and I'd like to use the following for their coverage:</p>`,
      lines.length
        ? `<ul>${lines.map((line) => `<li>${line.html}</li>`).join('')}</ul>`
        : '<p>No Needs Sub Assignments.</p>',
      `<p>${escapeHtml(teacher.name)} - you can reply all here to share plans.</p>`,
    ]),
  ].join('');
  const text = [
    'Hi all,',
    ...sections.flatMap(({ teacher, lines }) => [
      '',
      `${teacher.name} needs to be out today, and I'd like to use the following for their coverage:`,
      '',
      ...(lines.length
        ? lines.map((line) => `- ${line.text}`)
        : ['No Needs Sub Assignments.']),
      '',
      `${teacher.name} - you can reply all here to share plans.`,
    ]),
  ].join('\n');
  return { html, text };
}

export function renderSubPlanMessage(input: {
  readonly template: string;
  readonly schoolName: string;
  readonly date: string;
  readonly dayType: PlanDayType;
  readonly absentTeachers: readonly string[];
  readonly assignments: readonly MessageAssignment[];
}): string {
  return renderRichSubPlanMessage({
    absentTeachers: input.absentTeachers.map((name) => ({ id: name, name })),
    assignments: input.assignments.map((assignment) => ({
      ...assignment,
      resolution:
        typeof assignment.resolution === 'string'
          ? { kind: 'structured' as const, text: assignment.resolution }
          : assignment.resolution,
    })),
  }).text;
}

function renderMessageLine(assignment: MessageAssignment): {
  html: string;
  text: string;
} {
  const prefix = `${assignment.startTime}–${assignment.endTime} `;
  const room = assignment.room?.trim()
    ? ` in ${formatMessageRoom(assignment.room)}`
    : '';
  const resolution: MessageResolution =
    typeof assignment.resolution === 'string'
      ? { kind: 'structured', text: assignment.resolution }
      : assignment.resolution;
  if (resolution.kind === 'direct') {
    const name = `${resolution.staffName}${resolution.solo ? ' solo' : ''}`;
    return {
      html: `${escapeHtml(prefix)}<strong>${escapeHtml(name)}</strong> - ${escapeHtml(assignment.description + room)}`,
      text: `${prefix}${name} - ${assignment.description}${room}`,
    };
  }
  if (resolution.kind === 'split') {
    const rendered = [...resolution.segments]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(
        (segment) =>
          `${segment.staffName} ${segment.startTime}–${segment.endTime}`,
      )
      .join('; ');
    return {
      html: `${escapeHtml(prefix + rendered)} - ${escapeHtml(assignment.description + room)}`,
      text: `${prefix}${rendered} - ${assignment.description}${room}`,
    };
  }
  return {
    html: `${escapeHtml(prefix + resolution.text)} - ${escapeHtml(assignment.description + room)}`,
    text: `${prefix}${resolution.text} - ${assignment.description}${room}`,
  };
}

function formatMessageRoom(room: string): string {
  return /^room\b/i.test(room) ? room : `Room ${room}`;
}
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function interval(start: string, end: string): TimeInterval {
  const parsedStart = parseLocalTime(start);
  const parsedEnd = parseLocalTime(end);
  if (parsedStart >= parsedEnd)
    throw new Error('A time interval must have start before end.');
  return { start: parsedStart, end: parsedEnd };
}

function coversTimeRange(
  entries: readonly AvailabilityScheduleEntry[],
  coverage: CoverageInterval,
): boolean {
  const requiredStart = localTimeToMinutes(parseLocalTime(coverage.startTime));
  const requiredEnd = localTimeToMinutes(parseLocalTime(coverage.endTime));
  const ranges = mergeMinuteRanges(
    entries.map((entry) => ({
      start: localTimeToMinutes(parseLocalTime(entry.startTime)),
      end: localTimeToMinutes(parseLocalTime(entry.endTime)),
    })),
  );
  return ranges.some(
    (range) => range.start <= requiredStart && range.end >= requiredEnd,
  );
}

function mergeMinuteRanges(
  ranges: readonly { start: number; end: number }[],
): Array<{ start: number; end: number }> {
  const ordered = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else if (range.end > previous.end) {
      previous.end = range.end;
    }
  }
  return merged;
}

function minutesToLocalTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function roundBurden(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
