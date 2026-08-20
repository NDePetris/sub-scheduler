import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { readWorkbook } from '../../src/features/schedule-import/read-workbook';
import { schoolScheduleAdapter } from '../../src/features/schedule-import/school-schedule-adapter';

describe('sanitized school schedule adapter', () => {
  it('interprets the representative merged-cell timetable', async () => {
    const file = readFileSync('tests/fixtures/schedule-sample.xlsx');
    const input = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    );
    const workbook = await readWorkbook(input);
    const result = schoolScheduleAdapter.parse(workbook);

    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual(
      [],
    );
    expect(result.candidate).not.toBeNull();
    expect(result.candidate?.sheetName).toBe('SY27 Teacher Schedules');
    expect(result.candidate?.staffDisplayValues).toHaveLength(22);
    expect(result.candidate?.roomDisplayValues).toHaveLength(22);
    expect(result.candidate?.aBDetected).toBe(true);
    expect(result.candidate?.entries.length).toBeGreaterThan(100);
    expect(result.candidate?.entries).toContainEqual(
      expect.objectContaining({
        sourceCell: 'C4',
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
});
