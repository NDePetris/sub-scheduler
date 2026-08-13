import { describe, expect, it } from 'vitest';

import { parseLocalTime } from '../../src/domain/calendar';
import {
  createTimeInterval,
  intervalDurationMinutes,
  intervalsOverlap,
  overlapMinutes,
} from '../../src/domain/interval';

const interval = (start: string, end: string) =>
  createTimeInterval(parseLocalTime(start), parseLocalTime(end));

describe('half-open time intervals', () => {
  it('does not overlap adjacent blocks', () => {
    expect(
      intervalsOverlap(interval('08:00', '08:50'), interval('08:50', '09:40')),
    ).toBe(false);
    expect(
      overlapMinutes(interval('08:00', '08:50'), interval('08:50', '09:40')),
    ).toBe(0);
  });

  it('calculates partial overlap in local minutes', () => {
    const first = interval('09:00', '09:50');
    const second = interval('09:40', '10:20');
    expect(intervalsOverlap(first, second)).toBe(true);
    expect(overlapMinutes(first, second)).toBe(10);
    expect(intervalDurationMinutes(second)).toBe(40);
  });

  it('requires start before end', () => {
    expect(() => interval('10:00', '10:00')).toThrow('start before end');
  });
});
