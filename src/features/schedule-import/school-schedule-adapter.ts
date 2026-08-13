import { parseLocalTime } from '../../domain/calendar';
import { createTimeInterval, intervalsOverlap } from '../../domain/interval';
import type { ScheduleDayType } from '../../domain/schedule';

import type {
  ImportIssue,
  SchoolScheduleAdapter,
  WorkbookCell,
  WorkbookSheet,
} from './types';

export type ImportedActivityType =
  | 'instruction'
  | 'plan'
  | 'admin'
  | 'lunch'
  | 'duty'
  | 'after_school'
  | 'other';

export type ImportedCategory =
  | 'PRI'
  | 'EL'
  | 'INT'
  | 'MS'
  | 'HS'
  | 'PLAN_ADMIN'
  | 'LUNCH'
  | 'AFTER_SCHOOL_OTHER';

export interface StagedScheduleEntry {
  readonly sourceSheet: string;
  readonly sourceCell: string;
  readonly staffDisplayValue: string;
  readonly roomDisplayValue: string | null;
  readonly dayType: ScheduleDayType;
  readonly startTime: string;
  readonly endTime: string;
  readonly activityType: ImportedActivityType;
  readonly category: ImportedCategory;
  readonly description: string;
  readonly requiresSub: boolean;
}

export interface SchoolScheduleCandidate {
  readonly sheetName: string;
  readonly staffDisplayValues: readonly string[];
  readonly roomDisplayValues: readonly string[];
  readonly aBDetected: boolean;
  readonly entries: readonly StagedScheduleEntry[];
}

const TARGET_SHEET = 'SY27 Teacher Schedules';
const FIRST_SCHEDULE_ROW = 4;

export const schoolScheduleAdapter: SchoolScheduleAdapter<SchoolScheduleCandidate> =
  {
    parse(workbook) {
      const issues: ImportIssue[] = [];
      const sheet =
        workbook.sheets.find((candidate) => candidate.name === TARGET_SHEET) ??
        workbook.sheets[0];

      if (!sheet) {
        return {
          candidate: null,
          issues: [
            {
              severity: 'error',
              code: 'missing_schedule_sheet',
              message: 'The workbook does not contain a schedule worksheet.',
            },
          ],
        };
      }

      if (sheet.name !== TARGET_SHEET) {
        issues.push({
          severity: 'warning',
          code: 'unexpected_sheet_name',
          message: `Expected “${TARGET_SHEET}”; interpreted “${sheet.name}” as the schedule worksheet.`,
          sheet: sheet.name,
        });
      }

      const entries = parseEntries(sheet, issues);
      if (entries.length === 0) {
        issues.push({
          severity: 'error',
          code: 'no_schedule_entries',
          message: 'No interpretable schedule blocks were found.',
          sheet: sheet.name,
        });
      }
      issues.push(...findConflicts(entries));

      const staffDisplayValues = uniqueSorted(
        entries.map((entry) => entry.staffDisplayValue),
      );
      const roomDisplayValues = uniqueSorted(
        entries.flatMap((entry) =>
          entry.roomDisplayValue ? [entry.roomDisplayValue] : [],
        ),
      );

      return {
        candidate: {
          sheetName: sheet.name,
          staffDisplayValues,
          roomDisplayValues,
          aBDetected: entries.some((entry) => entry.dayType !== 'ALL'),
          entries,
        },
        issues,
      };
    },
  };

