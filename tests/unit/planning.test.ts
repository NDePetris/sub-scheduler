import { describe, expect, it } from 'vitest';

import {
  affectedResponsibilities,
  calculatePlanPeriodsLost,
  classifyScheduleAvailability,
  defaultSplitBoundary,
  enumerateWeekdaySchoolDates,
  expectedDayType,
  inferStandardPeriodMinutes,
  projectedPlanPeriodsLost,
  rankCandidates,
  renderSubPlanMessage,
  renderRichSubPlanMessage,
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

  it('counts unique PLAN minutes when schedule blocks or coverage overlap', () => {
    expect(
      calculatePlanPeriodsLost(
        [
          { startTime: '09:00', endTime: '09:40' },
          { startTime: '09:20', endTime: '10:00' },
        ],
        [
          { startTime: '09:00', endTime: '09:40' },
          { startTime: '09:20', endTime: '10:00' },
        ],
        40,
      ),
    ).toBe(1.5);
  });

  it('classifies exact-range schedule availability from one shared rule', () => {
    const entries = [
      {
        startTime: '09:00',
        endTime: '09:40',
        activityType: 'plan',
        description: 'PLAN',
      },
      {
        startTime: '10:00',
        endTime: '10:40',
        activityType: 'instruction',
        description: 'Class',
      },
    ];
    expect(
      classifyScheduleAvailability(entries, {
        startTime: '09:00',
        endTime: '09:40',
      }),
    ).toMatchObject({ availability: 'plan', conflictingEntries: [] });
    expect(
      classifyScheduleAvailability(entries, {
        startTime: '09:40',
        endTime: '10:00',
      }),
    ).toMatchObject({ availability: 'open', conflictingEntries: [] });
    expect(
      classifyScheduleAvailability(entries, {
        startTime: '10:00',
        endTime: '10:20',
      }),
    ).toMatchObject({
      availability: 'manual',
      conflictingEntries: [expect.objectContaining({ description: 'Class' })],
    });
  });

  it('treats an explicit Off-site block as unavailable before open-gap inference', () => {
    const result = classifyScheduleAvailability(
      [{ startTime: '09:00', endTime: '10:00', activityType: 'off_site' }],
      { startTime: '09:20', endTime: '09:40' },
    );
    expect(result).toMatchObject({ availability: 'off_site' });
    expect(result.conflictingEntries).toHaveLength(1);
  });

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

  it('validates two- and three-segment splits', () => {
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:40' },
        { staffId: 'b', startTime: '09:40', endTime: '09:50' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:30' },
        { staffId: 'b', startTime: '09:30', endTime: '09:50' },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:20' },
        { staffId: 'b', startTime: '09:20', endTime: '09:40' },
        { staffId: 'c', startTime: '09:40', endTime: '09:50' },
      ]),
    ).not.toThrow();
  });

  it('chooses deterministic configured-snap defaults with the common 40/10 case', () => {
    expect(
      defaultSplitBoundary({ startTime: '09:00', endTime: '09:50' }, 10),
    ).toBe('09:40');
    expect(
      defaultSplitBoundary({ startTime: '09:00', endTime: '09:40' }, 10),
    ).toBe('09:30');
    expect(
      defaultSplitBoundary({ startTime: '09:03', endTime: '09:12' }, 10),
    ).toBe('09:07');
  });

  it('rejects invalid split structure', () => {
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:30' },
        { staffId: 'b', startTime: '09:40', endTime: '09:50' },
      ]),
    ).toThrow('without gaps or overlaps');
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:30' },
        { staffId: 'b', startTime: '09:20', endTime: '09:50' },
      ]),
    ).toThrow('without gaps or overlaps');
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:00' },
        { staffId: 'b', startTime: '09:00', endTime: '09:50' },
      ]),
    ).toThrow('start before end');
    expect(() =>
      validateSplitSegments({ startTime: '09:00', endTime: '09:50' }, [
        { staffId: 'a', startTime: '09:00', endTime: '09:50' },
      ]),
    ).toThrow('at least two');
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
    ).toContain('Avery Bennett needs to be out today');
  });

  it('projects grouped rich message sections with solo, rooms, splits, and shared-duty deduplication', () => {
    const rendered = renderRichSubPlanMessage({
      absentTeachers: [
        { id: 'avery', name: 'Avery Bennett' },
        { id: 'blair', name: 'Blair Chen' },
      ],
      assignments: [
        {
          absentStaffId: 'avery',
          absentTeacher: 'Avery Bennett',
          startTime: '11:20',
          endTime: '12:00',
          description: 'MS Lunch',
          room: '16',
          sharedResponsibilityKey: 'lunch',
          resolution: { kind: 'direct', staffName: 'Jane Smith', solo: true },
        },
        {
          absentStaffId: 'blair',
          absentTeacher: 'Blair Chen',
          startTime: '11:20',
          endTime: '12:00',
          description: 'MS Lunch',
          room: '16',
          sharedResponsibilityKey: 'lunch',
          resolution: { kind: 'direct', staffName: 'Jane Smith', solo: true },
        },
        {
          absentStaffId: 'avery',
          absentTeacher: 'Avery Bennett',
          startTime: '09:00',
          endTime: '09:50',
          description: 'EL Math',
          room: null,
          resolution: {
            kind: 'split',
            segments: [
              { staffName: 'Teacher B', startTime: '09:40', endTime: '09:50' },
              { staffName: 'Teacher A', startTime: '09:00', endTime: '09:40' },
            ],
          },
        },
      ],
    });
    expect(rendered.html).toContain('<strong>Jane Smith solo</strong>');
    expect(rendered.text).toContain('Jane Smith solo - MS Lunch in Room 16');
    expect(rendered.text).toContain(
      'Teacher A 09:00–09:40; Teacher B 09:40–09:50',
    );
    expect(rendered.text.match(/MS Lunch/g)).toHaveLength(1);
    expect(rendered.text.indexOf('EL Math')).toBeLessThan(
      rendered.text.indexOf('MS Lunch'),
    );
    expect(rendered.text.indexOf('Blair Chen needs')).toBeGreaterThan(
      rendered.text.indexOf('Avery Bennett - you'),
    );
  });
});
