import { describe, expect, it } from 'vitest';

import {
  mergedMinutes,
  projectTeacherPerformance,
  type ReportingAbsence,
  type ReportingCalendarDate,
  type ReportingCoverageInterval,
  type ReportingStaff,
} from '../../src/domain/reporting';
import { schoolDateInTimezone } from '../../src/domain/calendar';

const teacher = {
  id: 'teacher_ada',
  displayName: 'Ada Teacher',
  role: 'teacher',
  isActive: true,
  isSchoolSub: false,
} as const;

function report(input: {
  readonly calendarDates?: readonly ReportingCalendarDate[];
  readonly absences?: readonly ReportingAbsence[];
  readonly coverage?: readonly ReportingCoverageInterval[];
  readonly staff?: readonly ReportingStaff[];
}) {
  return projectTeacherPerformance({
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    staff: input.staff ?? [teacher],
    calendarDates: input.calendarDates ?? [],
    absences: input.absences ?? [],
    coverage: input.coverage ?? [],
  });
}

describe('teacher performance reporting projections', () => {
  it('expands full-day absences by school date and reconciles blackout dates', () => {
    const value = report({
      calendarDates: [
        { date: '2026-11-02', isSchoolDay: true, isBlackoutDay: false },
        { date: '2026-11-03', isSchoolDay: true, isBlackoutDay: true },
        { date: '2026-11-04', isSchoolDay: false, isBlackoutDay: false },
        { date: '2026-11-05', isSchoolDay: true, isBlackoutDay: false },
        { date: '2026-11-06', isSchoolDay: true, isBlackoutDay: false },
      ],
      absences: [
        {
          staffId: teacher.id,
          startDate: '2026-10-31',
          endDate: '2026-11-05',
          startTime: null,
          endTime: null,
        },
      ],
    });

    expect(value.calendar).toEqual({ complete: true, missingWeekdayDates: 0 });
    expect(value.teachers[0]).toMatchObject({
      absences: 3,
      blackoutDays: 1,
      partialAbsences: 0,
    });
  });

  it('counts a partial absence date once and respects explicit non-school dates', () => {
    const value = report({
      calendarDates: [
        { date: '2026-11-02', isSchoolDay: true, isBlackoutDay: false },
        { date: '2026-11-03', isSchoolDay: false, isBlackoutDay: false },
      ],
      absences: [
        {
          staffId: teacher.id,
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          startTime: '08:00',
          endTime: '09:00',
        },
        {
          staffId: teacher.id,
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          startTime: '09:00',
          endTime: '10:00',
        },
        {
          staffId: teacher.id,
          startDate: '2026-11-03',
          endDate: '2026-11-03',
          startTime: '08:00',
          endTime: '09:00',
        },
      ],
    });

    expect(value.teachers[0]?.partialAbsences).toBe(1);
    expect(value.calendar).toEqual({ complete: false, missingWeekdayDates: 3 });
  });

  it('uses weekday fallback only when calendar metadata is missing', () => {
    expect(report({}).calendar).toEqual({
      complete: false,
      missingWeekdayDates: 5,
    });
    expect(
      report({
        calendarDates: [
          { date: '2026-11-02', isSchoolDay: true, isBlackoutDay: false },
          { date: '2026-11-03', isSchoolDay: true, isBlackoutDay: false },
          { date: '2026-11-04', isSchoolDay: true, isBlackoutDay: false },
          { date: '2026-11-05', isSchoolDay: true, isBlackoutDay: false },
          { date: '2026-11-06', isSchoolDay: true, isBlackoutDay: false },
        ],
      }).calendar,
    ).toEqual({ complete: true, missingWeekdayDates: 0 });
  });

  it('unions overlapping coverage per teacher/date and retains separate intervals', () => {
    expect(
      mergedMinutes([
        { startTime: '10:00', endTime: '10:50' },
        { startTime: '10:20', endTime: '10:40' },
        { startTime: '11:00', endTime: '11:30' },
      ]),
    ).toBe(80);
    const value = report({
      coverage: [
        {
          staffId: teacher.id,
          date: '2026-11-02',
          startTime: '10:00',
          endTime: '10:50',
        },
        {
          staffId: teacher.id,
          date: '2026-11-02',
          startTime: '10:20',
          endTime: '10:40',
        },
        {
          staffId: teacher.id,
          date: '2026-11-03',
          startTime: '11:00',
          endTime: '11:30',
        },
        {
          staffId: teacher.id,
          date: '2026-11-10',
          startTime: '08:00',
          endTime: '09:00',
        },
      ],
    });
    expect(value.teachers[0]?.coverageMinutes).toBe(80);
  });

  it('includes inactive teachers with zero activity and excludes School Subs and non-teachers', () => {
    const inactiveTeacher = {
      ...teacher,
      id: 'teacher_inactive',
      displayName: 'Inactive Teacher',
      isActive: false,
    };
    const value = report({
      staff: [
        teacher,
        inactiveTeacher,
        { ...teacher, id: 'school_sub', isSchoolSub: true },
        { ...teacher, id: 'administrator', role: 'administrator' },
      ],
    });

    expect(value.teachers).toEqual([
      expect.objectContaining({ staffId: teacher.id, isActive: true }),
      expect.objectContaining({ staffId: inactiveTeacher.id, isActive: false }),
    ]);
  });

  it('derives the report date from the school timezone, not UTC', () => {
    expect(
      schoolDateInTimezone(
        new Date('2026-11-03T03:30:00.000Z'),
        'America/Chicago',
      ),
    ).toBe('2026-11-02');
  });
});
