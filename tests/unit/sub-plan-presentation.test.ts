import { describe, expect, it } from 'vitest';

import { formatRoomLabel } from '../../src/features/sub-plan/sub-plan-presentation';

describe('Sub Plan presentation helpers', () => {
  it('labels simple room identifiers without duplicating an existing label', () => {
    expect(formatRoomLabel('7')).toBe('Room 7');
    expect(formatRoomLabel('101A')).toBe('Room 101A');
    expect(formatRoomLabel('PRI-101')).toBe('Room PRI-101');
    expect(formatRoomLabel('Room 7')).toBe('Room 7');
  });

  it('preserves descriptive room values', () => {
    expect(formatRoomLabel('GYM')).toBe('GYM');
    expect(formatRoomLabel('Lower School Library')).toBe(
      'Lower School Library',
    );
    expect(formatRoomLabel('Library 2')).toBe('Library 2');
    expect(formatRoomLabel(null)).toBeNull();
  });
});
