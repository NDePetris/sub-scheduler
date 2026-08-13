import { describe, expect, it } from 'vitest';

import {
  assertXlsxFileName,
  readWorkbook,
  WorkbookReadError,
} from '../../src/features/schedule-import/read-workbook';
import { createRepresentativeWorkbook } from '../fixtures/create-workbook';

describe('generic workbook boundary', () => {
  it('reads a representative xlsx without interpreting school-specific columns', async () => {
    const workbook = await readWorkbook(createRepresentativeWorkbook());
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.sheets[0]).toEqual({
      name: 'Schedule',
      rows: [
        ['Teacher', 'Day'],
        ['Avery Bennett', 'A'],
      ],
    });
  });

  it('rejects the wrong extension and bounded input violations', async () => {
    expect(() => assertXlsxFileName('schedule.xls')).toThrow(WorkbookReadError);
    expect(() => assertXlsxFileName('SCHEDULE.XLSX')).not.toThrow();

    await expect(
      readWorkbook(createRepresentativeWorkbook(), {
        maxBytes: 1,
        maxSheets: 1,
        maxRowsPerSheet: 10,
        maxColumnsPerRow: 10,
      }),
    ).rejects.toMatchObject({ code: 'file_too_large' });
  });
});
