import readWorkbookFile, { type Sheet } from 'read-excel-file/universal';

import type {
  ParsedWorkbook,
  WorkbookReadLimits,
  WorkbookSheet,
} from './types';

export const defaultWorkbookReadLimits: WorkbookReadLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxSheets: 20,
  maxRowsPerSheet: 5_000,
  maxColumnsPerRow: 100,
};

export class WorkbookReadError extends Error {
  constructor(
    readonly code:
      'invalid_file' | 'file_too_large' | 'workbook_limit_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'WorkbookReadError';
  }
}

export function assertXlsxFileName(fileName: string): void {
  if (!fileName.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
    throw new WorkbookReadError(
      'invalid_file',
      'Schedule uploads must be .xlsx files.',
    );
  }
}

export async function readWorkbook(
  input: ArrayBuffer,
  limits: WorkbookReadLimits = defaultWorkbookReadLimits,
): Promise<ParsedWorkbook> {
  if (input.byteLength === 0) {
    throw new WorkbookReadError('invalid_file', 'The workbook is empty.');
  }
  if (input.byteLength > limits.maxBytes) {
    throw new WorkbookReadError(
      'file_too_large',
      'The workbook exceeds the configured size limit.',
    );
  }

  let parsed: Sheet<number>[];
  try {
    parsed = await readWorkbookFile<number>(input);
  } catch {
    throw new WorkbookReadError(
      'invalid_file',
      'The file is not a readable .xlsx workbook.',
    );
  }

  if (parsed.length === 0) {
    throw new WorkbookReadError(
      'invalid_file',
      'The workbook does not contain a worksheet.',
    );
  }
  if (parsed.length > limits.maxSheets) {
    throw new WorkbookReadError(
      'workbook_limit_exceeded',
      `The workbook contains more than ${limits.maxSheets} worksheets.`,
    );
  }

  const sheets: WorkbookSheet[] = parsed.map(({ sheet, data }) => {
    if (data.length > limits.maxRowsPerSheet) {
      throw new WorkbookReadError(
        'workbook_limit_exceeded',
        `Worksheet “${sheet}” contains more than ${limits.maxRowsPerSheet} rows.`,
      );
    }
    if (data.some((row) => row.length > limits.maxColumnsPerRow)) {
      throw new WorkbookReadError(
        'workbook_limit_exceeded',
        `Worksheet “${sheet}” contains more than ${limits.maxColumnsPerRow} columns.`,
      );
    }

    return { name: sheet, rows: data };
  });

  return { sheets };
}
