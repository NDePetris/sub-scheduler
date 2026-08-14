import { describe, expect, it } from 'vitest';

import {
  affectedResponsibilities,
  calculatePlanPeriodsLost,
  enumerateWeekdaySchoolDates,
  expectedDayType,
  inferStandardPeriodMinutes,
  projectedPlanPeriodsLost,
  rankCandidates,
  renderSubPlanMessage,
  resolveStandardPeriodMinutes,
  validateSplitSegments,
} from '../../src/domain/planning';

describe('MVP planning domain', () => {
  it('generates only the overlapping portion of a partial-day absence', () => {
    const result = affectedResponsibilities(
      [
        {
          id: 'before',
          dayType: 'B',
          startTime: '09:00',
          endTime: '10:00',
          requiresSub: true,
        },
        {
          id: 'partial',
          dayType: 'B',
          startTime: '10:00',
          endTime: '10:40',
          requiresSub: true,
        },
        {
          id: 'after',
          dayType: 'ALL',
          startTime: '13:30',
          endTime: '14:10',
          requiresSub: true,
        },
        {
          id: 'plan',
          dayType: 'B',
          startTime: '11:00',
          endTime: '11:40',
          requiresSub: false,
        },
      ],
      'B',
      { startTime: '10:20', endTime: '13:30' },
    );
    expect(result).toEqual([
      { sourceId: 'partial', startTime: '10:20', endTime: '10:40' },
    ]);
  });

  it('expands Monday through Friday as five weekday school dates', () => {
    expect(enumerateWeekdaySchoolDates('2026-11-02', '2026-11-06')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
  });

  it('skips weekends when expanding Friday through Monday', () => {
    expect(enumerateWeekdaySchoolDates('2026-11-06', '2026-11-09')).toEqual([
      '2026-11-06',
      '2026-11-09',
    ]);
  });

  it('handles same-day weekday and weekend ranges explicitly', () => {
    expect(enumerateWeekdaySchoolDates('2026-11-09', '2026-11-09')).toEqual([
      '2026-11-09',
    ]);
    expect(enumerateWeekdaySchoolDates('2026-11-14', '2026-11-14')).toEqual([]);
  });

  it('does not advance A/B rotation over a weekend', () => {
    expect(expectedDayType('2026-11-06', '2026-11-06')).toBe('A');
    expect(expectedDayType('2026-11-09', '2026-11-06')).toBe('B');
  });

  it('calculates the exact 1.25 Plan Period Equivalent example', () => {
    expect(
      calculatePlanPeriodsLost(
        [
          { startTime: '09:00', endTime: '09:40' },
          { startTime: '09:40', endTime: '10:20' },
        ],
        [{ startTime: '09:00', endTime: '09:50' }],
        40,
      ),
    ).toBe(1.25);
  });

  it.each([
    ['09:00', '09:20', 0.5],
    ['09:00', '09:40', 1],
    ['09:00', '09:50', 1.25],
    ['09:00', '10:20', 2],
  ])(
    'uses a 40-minute standard period for merged PLAN coverage %s–%s',
    (startTime, endTime, expected) => {
      expect(
        calculatePlanPeriodsLost(
          [{ startTime: '09:00', endTime: '10:20' }],
          [{ startTime, endTime }],
          40,
        ),
      ).toBe(expected);
    },
  );

  it.each([
    ['09:00', '09:25', 0.5],
    ['09:00', '09:50', 1],
    ['09:00', '10:20', 1.6],
  ])(
    'uses a 50-minute standard period for PLAN coverage %s–%s',
    (startTime, endTime, expected) => {
      expect(
        calculatePlanPeriodsLost(
          [{ startTime: '09:00', endTime: '10:20' }],
          [{ startTime, endTime }],
          50,
        ),
      ).toBe(expected);
    },
  );

  it('infers the most common instructional duration and ignores non-instructional blocks', () => {
    const entries = [
      {
        dayType: 'ALL' as const,
        startTime: '08:00',
        endTime: '08:40',
        activityType: 'instruction',
      },
      {
        dayType: 'A' as const,
        startTime: '08:40',
        endTime: '09:20',
        activityType: 'instruction',
      },
      {
        dayType: 'A' as const,
        startTime: '09:20',
        endTime: '10:40',
        activityType: 'plan',
      },
      {
        dayType: 'A' as const,
        startTime: '11:00',
        endTime: '11:50',
        activityType: 'instruction',
      },
    ];
    expect(inferStandardPeriodMinutes(entries, 'A')).toBe(40);
    expect(inferStandardPeriodMinutes(entries, 'B')).toBe(40);
  });

  it('infers 50-minute schedules and lets explicit configuration override Auto', () => {
    const entries = [
      {
        dayType: 'ALL' as const,
        startTime: '08:00',
        endTime: '08:50',
        activityType: 'instruction',
      },
      {
        dayType: 'ALL' as const,
        startTime: '09:00',
        endTime: '09:50',
        activityType: 'instruction',
      },
      {
        dayType: 'ALL' as const,
        startTime: '10:00',
        endTime: '11:20',
        activityType: 'plan',
      },
    ];
    expect(inferStandardPeriodMinutes(entries, 'A')).toBe(50);
    expect(
      resolveStandardPeriodMinutes({
        configuredMinutes: 40,
        dayType: 'A',
        normalEntries: entries,
      }),
    ).toBe(40);
  });

  it('uses the shorter supported duration when 40 and 50 evidence tie', () => {
    expect(
      inferStandardPeriodMinutes(
        [
          {
            dayType: 'ALL',
            startTime: '08:00',
            endTime: '08:50',
            activityType: 'instruction',
          },
          {
            dayType: 'ALL',
            startTime: '09:00',
            endTime: '09:40',
            activityType: 'instruction',
          },
        ],
        'A',
      ),
    ).toBe(40);
  });

  it('ignores merged instructional blocks and never falls back to merged PLAN for Auto', () => {
    const mergedEntries = [
      {
        dayType: 'ALL' as const,
        startTime: '08:00',
        endTime: '09:20',
        activityType: 'instruction',
      },
      {
        dayType: 'ALL' as const,
        startTime: '09:30',
        endTime: '11:10',
        activityType: 'instruction',
      },
    ];
    expect(inferStandardPeriodMinutes(mergedEntries, 'A')).toBeNull();
    expect(
      resolveStandardPeriodMinutes({
        configuredMinutes: null,
        dayType: 'A',
        normalEntries: mergedEntries,
        applicableEntries: mergedEntries,
      }),
    ).toBeNull();
    expect(
      calculatePlanPeriodsLost(
        [{ startTime: '09:00', endTime: '10:20' }],
        [{ startTime: '09:00', endTime: '09:40' }],
        null,
      ),
    ).toBeNull();
  });

  it('uses supported 40-minute evidence despite common merged instruction blocks', () => {
    const entries = [
      {
        dayType: 'ALL' as const,
        startTime: '08:00',
        endTime: '09:20',
        activityType: 'instruction',
      },
      {
        dayType: 'ALL' as const,
        startTime: '09:30',
        endTime: '11:10',
        activityType: 'instruction',
      },
      {
        dayType: 'ALL' as const,
        startTime: '13:30',
        endTime: '14:10',
        activityType: 'instruction',
      },
    ];
    expect(inferStandardPeriodMinutes(entries, 'A')).toBe(40);
    expect(
      calculatePlanPeriodsLost(
        [{ startTime: '11:30', endTime: '12:50' }],
        [{ startTime: '11:30', endTime: '12:10' }],
        inferStandardPeriodMinutes(entries, 'A'),
      ),
    ).toBe(1);
  });

  it('previews a configured threshold crossing before assignment', () => {
    expect(projectedPlanPeriodsLost(4.75, 0.5)).toBe(5.25);
  });

  it('validates a 40/10 split and rejects gaps', () => {
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:40' },
        { staffId: 'b', startTime: '09:40', endTime: '09:50' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:30' },
        { staffId: 'b', startTime: '09:40', endTime: '09:50' },
      ]),
    ).toThrow('without gaps or overlaps');
  });

  it('orders Default, School Sub, one shared automatic tier, and manual candidates deterministically', () => {
    const result = rankCandidates([
      {
        id: 'manual',
        displayName: 'Manual',
        availability: 'manual',
        currentBurden: 0,
      },
      {
        id: 'plan-high',
        displayName: 'Plan High',
        availability: 'plan',
        currentBurden: 4.75,
      },
      {
        id: 'school',
        displayName: 'School Sub',
        availability: 'school_sub',
        currentBurden: 0,
      },
      {
        id: 'school-conflict',
        displayName: 'Unavailable School Sub',
        availability: 'school_sub',
        currentBurden: 0,
        conflicts: ['Absent'],
      },
      {
        id: 'plan-low',
        displayName: 'Plan Low',
        availability: 'plan',
        currentBurden: 1.5,
      },
      {
        id: 'default',
        displayName: 'Default',
        availability: 'default',
        currentBurden: 9,
      },
      {
        id: 'admin',
        displayName: 'Admin',
        availability: 'admin',
        currentBurden: 0,
      },
      {
        id: 'open',
        displayName: 'Open',
        availability: 'open',
        currentBurden: 0.25,
      },
      {
        id: 'unknown',
        displayName: 'Unknown',
        availability: 'plan',
        currentBurden: 0,
        workloadKnown: false,
      },
    ]);
    expect(result.map((candidate) => candidate.id)).toEqual([
      'default',
      'school',
      'admin',
      'open',
      'plan-low',
      'plan-high',
      'unknown',
      'school-conflict',
      'manual',
    ]);
  });

  it('renders a deterministic message from structured data', () => {
    expect(
      renderSubPlanMessage({
        template: '{{school_name}} — {{date}} ({{day_type}})\n{{assignments}}',
        schoolName: 'Fictional Academy',
        date: '2026-09-01',
        dayType: 'B',
        absentTeachers: ['Avery Bennett'],
        assignments: [
          {
            startTime: '08:50',
            endTime: '09:40',
            absentTeacher: 'Avery Bennett',
            description: 'Primary Literacy',
            resolution: 'Morgan Ellis',
          },
        ],
      }),
    ).toContain('Primary Literacy (Avery Bennett) — Morgan Ellis');
  });
});
