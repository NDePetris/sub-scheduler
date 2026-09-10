import { describe, expect, it } from 'vitest';

import {
  nextSort,
  resolutionLabel,
  sortTeachers,
} from '../../src/features/reports/teacher-performance-presentation';

const teachers = [
  {
    staffId: 'z',
    displayName: 'Zoe Teacher',
    isActive: true,
    absences: 2,
    blackoutDays: 0,
    partialAbsences: 0,
    coverageMinutes: 9,
  },
  {
    staffId: 'a',
    displayName: 'Alex Teacher',
    isActive: false,
    absences: 10,
    blackoutDays: 1,
    partialAbsences: 0,
    coverageMinutes: 100,
  },
] as const;

describe('Teacher performance report presentation', () => {
  it('sorts Teachers A–Z and numeric metrics numerically', () => {
    expect(
      sortTeachers(teachers, 'teacher', 'ascending').map(
        (item) => item.staffId,
      ),
    ).toEqual(['a', 'z']);
    expect(
      sortTeachers(teachers, 'coverageMinutes', 'descending').map(
        (item) => item.staffId,
      ),
    ).toEqual(['a', 'z']);
  });

  it('toggles the active sort and defaults a new numeric sort to descending', () => {
    expect(
      nextSort({ column: 'teacher', direction: 'ascending' }, 'teacher'),
    ).toEqual({ column: 'teacher', direction: 'descending' });
    expect(
      nextSort({ column: 'teacher', direction: 'descending' }, 'absences'),
    ).toEqual({ column: 'absences', direction: 'descending' });
  });

  it('formats known resolution values and safely falls back for new values', () => {
    expect(resolutionLabel('split_coverage')).toBe('Split coverage');
    expect(resolutionLabel('other_resolution')).toBe('Other Resolution');
  });
});
