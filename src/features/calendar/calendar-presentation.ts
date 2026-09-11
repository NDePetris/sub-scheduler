import type { CalendarAdministrationDate, CalendarDateData } from '@/lib/api';

export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

export interface CalendarCell {
  readonly date: string;
  readonly inMonth: boolean;
  readonly weekend: boolean;
}

export function monthForDate(date: string): CalendarMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function shiftMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const date = new Date(Date.UTC(month.year, month.month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function visibleMonthDates(
  month: CalendarMonth,
): readonly CalendarCell[] {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const last = new Date(Date.UTC(month.year, month.month, 0));
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const cells: CalendarCell[] = [];
  for (
    const current = new Date(start);
    current <= end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const date = current.toISOString().slice(0, 10);
    cells.push({
      date,
      inMonth: current.getUTCMonth() + 1 === month.month,
      weekend: current.getUTCDay() === 0 || current.getUTCDay() === 6,
    });
  }
  return cells;
}

export function calendarCellSummary(
  date: string,
  configured: CalendarAdministrationDate | undefined,
): string {
  const formatted = formatCalendarDate(date);
  if (!configured) return `${formatted}, unconfigured`;
  const facts = [
    configured.expectedDayType ? `${configured.expectedDayType} day` : null,
    !configured.isSchoolDay ? 'No School' : null,
    configured.isBlackoutDay ? 'Blackout' : null,
    configured.expectsSpecialSchedule ? 'Special Schedule expected' : null,
    configured.label,
  ].filter(Boolean);
  return [formatted, ...facts].join(', ');
}

export function normalizeCalendarInput(
  input: Omit<CalendarDateData, 'date'>,
): Omit<CalendarDateData, 'date'> {
  if (input.isSchoolDay) return input;
  return {
    ...input,
    expectedDayType: null,
    isBlackoutDay: false,
    expectsSpecialSchedule: false,
  };
}

export function emptyCalendarInput(): Omit<CalendarDateData, 'date'> {
  return {
    expectedDayType: null,
    isSchoolDay: true,
    isBlackoutDay: false,
    expectsSpecialSchedule: false,
    label: null,
  };
}

export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)));
}

export function formatMonth(month: CalendarMonth): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}

export function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
