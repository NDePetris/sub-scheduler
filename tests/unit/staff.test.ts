import { describe, expect, it } from 'vitest';

import { isTeacherRole, normalizeStaffRole } from '../../src/domain/staff';

describe('staff roles', () => {
  it('recognizes normalized and legacy-case Teacher values centrally', () => {
    expect(isTeacherRole('Teacher')).toBe(true);
    expect(isTeacherRole('teacher')).toBe(true);
    expect(normalizeStaffRole('TEACHER')).toBe('Teacher');
    expect(isTeacherRole('Administrator')).toBe(false);
    expect(isTeacherRole('Staff')).toBe(false);
  });
});
