import { describe, expect, it } from 'vitest';

import {
  calendarCellSummary,
  monthForDate,
  normalizeCalendarInput,
  shiftMonth,
  visibleMonthDates,
} from '../../src/features/calendar/calendar-presentation';

describe('calendar month presentation', () => {
  it('builds a Sunday-to-Saturday leap-year February grid', () => {
    const cells = visibleMonthDates({ year: 2024, month: 2 });
    expect(cells).toHaveLength(35);
    expect(cells[0]?.date).toBe('2024-01-28');
    expect(cells.at(-1)?.date).toBe('2024-03-02');
    expect(cells.some((cell) => cell.date === '2024-02-29')).toBe(true);
  });

  it('keeps a Sunday-starting month aligned and supports six rows', () => {
    expect(visibleMonthDates({ year: 2023, month: 10 })[0]?.date).toBe(
      '2023-10-01',
    );
    expect(visibleMonthDates({ year: 2025, month: 3 })).toHaveLength(42);
  });

  it('rolls month navigation across years', () => {
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({
      year: 2026,
      month: 1,
    });
    expect(shiftMonth({ year: 2025, month: 1 }, -1)).toEqual({
      year: 2024,
      month: 12,
    });
    expect(monthForDate('2026-09-10')).toEqual({ year: 2026, month: 9 });
  });

  it('summarizes configured states and unconfigured dates accessibly', () => {
    expect(calendarCellSummary('2026-09-14', undefined)).toContain(
      'unconfigured',
    );
    expect(
      calendarCellSummary('2026-09-14', configured({ expectedDayType: 'A' })),
    ).toContain('A day');
    expect(
      calendarCellSummary('2026-09-14', configured({ expectedDayType: 'B' })),
    ).toContain('B day');
    expect(
      calendarCellSummary('2026-09-14', configured({ isSchoolDay: false })),
    ).toContain('No School');
    expect(
      calendarCellSummary('2026-09-14', configured({ isBlackoutDay: true })),
    ).toContain('Blackout');
    expect(
      calendarCellSummary(
        '2026-09-14',
        configured({ expectsSpecialSchedule: true }),
      ),
    ).toContain('Special Schedule expected');
  });

  it('clears incompatible values when a school day is turned off', () => {
    expect(
      normalizeCalendarInput({
        expectedDayType: 'A',
        isSchoolDay: false,
        isBlackoutDay: true,
        expectsSpecialSchedule: true,
        label: 'Closed',
      }),
    ).toMatchObject({
      expectedDayType: null,
      isBlackoutDay: false,
      expectsSpecialSchedule: false,
    });
  });
});

function configured(
  overrides: Partial<{
    expectedDayType: 'A' | 'B' | null;
    isSchoolDay: boolean;
    isBlackoutDay: boolean;
    expectsSpecialSchedule: boolean;
  }> = {},
) {
  return {
    date: '2026-09-14',
    expectedDayType: null,
    isSchoolDay: true,
    isBlackoutDay: false,
    expectsSpecialSchedule: false,
    label: null,
    sourceType: 'manual_admin',
    updatedAt: '2026-09-10T12:00:00.000Z',
    updatedBy: null,
    specialSchedule: null,
    specialScheduleExpectedWarning: false,
    ...overrides,
  };
}
