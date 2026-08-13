import { describe, expect, it } from 'vitest';

import { appliesToDay } from '../../src/domain/schedule';

describe('schedule day applicability', () => {
  it('applies shared entries to A and B but keeps explicit entries distinct', () => {
    expect(appliesToDay('ALL', 'A')).toBe(true);
    expect(appliesToDay('ALL', 'B')).toBe(true);
    expect(appliesToDay('A', 'B')).toBe(false);
    expect(appliesToDay('B', 'B')).toBe(true);
  });
});
