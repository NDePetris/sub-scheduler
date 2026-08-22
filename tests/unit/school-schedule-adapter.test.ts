import { describe, expect, it } from 'vitest';

import { schoolScheduleAdapter } from '../../src/features/schedule-import/school-schedule-adapter';

describe('sanitized school schedule adapter', () => {
  it('interprets the representative merged-cell timetable', () => {
    const result = schoolScheduleAdapter.parse({
      sheets: [
        {
          name: 'SY27 Teacher Schedules',
          mergedCells: [],
          rows: [
            [null, '18', 'Art', 'Art'],
            [null, 'Primary Teacher', 'Art Teacher', null],
            [null, null, 'A Day', 'B Day'],
            ['8:00 - 9:00', 'PRI Circle', null, null],
            ['9:20 - 10:00', null, 'MS + HS Art', null],
            ['10:40 - 11:20', null, null, 'EL Art'],
          ],
        },
      ],
    });

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual(
      [],
    );
    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.sheetName).toBe('SY27 Teacher Schedules');
    expect(result.candidate?.staffDisplayValues).toHaveLength(2);
    expect(result.candidate?.roomDisplayValues).toHaveLength(2);
    expect(result.candidate?.aBDetected).toBe(true);
    expect(result.candidate?.entries).toHaveLength(3);
    expect(result.candidate?.entries).toContainEqual(
      expect.objectContaining({
        sourceCell: 'B4',
        staffDisplayValue: 'Primary Teacher',
        roomDisplayValue: '18',
        dayType: 'ALL',
        startTime: '08:00',
        endTime: '09:00',
        description: 'PRI Circle',
        activityType: 'instruction',
      }),
    );
    expect(result.candidate?.entries).toContainEqual(
      expect.objectContaining({
        staffDisplayValue: 'Art Teacher',
        dayType: 'A',
        startTime: '09:20',
        endTime: '10:00',
        description: 'MS + HS Art',
      }),
    );
    expect(result.candidate?.entries).toContainEqual(
      expect.objectContaining({
        staffDisplayValue: 'Art Teacher',
        dayType: 'B',
        startTime: '10:40',
        endTime: '11:20',
        description: 'EL Art',
      }),
    );
  });

  it('classifies Break as coverable duty without matching Breakfast', () => {
    const result = schoolScheduleAdapter.parse({
      sheets: [
        {
          name: 'SY27 Teacher Schedules',
          mergedCells: [],
          rows: [
            [null, '101'],
            [null, 'Test Teacher'],
            [null, null],
            ['8:00 - 8:10', 'Break'],
            ['8:10 - 8:20', '10 Minute Break'],
            ['8:20 - 8:30', 'Morning Break'],
            ['8:30 - 8:40', 'Breakfast'],
            ['8:40 - 8:50', 'Student Support'],
          ],
        },
      ],
    });
    const byDescription = new Map(
      result.candidate?.entries.map((entry) => [entry.description, entry]),
    );
    for (const label of ['Break', '10 Minute Break', 'Morning Break']) {
      expect(byDescription.get(label)).toMatchObject({
        activityType: 'duty',
        requiresSub: true,
        category: 'AFTER_SCHOOL_OTHER',
      });
    }
    expect(byDescription.get('Breakfast')?.activityType).not.toBe('duty');
    expect(byDescription.get('Student Support')).toMatchObject({
      activityType: 'other',
      requiresSub: false,
    });
  });

  it('recognizes Off-site and conservative trailing room identifiers', () => {
    const result = schoolScheduleAdapter.parse({
      sheets: [
        {
          name: 'SY27 Teacher Schedules',
          mergedCells: [],
          rows: [
            [null, null],
            [null, 'Test Teacher'],
            [null, null],
            ['8:00 - 8:30', 'MS Lunch (16)'],
            ['8:30 - 9:00', 'Off-site'],
            ['9:00 - 9:30', 'Advisory (special rotation)'],
          ],
        },
      ],
    });
    expect(result.candidate?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'MS Lunch',
          roomDisplayValue: '16',
          activityType: 'lunch',
        }),
        expect.objectContaining({
          description: 'Off-site',
          activityType: 'off_site',
          requiresSub: false,
        }),
        expect.objectContaining({
          description: 'Advisory (special rotation)',
          roomDisplayValue: null,
        }),
      ]),
    );
  });

  it('uses a valid block room ahead of the teacher home room', () => {
    const result = schoolScheduleAdapter.parse({
      sheets: [
        {
          name: 'SY27 Teacher Schedules',
          mergedCells: [],
          rows: [
            [null, 'P1'],
            [null, 'Test Teacher'],
            [null, null],
            ['8:00 - 8:30', 'EL Lunch (21)'],
            ['8:30 - 9:00', 'Advisory (special rotation)'],
            ['9:00 - 9:30', 'EL Reading (203A)'],
            ['9:30 - 10:00', 'EL Math (P1)'],
            ['10:00 - 10:30', 'EL Science (A-12)'],
          ],
        },
      ],
    });

    expect(result.candidate?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'EL Lunch',
          roomDisplayValue: '21',
        }),
        expect.objectContaining({
          description: 'Advisory (special rotation)',
          roomDisplayValue: 'P1',
        }),
        expect.objectContaining({
          description: 'EL Reading',
          roomDisplayValue: '203A',
        }),
        expect.objectContaining({
          description: 'EL Math',
          roomDisplayValue: 'P1',
        }),
        expect.objectContaining({
          description: 'EL Science',
          roomDisplayValue: 'A-12',
        }),
      ]),
    );
  });
});
