import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Schedule UI source hygiene', () => {
  it('contains no known mojibake markers or development date default', () => {
    const source = [
      'src/features/schedule-import/schedule-import-workspace.tsx',
      'src/features/sub-plan/sub-plan-workspace.tsx',
    ]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    for (const marker of ['Ã', 'Â', 'â†', 'â€', 'â€¦']) {
      expect(source).not.toContain(marker);
    }
    expect(source).not.toContain("useState('2026-08-17')");
  });
});

describe('Add Absence staff selection source', () => {
  const source = readFileSync(
    'src/features/sub-plan/sub-plan-workspace.tsx',
    'utf8',
  );

  it('uses normalized Teacher filtering and an ID-backed accessible combobox', () => {
    expect(source).toContain('isTeacherRole(person.role)');
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('selectedStaffId');
    expect(source).toContain("setSelectedStaffId('')");
    expect(source).toContain('staffId: person.id');
    expect(source).not.toContain('<datalist');
    expect(source).not.toContain("person.role === 'teacher'");
  });
});

describe('Staff editor terminology source', () => {
  const source = readFileSync(
    'src/features/staff-rooms/staff-rooms-workspace.tsx',
    'utf8',
  );

  it('uses eligibility, designated School Sub, and schedule matching copy', () => {
    expect(source).toContain('Eligible for Sub Assignments');
    expect(source).toContain('Designated School Sub');
    expect(source).toContain('Schedule Name Matching');
    expect(source).toContain('Primary name');
    expect(source).toContain('Also recognize');
    expect(source).not.toContain('Can be assigned as a Sub');
  });

  it('renders eligibility controls as accessible switch setting rows', () => {
    expect(source).toContain('role="switch"');
    expect(source).toContain('peer-checked:bg-brand');
    expect(source).toContain('divide-y overflow-hidden rounded-md border');
    expect(source).toContain('isSchoolSub: canSub ? value.isSchoolSub : false');
    expect(source).toContain('canSub: isSchoolSub ? true : value.canSub');
  });
});

describe('Daily Sub Plan resolution presentation source', () => {
  const workspace = readFileSync(
    'src/features/sub-plan/sub-plan-workspace.tsx',
    'utf8',
  );
  const drawer = readFileSync(
    'src/features/sub-plan/resolve-sub-need-drawer.tsx',
    'utf8',
  );

  it('shows concise availability badges and contextual current/default state', () => {
    expect(drawer).toContain('Currently Chosen');
    expect(drawer).not.toContain('Not automatically available');
    expect(drawer).not.toContain('Default Sub Plan\n');
    expect(drawer).toContain("candidate.availability === 'open'");
    expect(drawer).toContain('candidate.isDefaultCandidate');
    expect(workspace).toContain("assignment.assignedStaff && 'font-semibold'");
  });

  it('keeps single-assignee source badges inline and shows threshold warnings', () => {
    expect(workspace).toContain(
      '<div className="flex flex-wrap items-center gap-1">',
    );
    expect(workspace).toMatch(
      /assignmentLabel\(assignment\)[\s\S]*?assignment\.resolutionSource/,
    );
    expect(drawer).toContain('Workload Warning');
    expect(drawer).toMatch(
      /candidate\.projectedBurden !== null\s*&&\s*candidate\.projectedBurden >= candidate\.threshold/,
    );
    expect(drawer).toContain(
      'After assignment, {candidate.projectedBurden.toFixed(2)} Plan',
    );
  });

  it('places confirmed bulk actions in the absent-teacher filter context', () => {
    expect(workspace).toContain('Cover with School Sub');
    expect(workspace).toContain('Restore Defaults');
    expect(workspace).toContain("runTeacherBulkAction('school-sub')");
    expect(workspace).toContain("runTeacherBulkAction('restore-defaults')");
    expect(workspace).toContain('window.confirm(label)');
    expect(workspace).toContain('bulkResultMessage');
    expect(workspace).toMatch(
      /staffFilter && detail\.plan\.status === 'draft'[\s\S]*?Cover with School Sub[\s\S]*?Restore Defaults/,
    );
  });
});

describe('Schedule import staged workflow source', () => {
  const source = readFileSync(
    'src/features/schedule-import/schedule-import-workspace.tsx',
    'utf8',
  );

  it('replaces each upload form with staged source context', () => {
    expect(source).toMatch(
      /selectedNormal \? \([\s\S]*?<StagedSourceSummary[\s\S]*?: \(\s*<form/,
    );
    expect(source).toMatch(
      /selectedSpecial \? \([\s\S]*?<StagedSourceSummary[\s\S]*?: \(\s*<form/,
    );
    expect(source).toContain('Choose Different Workbook');
    expect(source).toContain('Special Schedule Configuration');
  });

  it('requires confirmation before deleting staged work for start over', () => {
    expect(source).toContain('Start over with a different workbook?');
    expect(source).toContain("confirmLabel: 'Delete & Start Over'");
    expect(source).toMatch(
      /function startOver[\s\S]*?setConfirmation[\s\S]*?deleteScheduleImport\(item\.id\)[\s\S]*?setSelected\(null\)/,
    );
  });

  it('exposes incremental and accessible bulk-create progress', () => {
    expect(source).toContain('completed += 1');
    expect(source).toContain('Creating records…');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-valuenow={progress.completed}');
    expect(source).toContain("status: 'complete'");
    expect(source).toContain('aria-busy={selectedBulkProgress?.status');
    expect(source).toMatch(
      /setBulkCreateProgress\(\{[\s\S]*?status: 'complete'[\s\S]*?setBusy\(false\)/,
    );
  });
});
