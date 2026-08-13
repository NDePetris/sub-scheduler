import { describe, expect, it } from 'vitest';

import {
  compareSchoolDates,
  localTimeToMinutes,
  parseLocalTime,
  parseSchoolDate,
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
});
