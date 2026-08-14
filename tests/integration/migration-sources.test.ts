import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

interface UpgradeEnv {
  UPGRADE_DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

const testEnv = env as unknown as UpgradeEnv;

describe('exclusive schedule-source migration', () => {
  it('preserves legacy plan and import children while making schedule sources exclusive', async () => {
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
        `INSERT INTO rooms (id, name) VALUES ('migration_room', 'Room F-101')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_versions
           (id, name, effective_from, status, created_by)
         VALUES ('migration_normal', 'Normal', '2026-01-01', 'active', 'migration_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_imports (
           id, source_file_name, source_file_sha256, status, effective_from,
           effective_to, sheet_name, recognized_staff_count,
           recognized_room_count, a_b_detected, created_by, created_at
         ) VALUES (
           'migration_import', 'Fictional Middle Schedule.xlsx',
           'fixture-hash-0005', 'ready', '2026-01-01', '2026-05-31',
           'Schedule', 1, 1, 1, 'migration_actor', '2025-12-15T14:30:00.000Z'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_staff (
           import_id, display_value, staff_id, mapping_status
         ) VALUES (
           'migration_import', 'Fixture Teacher', 'migration_staff', 'mapped'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_rooms (
           import_id, display_value, room_id, mapping_status
         ) VALUES (
           'migration_import', 'Room F-101', 'migration_room', 'exact'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO staged_schedule_entries (
           id, import_id, source_sheet, source_cell, staff_display_value,
           room_display_value, day_type, start_time, end_time, activity_type,
           category, description, requires_sub
         ) VALUES (
           'migration_staged_entry', 'migration_import', 'Schedule', 'B7',
           'Fixture Teacher', 'Room F-101', 'A', '08:10', '09:00',
           'instruction', 'MS', 'Fictional Mathematics', 1
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_issues (
           id, import_id, severity, code, message, source_sheet, source_cell
         ) VALUES (
           'migration_issue', 'migration_import', 'warning', 'FIXTURE_WARNING',
           'Review this fictional fixture value.', 'Schedule', 'H7'
         )`,
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

    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT
           id, import_kind, schedule_name, source_file_name,
           source_file_sha256, status, effective_from, effective_to,
           special_date, sheet_name, recognized_staff_count,
           recognized_room_count, a_b_detected, created_by, created_at,
           activated_schedule_version_id, activated_special_schedule_id,
           activated_at
         FROM schedule_imports WHERE id = 'migration_import'`,
      ).first(),
    ).toEqual({
      id: 'migration_import',
      import_kind: 'normal',
      schedule_name: 'Fictional Middle Schedule.xlsx',
      source_file_name: 'Fictional Middle Schedule.xlsx',
      source_file_sha256: 'fixture-hash-0005',
      status: 'ready',
      effective_from: '2026-01-01',
      effective_to: '2026-05-31',
      special_date: null,
      sheet_name: 'Schedule',
      recognized_staff_count: 1,
      recognized_room_count: 1,
      a_b_detected: 1,
      created_by: 'migration_actor',
      created_at: '2025-12-15T14:30:00.000Z',
      activated_schedule_version_id: null,
      activated_special_schedule_id: null,
      activated_at: null,
    });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT import_id, display_value, staff_id, mapping_status
         FROM schedule_import_staff WHERE import_id = 'migration_import'`,
      ).first(),
    ).toEqual({
      import_id: 'migration_import',
      display_value: 'Fixture Teacher',
      staff_id: 'migration_staff',
      mapping_status: 'mapped',
    });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT import_id, display_value, room_id, mapping_status
         FROM schedule_import_rooms WHERE import_id = 'migration_import'`,
      ).first(),
    ).toEqual({
      import_id: 'migration_import',
      display_value: 'Room F-101',
      room_id: 'migration_room',
      mapping_status: 'exact',
    });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT
           id, import_id, source_sheet, source_cell, staff_display_value,
           room_display_value, day_type, start_time, end_time, activity_type,
           category, description, requires_sub
         FROM staged_schedule_entries WHERE id = 'migration_staged_entry'`,
      ).first(),
    ).toEqual({
      id: 'migration_staged_entry',
      import_id: 'migration_import',
      source_sheet: 'Schedule',
      source_cell: 'B7',
      staff_display_value: 'Fixture Teacher',
      room_display_value: 'Room F-101',
      day_type: 'A',
      start_time: '08:10',
      end_time: '09:00',
      activity_type: 'instruction',
      category: 'MS',
      description: 'Fictional Mathematics',
      requires_sub: 1,
    });
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT id, import_id, severity, code, message, source_sheet, source_cell
         FROM schedule_import_issues WHERE id = 'migration_issue'`,
      ).first(),
    ).toEqual({
      id: 'migration_issue',
      import_id: 'migration_import',
      severity: 'warning',
      code: 'FIXTURE_WARNING',
      message: 'Review this fictional fixture value.',
      source_sheet: 'Schedule',
      source_cell: 'H7',
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

    const orphanedImportChildren = [
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_staff (
           import_id, display_value, staff_id, mapping_status
         ) VALUES ('missing_import', 'Orphan Staff', 'migration_staff', 'mapped')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_rooms (
           import_id, display_value, room_id, mapping_status
         ) VALUES ('missing_import', 'Orphan Room', 'migration_room', 'mapped')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO staged_schedule_entries (
           id, import_id, source_sheet, source_cell, staff_display_value,
           day_type, start_time, end_time, activity_type, category,
           description, requires_sub
         ) VALUES (
           'orphan_entry', 'missing_import', 'Schedule', 'Z99', 'Orphan Staff',
           'ALL', '10:00', '10:30', 'instruction', 'MS', 'Orphan Entry', 1
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_import_issues (
           id, import_id, severity, code, message
         ) VALUES (
           'orphan_issue', 'missing_import', 'warning', 'ORPHAN', 'Orphan Issue'
         )`,
      ),
    ];
    for (const statement of orphanedImportChildren) {
      await expect(statement.run()).rejects.toThrow();
    }
  });
});
