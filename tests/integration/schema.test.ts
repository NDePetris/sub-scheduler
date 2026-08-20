import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

interface TestEnv {
  DB: D1Database;
  TEST_SEED_QUERIES: string[];
}

const testEnv = env as unknown as TestEnv;

describe('initial migration and local seed', () => {
  it('contains every MVP core logical table', async () => {
    const result = await testEnv.DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    ).all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'staff',
        'rooms',
        'schedule_versions',
        'schedule_entries',
        'special_schedules',
        'special_schedule_entries',
        'absences',
        'daily_sub_plans',
        'default_sub_plans',
        'default_sub_plan_actions',
        'assignments',
        'assignment_segments',
        'generated_messages',
        'application_settings',
        'schedule_imports',
        'schedule_import_staff',
        'schedule_import_rooms',
        'staged_schedule_entries',
        'schedule_import_issues',
        'staff_aliases',
        'school_calendar_dates',
      ]),
    );
  });

  it('can seed the same local fixture repeatedly without duplicates', async () => {
    await testEnv.DB.batch(
      testEnv.TEST_SEED_QUERIES.map((query) => testEnv.DB.prepare(query)),
    );
    const staff = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM staff',
    ).first<{
      count: number;
    }>();
    const entries = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM schedule_entries',
    ).first<{
      count: number;
    }>();

    expect(staff?.count).toBe(7);
    expect(entries?.count).toBe(27);
  });

  it('enforces half-open source intervals and partial-absence shape', async () => {
    await expect(
      testEnv.DB.prepare(
        `INSERT INTO absences (
          id, staff_id, start_date, end_date, start_time, end_time,
          created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          'absence_invalid',
          'staff_avery_bennett',
          '2026-09-01',
          '2026-09-02',
          '09:00',
          '10:00',
          'user_local_admin',
          'user_local_admin',
        )
        .run(),
    ).rejects.toThrow();
  });
});
