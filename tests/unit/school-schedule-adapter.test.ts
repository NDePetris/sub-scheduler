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
});
