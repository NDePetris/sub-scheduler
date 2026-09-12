/**
 * Add each forward-only migration here when it is added to `migrations/`.
 *
 * The expected list must be an ordered prefix of the D1 ledger. Additional
 * migrations are allowed so operators can apply a backward-compatible schema
 * change before deploying the Worker that begins to use it.
 */
export const EXPECTED_D1_MIGRATIONS = ['0001_initial_schema.sql'] as const;

export function expectedMigrationsAreApplied(
  appliedMigrationNames: readonly unknown[],
): boolean {
  const appliedNames = appliedMigrationNames.map((name) =>
    typeof name === 'string' ? name : null,
  );

  if (
    appliedNames.some((name) => !name?.trim()) ||
    new Set(appliedNames).size !== appliedNames.length
  ) {
    return false;
  }

  return EXPECTED_D1_MIGRATIONS.every(
    (migration, index) => appliedNames[index] === migration,
  );
}
