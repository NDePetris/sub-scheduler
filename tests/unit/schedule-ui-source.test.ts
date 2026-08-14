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
