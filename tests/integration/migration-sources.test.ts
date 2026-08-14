import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

interface UpgradeEnv {
  UPGRADE_DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as UpgradeEnv;

describe('exclusive schedule-source migration', () => {
  it('converts legacy Special plans to Special-only without losing history or children', async () => {
    const legacyMigrations = testEnv.TEST_MIGRATIONS.filter(
      (migration) => migration.name < '0005_exclusive_schedule_sources.sql',
    );
    const sourceMigration = testEnv.TEST_MIGRATIONS.filter(
      (migration) => migration.name === '0005_exclusive_schedule_sources.sql',
    );
    await applyD1Migrations(testEnv.UPGRADE_DB, legacyMigrations);
    await testEnv.UPGRADE_DB.batch([
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO authorized_users (id, email, display_name)
         VALUES ('migration_actor', 'migration@example.test', 'Migration Actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO staff (id, display_name) VALUES ('migration_staff', 'Fixture Teacher')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_versions
           (id, name, effective_from, status, created_by)
         VALUES ('migration_normal', 'Normal', '2026-01-01', 'active', 'migration_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO special_schedules
           (id, date, name, status, created_by)
         VALUES ('migration_special', '2026-02-02', 'Special', 'active', 'migration_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO special_schedule_entries (
           id, special_schedule_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, requires_sub
         ) VALUES ('migration_special_entry', 'migration_special', 'migration_staff',
                   'ALL', '08:00', '08:50', 'instruction', 'PRI', 'Fixture Class', 1)`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO absences
           (id, staff_id, start_date, end_date, created_by, updated_by)
         VALUES ('migration_absence', 'migration_staff', '2026-02-02',
                 '2026-02-02', 'migration_actor', 'migration_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, special_schedule_id, status,
           created_by, created_at, updated_by, updated_at, finalized_by, finalized_at
         ) VALUES (
           'migration_special_plan', '2026-02-02', 'B', 'migration_normal',
           'migration_special', 'finalized', 'migration_actor',
           '2026-02-01T10:00:00.000Z', 'migration_actor',
           '2026-02-02T10:00:00.000Z', 'migration_actor',
           '2026-02-02T09:00:00.000Z'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, status, created_by, updated_by
         ) VALUES ('migration_normal_plan', '2026-02-03', 'A', 'migration_normal',
                   'draft', 'migration_actor', 'migration_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO assignments (
           id, daily_sub_plan_id, absence_id, source_special_schedule_entry_id,
           start_time, end_time, responsibility_type, description, status, updated_by
         ) VALUES ('migration_assignment', 'migration_special_plan',
                   'migration_absence', 'migration_special_entry', '08:00', '08:50',
                   'instruction', 'Fixture Class', 'unresolved', 'migration_actor')`,
      ),
    ]);

    await applyD1Migrations(testEnv.UPGRADE_DB, sourceMigration);

    const special = await testEnv.UPGRADE_DB.prepare(
      `SELECT * FROM daily_sub_plans WHERE id = 'migration_special_plan'`,
    ).first<{
      id: string;
      date: string;
      status: string;
      schedule_version_id: string | null;
      special_schedule_id: string | null;
      created_at: string;
      updated_at: string;
      finalized_by: string | null;
      finalized_at: string | null;
    }>();
    expect(special).toMatchObject({
      id: 'migration_special_plan',
      date: '2026-02-02',
      status: 'finalized',
      schedule_version_id: null,
      special_schedule_id: 'migration_special',
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-02T10:00:00.000Z',
      finalized_by: 'migration_actor',
      finalized_at: '2026-02-02T09:00:00.000Z',
    });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT daily_sub_plan_id FROM assignments WHERE id = 'migration_assignment'`,
      ).first(),
    ).toMatchObject({ daily_sub_plan_id: 'migration_special_plan' });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT schedule_version_id, special_schedule_id
           FROM daily_sub_plans WHERE id = 'migration_normal_plan'`,
      ).first(),
    ).toMatchObject({
      schedule_version_id: 'migration_normal',
      special_schedule_id: null,
    });

    await expect(
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, special_schedule_id,
           status, created_by, updated_by
         ) VALUES ('invalid_both', '2026-02-04', 'A', 'migration_normal',
                   'migration_special', 'draft', 'migration_actor', 'migration_actor')`,
      ).run(),
    ).rejects.toThrow();
  });
});
