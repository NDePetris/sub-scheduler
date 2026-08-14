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
