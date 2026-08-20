import { describe, expect, it } from 'vitest';

import {
  compareSchoolDates,
  calendarExpectedDayType,
  isSchoolDay,
  localTimeToMinutes,
  normalizeToSchoolDay,
  parseLocalTime,
  parseSchoolDate,
  shiftSchoolDay,
} from '../../src/domain/calendar';

describe('school calendar values', () => {
  it('keeps date-only values as validated local calendar strings', () => {
    const date = parseSchoolDate('2028-02-29');
    expect(date).toBe('2028-02-29');
    expect(
      compareSchoolDates(date, parseSchoolDate('2028-03-01')),
    ).toBeLessThan(0);
  });

  it('rejects impossible dates without relying on the runtime timezone', () => {
    expect(() => parseSchoolDate('2027-02-29')).toThrow('valid calendar date');
    expect(() => parseSchoolDate('08/12/2026')).toThrow('YYYY-MM-DD');
  });

  it('normalizes local wall-clock times to minutes', () => {
    expect(localTimeToMinutes(parseLocalTime('09:40'))).toBe(580);
    expect(() => parseLocalTime('24:00')).toThrow('outside');
    expect(() => parseLocalTime('9:40')).toThrow('HH:MM');
  });

  it('centralizes weekday navigation and weekend normalization', () => {
    expect(isSchoolDay('2026-11-06')).toBe(true);
    expect(isSchoolDay('2026-11-07')).toBe(false);
    expect(shiftSchoolDay('2026-11-06', 1)).toBe('2026-11-09');
    expect(shiftSchoolDay('2026-11-09', -1)).toBe('2026-11-06');
    expect(normalizeToSchoolDay('2026-11-14')).toBe('2026-11-16');
  });

  it('uses imported calendar A/B metadata ahead of rotation fallback', () => {
    expect(calendarExpectedDayType({ expectedDayType: 'B' }, 'A')).toBe('B');
    expect(calendarExpectedDayType(null, 'A')).toBe('A');
  });
});
