export type TeacherPerformanceSortColumn =
  | 'teacher'
  | 'absences'
  | 'blackoutDays'
  | 'partialAbsences'
  | 'coverageMinutes';
export type SortDirection = 'ascending' | 'descending';

export function sortTeachers<
  T extends {
    readonly staffId: string;
    readonly displayName: string;
    readonly absences: number;
    readonly blackoutDays: number;
    readonly partialAbsences: number;
    readonly coverageMinutes: number;
  },
>(
  teachers: readonly T[],
  column: TeacherPerformanceSortColumn,
  direction: SortDirection,
) {
  const multiplier = direction === 'ascending' ? 1 : -1;
  return [...teachers].sort((left, right) => {
    const comparison =
      column === 'teacher'
        ? left.displayName.localeCompare(right.displayName, undefined, {
            sensitivity: 'base',
          }) || left.staffId.localeCompare(right.staffId)
        : left[column] - right[column] ||
          left.displayName.localeCompare(right.displayName, undefined, {
            sensitivity: 'base',
          }) ||
          left.staffId.localeCompare(right.staffId);
    return comparison * multiplier;
  });
}

export function nextSort(
  current: {
    readonly column: TeacherPerformanceSortColumn;
    readonly direction: SortDirection;
  },
  column: TeacherPerformanceSortColumn,
): { column: TeacherPerformanceSortColumn; direction: SortDirection } {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === 'ascending' ? 'descending' : 'ascending',
    };
  }
  return {
    column,
    direction: column === 'teacher' ? 'ascending' : 'descending',
  };
}

export function resolutionLabel(value: string | null): string | null {
  if (!value) return null;
  const known: Record<string, string> = {
    teacher_cover: 'Teacher coverage',
    split_coverage: 'Split coverage',
    manual_override: 'Manual override',
    duty_coverage: 'Duty coverage',
  };
  return (
    known[value] ??
    value
      .split('_')
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
      .join(' ')
  );
}
