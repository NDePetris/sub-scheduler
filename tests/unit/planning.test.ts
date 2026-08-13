import { describe, expect, it } from 'vitest';

import {
  affectedResponsibilities,
  calculatePlanPeriodsLost,
  enumerateSchoolDates,
  projectedPlanPeriodsLost,
  rankCandidates,
  renderSubPlanMessage,
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

  it('expands inclusive multi-day absences as calendar dates', () => {
    expect(enumerateSchoolDates('2026-09-01', '2026-09-03')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('calculates the exact 1.25 Plan Period Equivalent example', () => {
    expect(
      calculatePlanPeriodsLost(
        [
          { startTime: '09:00', endTime: '09:40' },
          { startTime: '09:40', endTime: '10:20' },
        ],
        [{ startTime: '09:00', endTime: '09:50' }],
      ),
    ).toBe(1.25);
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

  it('orders defaults, School Sub, PLAN, Admin, and manual candidates deterministically', () => {
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
    ]);
    expect(result.map((candidate) => candidate.id)).toEqual([
      'default',
      'school',
      'plan-low',
      'plan-high',
      'admin',
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
