import { describe, expect, it } from 'vitest';

import { calendarConfigurationErrors } from '../../src/domain/calendar';

describe('calendar administration state validation', () => {
  it('accepts normal, blackout, no-school, and Special Schedule dates', () => {
    expect(
      calendarConfigurationErrors({
        expectedDayType: 'A',
        isSchoolDay: true,
        isBlackoutDay: false,
        expectsSpecialSchedule: false,
      }),
    ).toEqual([]);
    expect(
      calendarConfigurationErrors({
        expectedDayType: 'B',
        isSchoolDay: true,
        isBlackoutDay: true,
        expectsSpecialSchedule: false,
      }),
    ).toEqual([]);
    expect(
      calendarConfigurationErrors({
        expectedDayType: null,
        isSchoolDay: false,
        isBlackoutDay: false,
        expectsSpecialSchedule: false,
      }),
    ).toEqual([]);
    expect(
      calendarConfigurationErrors({
        expectedDayType: 'A',
        isSchoolDay: true,
        isBlackoutDay: false,
        expectsSpecialSchedule: true,
      }),
    ).toEqual([]);
  });

  it('rejects incoherent non-school configuration', () => {
    expect(
      calendarConfigurationErrors({
        expectedDayType: 'A',
        isSchoolDay: false,
        isBlackoutDay: true,
        expectsSpecialSchedule: true,
      }),
    ).toEqual([
      'Non-school dates cannot have an A/B designation.',
      'Non-school dates cannot be blackout days.',
      'Non-school dates cannot expect a Special Schedule.',
      'Blackout dates must be school days.',
    ]);
  });
});
