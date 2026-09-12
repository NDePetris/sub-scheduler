import { describe, expect, it } from 'vitest';

import {
  EXPECTED_D1_MIGRATIONS,
  expectedMigrationsAreApplied,
} from '../../worker/schema-readiness';

describe('schema readiness migration expectation', () => {
  it('accepts the exact canonical baseline', () => {
    expect(expectedMigrationsAreApplied(EXPECTED_D1_MIGRATIONS)).toBe(true);
  });

  it('rejects missing, reordered, duplicate, and malformed ledger entries', () => {
    expect(expectedMigrationsAreApplied([])).toBe(false);
    expect(
      expectedMigrationsAreApplied([
        '0002_future.sql',
        '0001_initial_schema.sql',
      ]),
    ).toBe(false);
    expect(
      expectedMigrationsAreApplied([
        '0001_initial_schema.sql',
        '0001_initial_schema.sql',
      ]),
    ).toBe(false);
    expect(expectedMigrationsAreApplied([null])).toBe(false);
  });

  it('permits additional forward-only migrations after the expected prefix', () => {
    expect(
      expectedMigrationsAreApplied([
        '0001_initial_schema.sql',
        '0002_additive_change.sql',
      ]),
    ).toBe(true);
  });
});
