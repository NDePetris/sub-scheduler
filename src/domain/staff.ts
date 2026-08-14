export const STAFF_ROLES = ['Teacher', 'Administrator', 'Staff'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function normalizeStaffRole(role: string): StaffRole {
  const normalized = role.trim().toLocaleLowerCase('en-US');
  if (normalized === 'teacher') return 'Teacher';
  if (normalized === 'administrator') return 'Administrator';
  return 'Staff';
}

export function isTeacherRole(role: string): boolean {
  return normalizeStaffRole(role) === 'Teacher';
}
