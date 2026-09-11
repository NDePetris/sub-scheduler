import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

interface MigrationEnv {
  UPGRADE_DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

interface ForeignKeyRow {
  from: string;
  on_delete: string;
  table: string;
  to: string;
}

interface IndexRow {
  name: string;
  unique: number;
}

interface TableColumnRow {
  dflt_value: string | null;
  name: string;
  notnull: number;
}

const testEnv = env as unknown as MigrationEnv;

describe('canonical migration baseline', () => {
  beforeAll(async () => {
    expect(testEnv.TEST_MIGRATIONS.map((migration) => migration.name)).toEqual([
      '0001_initial_schema.sql',
    ]);
    await applyD1Migrations(testEnv.UPGRADE_DB, testEnv.TEST_MIGRATIONS);
  });

  it('applies the authoritative baseline to an empty database', async () => {
    const migrations = await testEnv.UPGRADE_DB.prepare(
      `SELECT name FROM d1_migrations ORDER BY id`,
    ).all<{ name: string }>();
    const tables = await testEnv.UPGRADE_DB.prepare(
      `SELECT name, sql FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE '_cf_%'
           AND name NOT LIKE 'sqlite_%'
           AND name <> 'd1_migrations'
         ORDER BY name`,
    ).all<{ name: string; sql: string }>();

    expect(migrations.results).toEqual([{ name: '0001_initial_schema.sql' }]);
    expect(tables.results.map((table) => table.name)).toHaveLength(22);
    expect(tables.results.every((table) => table.sql.endsWith('STRICT'))).toBe(
      true,
    );
  });

  it('retains source-entry references and cascades assignment segments', async () => {
    const assignmentKeys = await testEnv.UPGRADE_DB.prepare(
      `PRAGMA foreign_key_list(assignments)`,
    ).all<ForeignKeyRow>();
    const segmentKeys = await testEnv.UPGRADE_DB.prepare(
      `PRAGMA foreign_key_list(assignment_segments)`,
    ).all<ForeignKeyRow>();

    expect(assignmentKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'source_schedule_entry_id',
          table: 'schedule_entries',
          to: 'id',
          on_delete: 'NO ACTION',
        }),
        expect.objectContaining({
          from: 'source_special_schedule_entry_id',
          table: 'special_schedule_entries',
          to: 'id',
          on_delete: 'NO ACTION',
        }),
      ]),
    );
    expect(segmentKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'assignment_id',
          table: 'assignments',
          to: 'id',
          on_delete: 'CASCADE',
        }),
      ]),
    );

    await testEnv.UPGRADE_DB.batch([
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO authorized_users (id, email, display_name)
         VALUES ('baseline_actor', 'baseline@example.test', 'Baseline Actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO staff (id, display_name)
         VALUES ('baseline_absent', 'Fixture Absent'),
                ('baseline_cover', 'Fixture Cover')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_versions
           (id, name, effective_from, status, created_by)
         VALUES ('baseline_schedule', 'Fixture Schedule', '2026-01-01',
                 'active', 'baseline_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO schedule_entries (
           id, schedule_version_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, requires_sub
         ) VALUES (
           'baseline_normal_entry', 'baseline_schedule', 'baseline_absent',
           'ALL', '08:00', '08:50', 'instruction', 'MS', 'Fixture Class', 1
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO special_schedules (id, date, name, status, created_by)
         VALUES ('baseline_special', '2026-02-02', 'Fixture Special', 'active',
                 'baseline_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO special_schedule_entries (
           id, special_schedule_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, requires_sub
         ) VALUES (
           'baseline_special_entry', 'baseline_special', 'baseline_absent',
           'ALL', '09:00', '09:50', 'instruction', 'MS', 'Fixture Special Class', 1
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO absences
           (id, staff_id, start_date, end_date, created_by, updated_by)
         VALUES ('baseline_absence', 'baseline_absent', '2026-02-02',
                 '2026-02-02', 'baseline_actor', 'baseline_actor')`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, special_schedule_id,
           created_by, updated_by
         ) VALUES (
           'baseline_plan', '2026-02-02', 'A', 'baseline_schedule',
           'baseline_special', 'baseline_actor', 'baseline_actor'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO assignments (
           id, daily_sub_plan_id, absence_id, source_schedule_entry_id,
           start_time, end_time, responsibility_type, description, updated_by
         ) VALUES (
           'baseline_normal_assignment', 'baseline_plan', 'baseline_absence',
           'baseline_normal_entry', '08:00', '08:50', 'instruction',
           'Fixture Class', 'baseline_actor'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO assignments (
           id, daily_sub_plan_id, absence_id, source_special_schedule_entry_id,
           start_time, end_time, responsibility_type, description,
           resolution_type, status, shared_responsibility_key,
           counts_toward_workload, updated_by
         ) VALUES (
           'baseline_special_assignment', 'baseline_plan', 'baseline_absence',
           'baseline_special_entry', '09:00', '09:50', 'duty',
           'Fixture Shared Duty', 'solo_coverage', 'assigned',
           'fixture-shared-key', 0, 'baseline_actor'
         )`,
      ),
      testEnv.UPGRADE_DB.prepare(
        `INSERT INTO assignment_segments
           (id, assignment_id, start_time, end_time, staff_id, sequence)
         VALUES ('baseline_segment', 'baseline_normal_assignment', '08:00',
                 '08:50', 'baseline_cover', 0)`,
      ),
    ]);

    await expect(
      testEnv.UPGRADE_DB.prepare(
        `DELETE FROM schedule_entries WHERE id = 'baseline_normal_entry'`,
      ).run(),
    ).rejects.toThrow();
    await expect(
      testEnv.UPGRADE_DB.prepare(
        `DELETE FROM special_schedule_entries
          WHERE id = 'baseline_special_entry'`,
      ).run(),
    ).rejects.toThrow();

    await testEnv.UPGRADE_DB.prepare(
      `DELETE FROM assignments WHERE id = 'baseline_normal_assignment'`,
    ).run();
    expect(
      await testEnv.UPGRADE_DB.prepare(
        `SELECT COUNT(*) AS count FROM assignment_segments
          WHERE id = 'baseline_segment'`,
      ).first(),
    ).toEqual({ count: 0 });
  });

  it('contains the current columns and repository-critical indexes', async () => {
    const expectedColumns: Record<string, string[]> = {
      staff: ['standard_period_minutes'],
      schedule_imports: [
        'import_kind',
        'schedule_name',
        'special_date',
        'activated_special_schedule_id',
      ],
      assignments: ['shared_responsibility_key', 'counts_toward_workload'],
      daily_sub_plans: ['structured_revision'],
      generated_messages: [
        'generated_html',
        'edited_html',
        'source_plan_revision',
      ],
      school_calendar_dates: ['updated_by', 'updated_at'],
    };

    for (const [table, columns] of Object.entries(expectedColumns)) {
      const result = await testEnv.UPGRADE_DB.prepare(
        `PRAGMA table_info(${table})`,
      ).all<TableColumnRow>();
      expect(result.results.map((column) => column.name)).toEqual(
        expect.arrayContaining(columns),
      );
    }

    const planColumns = await testEnv.UPGRADE_DB.prepare(
      `PRAGMA table_info(daily_sub_plans)`,
    ).all<TableColumnRow>();
    expect(
      planColumns.results.find(
        (column) => column.name === 'structured_revision',
      ),
    ).toMatchObject({ notnull: 1, dflt_value: '0' });

    const expectedIndexes: Record<string, string[]> = {
      assignments: [
        'assignments_generated_source',
        'assignments_plan_status',
        'assignments_absence',
        'assignments_staff_workload',
        'assignments_shared_responsibility',
      ],
      schedule_entries: ['schedule_entries_staff_time'],
      schedule_imports: [
        'schedule_imports_normal_source_hash',
        'schedule_imports_special_source_hash',
        'schedule_imports_status_created',
      ],
      school_calendar_dates: [
        'school_calendar_dates_school_day',
        'school_calendar_dates_special_expectation',
      ],
    };

    for (const [table, indexes] of Object.entries(expectedIndexes)) {
      const result = await testEnv.UPGRADE_DB.prepare(
        `PRAGMA index_list(${table})`,
      ).all<IndexRow>();
      expect(result.results.map((index) => index.name)).toEqual(
        expect.arrayContaining(indexes),
      );
    }

    const assignmentIndexes = await testEnv.UPGRADE_DB.prepare(
      `PRAGMA index_list(assignments)`,
    ).all<IndexRow>();
    expect(
      assignmentIndexes.results.find(
        (index) => index.name === 'assignments_generated_source',
      ),
    ).toMatchObject({ unique: 1 });
  });
});