function parseEntries(
  sheet: WorkbookSheet,
  issues: ImportIssue[],
): StagedScheduleEntry[] {
  const roomRow = sheet.rows[0] ?? [];
  const staffRow = sheet.rows[1] ?? [];
  const dayRow = sheet.rows[2] ?? [];
  const columns = Math.max(roomRow.length, staffRow.length, dayRow.length);
  const headers: Array<{
    column: number;
    staff: string;
    room: string | null;
    dayType: ScheduleDayType;
  }> = [];

  let previousStaff: string | null = null;
  let previousRoom: string | null = null;
  for (let column = 1; column < columns; column += 1) {
    const explicitStaff = cellText(staffRow[column]);
    const dayLabel = cellText(dayRow[column]);
    const explicitRoom = cellText(roomRow[column]);
    if (explicitStaff) previousStaff = explicitStaff;
    if (explicitRoom) previousRoom = explicitRoom;

    const pairedDay =
      dayLabel === 'A Day' ? 'A' : dayLabel === 'B Day' ? 'B' : null;
    const staff = explicitStaff ?? (pairedDay ? previousStaff : null);
    if (!staff) continue;

    headers.push({
      column,
      staff,
      room: explicitRoom ?? (pairedDay ? previousRoom : null),
      dayType: pairedDay ?? 'ALL',
    });
  }

  const mergedEnds = mergedRangeEnds(sheet.mergedCells);
  const entries: StagedScheduleEntry[] = [];
  for (
    let rowIndex = FIRST_SCHEDULE_ROW - 1;
    rowIndex < sheet.rows.length;
    rowIndex += 1
  ) {
    const row = sheet.rows[rowIndex] ?? [];
    const timeRange = parseTimeRange(cellText(row[0]));
    if (!timeRange) {
      if (row.some((cell, column) => column > 0 && cellText(cell))) {
        issues.push({
          severity: 'error',
          code: 'malformed_time_row',
          message:
            'Schedule content appears on a row without an interpretable time range.',
          sheet: sheet.name,
          row: rowIndex + 1,
          column: 1,
        });
      }
      continue;
    }

    for (const header of headers) {
      const description = cellText(row[header.column]);
      if (!description) continue;
      const sourceCell = `${columnName(header.column + 1)}${rowIndex + 1}`;
      const mergeEndRow = mergedEnds.get(sourceCell) ?? rowIndex + 1;
      const endingRow = sheet.rows[mergeEndRow - 1] ?? [];
      const endingRange = parseTimeRange(cellText(endingRow[0]));
      if (!endingRange) {
        issues.push({
          severity: 'error',
          code: 'malformed_block_range',
          message: `Could not determine the end time for “${description}”.`,
          sheet: sheet.name,
          row: rowIndex + 1,
          column: header.column + 1,
        });
        continue;
      }

      const classification = classifyActivity(description);
      entries.push({
        sourceSheet: sheet.name,
        sourceCell,
        staffDisplayValue: header.staff,
        roomDisplayValue: header.room,
        dayType: header.dayType,
        startTime: timeRange.start,
        endTime: endingRange.end,
        description,
        ...classification,
      });
    }
  }
  return entries;
}

function classifyActivity(description: string): {
  activityType: ImportedActivityType;
  category: ImportedCategory;
  requiresSub: boolean;
} {
  const normalized = description.trim().toLocaleLowerCase('en-US');
  if (normalized === 'plan') {
    return { activityType: 'plan', category: 'PLAN_ADMIN', requiresSub: false };
  }
  if (normalized.includes('admin')) {
    return {
      activityType: 'admin',
      category: 'PLAN_ADMIN',
      requiresSub: false,
    };
  }
  if (normalized.includes('lunch')) {
    return { activityType: 'lunch', category: 'LUNCH', requiresSub: true };
  }
  if (
    normalized.includes('after school') ||
    normalized.includes('after care')
  ) {
    return {
      activityType: 'after_school',
      category: 'AFTER_SCHOOL_OTHER',
      requiresSub: true,
    };
  }
  if (normalized.includes('duty')) {
    return {
      activityType: 'duty',
      category: 'AFTER_SCHOOL_OTHER',
      requiresSub: true,
    };
  }
  if (normalized.includes('break') || normalized === 'student support') {
    return {
      activityType: 'other',
      category: 'AFTER_SCHOOL_OTHER',
      requiresSub: false,
    };
  }

  const category = (['PRI', 'EL', 'INT', 'MS', 'HS'] as const).find((value) =>
    new RegExp(`(^|[^A-Z])${value}([^A-Z]|$)`).test(description.toUpperCase()),
  );
  return {
    activityType: 'instruction',
    category: category ?? 'AFTER_SCHOOL_OTHER',
    requiresSub: true,
  };
}

function findConflicts(entries: readonly StagedScheduleEntry[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex];
    if (!left) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      const right = entries[rightIndex];
      if (!right || left.staffDisplayValue !== right.staffDisplayValue)
        continue;
      const sharesDay =
        left.dayType === 'ALL' ||
        right.dayType === 'ALL' ||
        left.dayType === right.dayType;
      if (!sharesDay) continue;
      if (
        intervalsOverlap(
          createTimeInterval(
            parseLocalTime(left.startTime),
            parseLocalTime(left.endTime),
          ),
          createTimeInterval(
            parseLocalTime(right.startTime),
            parseLocalTime(right.endTime),
          ),
        )
      ) {
        issues.push({
          severity: 'error',
          code: 'overlapping_blocks',
          message: `${left.staffDisplayValue} has overlapping blocks at ${left.startTime}–${left.endTime} and ${right.startTime}–${right.endTime}.`,
          sheet: left.sourceSheet,
        });
      }
    }
  }
  return issues;
}

function parseTimeRange(
  value: string | null,
): { start: string; end: string } | null {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const start = schoolClock(Number(match[1]), Number(match[2]));
  const end = schoolClock(Number(match[3]), Number(match[4]));
  if (!start || !end) return null;
  return { start, end };
}

function schoolClock(hour: number, minute: number): string | null {
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  const normalizedHour = hour >= 1 && hour <= 4 ? hour + 12 : hour;
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function mergedRangeEnds(ranges: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const range of ranges) {
    const match = /^([A-Z]+\d+):[A-Z]+(\d+)$/.exec(range);
    if (match?.[1] && match[2]) result.set(match[1], Number(match[2]));
  }
  return result;
}

function cellText(value: WorkbookCell | undefined): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return null;
}

function columnName(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
