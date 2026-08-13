import type { CellValue } from 'read-excel-file/universal';

export type WorkbookCell = CellValue | null;

export interface WorkbookSheet {
  readonly name: string;
  readonly rows: readonly (readonly WorkbookCell[])[];
}

export interface ParsedWorkbook {
  readonly sheets: readonly WorkbookSheet[];
}

export interface WorkbookReadLimits {
  readonly maxBytes: number;
  readonly maxSheets: number;
  readonly maxRowsPerSheet: number;
  readonly maxColumnsPerRow: number;
}

export interface ImportIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly sheet?: string;
  readonly row?: number;
  readonly column?: number;
}

export interface SchoolScheduleParseResult<TCandidate> {
  readonly candidate: TCandidate | null;
  readonly issues: readonly ImportIssue[];
}

export interface SchoolScheduleAdapter<TCandidate> {
  parse(workbook: ParsedWorkbook): SchoolScheduleParseResult<TCandidate>;
}
