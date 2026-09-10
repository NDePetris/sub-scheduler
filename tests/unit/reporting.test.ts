import { describe, expect, it } from 'vitest';

import {
  mergedMinutes,
  projectTeacherPerformance,
  projectTeacherPerformanceDetail,
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

  it('projects auditable detail with unique absence and coverage minutes', () => {
    const value = projectTeacherPerformanceDetail({
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      teacher: { ...teacher, standardPeriodMinutes: 40 },
      calendarDates: [
        {
          date: '2026-11-02',
          isSchoolDay: true,
          isBlackoutDay: false,
          label: 'Regular day',
        },
        {
          date: '2026-11-03',
          isSchoolDay: true,
          isBlackoutDay: true,
          label: 'Blackout day',
        },
      ],
      absences: [
        {
          staffId: teacher.id,
          startDate: '2026-11-02',
          endDate: '2026-11-03',
          startTime: null,
          endTime: null,
        },
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
          startTime: '08:30',
          endTime: '09:30',
        },
      ],
      coverage: [
        coverageFact('direct', null, '10:00', '10:50'),
        coverageFact('overlap', null, '10:20', '10:40'),
        coverageFact('split', 'split-segment', '11:00', '11:30'),
      ],
      scheduleEntries: [
        {
          sourceType: 'normal',
          sourceId: 'normal-fall',
          staffId: teacher.id,
          dayType: 'A',
          startTime: '10:00',
          endTime: '10:50',
          activityType: 'plan',
        },
      ],
    });

    expect(value.absenceSummary).toEqual({
      absences: 2,
      regularFullDayAbsences: 1,
      blackoutDays: 1,
      partialAbsences: 1,
      partialAbsenceMinutes: 90,
    });
    expect(value.absenceDetails.fullDayAbsences[1]).toMatchObject({
      date: '2026-11-03',
      isBlackoutDay: true,
      calendarLabel: 'Blackout day',
    });
    expect(value.coverageSummary).toEqual({
      coverageMinutes: 80,
      coverageSegments: 3,
      coveragePeriodEquivalents: 2,
      planPeriodsLost: 1.25,
    });
    expect(value.coverageDetails[0]).toMatchObject({
      coverageMinutes: 80,
      coverageSegments: 3,
      coveragePeriodEquivalents: 2,
      planPeriodsLost: 1.25,
      standardPeriodSource: 'configured',
    });
  });

  it('uses pinned normal context before special entries and represents mixed denominators', () => {
    const value = projectTeacherPerformanceDetail({
      startDate: '2026-11-02',
      endDate: '2026-11-03',
      teacher,
      calendarDates: [],
      absences: [],
      coverage: [
        coverageFact(
          'special-one',
          null,
          '10:00',
          '10:40',
          '2026-11-02',
          'normal-40',
          'special-day',
        ),
        coverageFact(
          'normal-two',
          null,
          '10:00',
          '10:50',
          '2026-11-03',
          'normal-50',
        ),
      ],
      scheduleEntries: [
        scheduleEntry('normal', 'normal-40', '10:00', '10:40', 'instruction'),
        scheduleEntry('special', 'special-day', '10:00', '10:40', 'plan'),
        scheduleEntry('normal', 'normal-50', '10:00', '10:50', 'instruction'),
      ],
    });

    expect(
      value.coverageDetails.map((item) => item.standardPeriodMinutes),
    ).toEqual([40, 50]);
    expect(value.coverageSummary.coveragePeriodEquivalents).toBe(2);
    expect(value.coverageSummary.planPeriodsLost).toBe(1);
    expect(value.teacher).toMatchObject({
      standardPeriodMinutes: null,
      standardPeriodSource: 'mixed',
    });
  });
});

function coverageFact(
  assignmentId: string,
  segmentId: string | null,
  startTime: string,
  endTime: string,
  date = '2026-11-02',
  scheduleVersionId = 'normal-fall',
  specialScheduleId: string | null = null,
) {
  return {
    staffId: teacher.id,
    date,
    startTime,
    endTime,
    assignmentId,
    segmentId,
    dayType: 'A' as const,
    scheduleVersionId,
    specialScheduleId,
    responsibilityType: 'instruction',
    description: assignmentId,
    absentStaffId: 'absent-staff',
    absentStaffName: 'Absent Staff',
    resolutionType: segmentId ? 'split_coverage' : 'teacher_cover',
  };
}

function scheduleEntry(
  sourceType: 'normal' | 'special',
  sourceId: string,
  startTime: string,
  endTime: string,
  activityType: string,
) {
  return {
    sourceType,
    sourceId,
    staffId: teacher.id,
    dayType: 'A' as const,
    startTime,
    endTime,
    activityType,
  };
}
