import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;

async function api(path: string, environment: Env = testEnv) {
  const response = await worker.fetch(
    new Request(`https://app.test${path}`),
    environment,
  );
  return { response, payload: await response.json() };
}

describe('teacher performance reporting API', () => {
  it('projects authoritative absence facts and finalized workload coverage only', async () => {
    const startDate = '2028-02-07';
    const endDate = '2028-02-09';
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub)
         VALUES
           ('report_active_teacher', 'Report Active Teacher', 'teacher', 1, 1, 0),
           ('report_inactive_teacher', 'Report Inactive Teacher', 'teacher', 0, 1, 0),
           ('report_school_sub', 'Report School Sub', 'teacher', 0, 1, 1),
           ('report_administrator', 'Report Administrator', 'administrator', 1, 1, 0)`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO school_calendar_dates
           (date, is_school_day, is_blackout_day, source_type)
         VALUES
           ('2028-02-07', 1, 0, 'test'),
           ('2028-02-08', 1, 1, 'test'),
           ('2028-02-09', 0, 0, 'test')`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO absences
           (id, staff_id, start_date, end_date, start_time, end_time, created_by, updated_by)
         VALUES
           ('report_full_absence', 'report_active_teacher', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin'),
           ('report_partial_one', 'report_active_teacher', ?, ?, '08:00', '09:00', 'user_local_admin', 'user_local_admin'),
           ('report_partial_two', 'report_active_teacher', ?, ?, '09:00', '10:00', 'user_local_admin', 'user_local_admin'),
           ('report_partial_non_school', 'report_active_teacher', ?, ?, '08:00', '09:00', 'user_local_admin', 'user_local_admin'),
           ('report_coverage_absence', 'report_inactive_teacher', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin')`,
      ).bind(
        startDate,
        endDate,
        startDate,
        startDate,
        startDate,
        startDate,
        endDate,
        endDate,
        startDate,
        startDate,
      ),
      testEnv.DB.prepare(
        `INSERT INTO daily_sub_plans
           (id, date, day_type, schedule_version_id, status, created_by, updated_by, finalized_by, finalized_at)
         VALUES
           ('report_finalized_plan', ?, 'A', 'schedule_2026_fall', 'finalized', 'user_local_admin', 'user_local_admin', 'user_local_admin', '2028-02-07T18:00:00.000Z'),
           ('report_draft_plan', '2028-02-08', 'A', 'schedule_2026_fall', 'draft', 'user_local_admin', 'user_local_admin', NULL, NULL)`,
      ).bind(startDate),
      testEnv.DB.prepare(
        `INSERT INTO assignments
           (id, daily_sub_plan_id, absence_id, source_schedule_entry_id, start_time, end_time,
            responsibility_type, description, assigned_staff_id, resolution_type, status,
            is_default, counts_toward_workload, updated_by)
         VALUES
           ('report_direct_primary', 'report_finalized_plan', 'report_coverage_absence', 'entry_avery_a_0800', '10:00', '10:50', 'instruction', 'Direct primary', 'report_active_teacher', 'teacher_cover', 'assigned', 0, 1, 'user_local_admin'),
           ('report_direct_overlap', 'report_finalized_plan', 'report_full_absence', 'entry_avery_a_0940', '10:20', '10:40', 'instruction', 'Direct overlap', 'report_active_teacher', 'teacher_cover', 'assigned', 0, 1, 'user_local_admin'),
           ('report_split', 'report_finalized_plan', 'report_partial_one', 'entry_jordan_a_0800', '11:00', '11:40', 'instruction', 'Split coverage', NULL, 'split_coverage', 'assigned', 0, 1, 'user_local_admin'),
           ('report_school_sub_coverage', 'report_finalized_plan', 'report_partial_two', 'entry_jordan_a_0850', '12:00', '12:30', 'instruction', 'School Sub coverage', 'report_school_sub', 'teacher_cover', 'assigned', 0, 1, 'user_local_admin'),
           ('report_no_workload', 'report_finalized_plan', 'report_partial_two', 'entry_jordan_a_0940', '12:30', '13:00', 'instruction', 'No workload', 'report_active_teacher', 'teacher_cover', 'assigned', 0, 0, 'user_local_admin'),
           ('report_combine_only', 'report_finalized_plan', 'report_partial_non_school', 'entry_morgan_a_0850', '13:00', '13:30', 'instruction', 'Combine only', NULL, 'combine_class', 'assigned', 0, 1, 'user_local_admin'),
           ('report_draft_coverage', 'report_draft_plan', 'report_partial_two', 'entry_jordan_b_0800', '13:00', '13:30', 'instruction', 'Draft coverage', 'report_active_teacher', 'teacher_cover', 'assigned', 0, 1, 'user_local_admin')`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO assignment_segments (id, assignment_id, start_time, end_time, staff_id, sequence)
         VALUES ('report_split_segment', 'report_split', '11:00', '11:30', 'report_inactive_teacher', 0)`,
      ),
    ]);

    const result = await api(
      `/api/reports/teacher-performance?start=${startDate}&end=${endDate}`,
    );
    expect(result.response.status).toBe(200);
    const data = (
      result.payload as {
        data: {
          range: {
            startDate: string;
            endDate: string;
            includesFutureDates: boolean;
          };
          calendar: { complete: boolean; missingWeekdayDates: number };
          teachers: Array<{
            staffId: string;
            isActive: boolean;
            absences: number;
            blackoutDays: number;
            partialAbsences: number;
            coverageMinutes: number;
          }>;
        };
      }
    ).data;
    expect(data.range).toMatchObject({
      startDate,
      endDate,
      includesFutureDates: true,
    });
    expect(data.calendar).toEqual({ complete: true, missingWeekdayDates: 0 });
    expect(
      data.teachers.find(
        (teacher) => teacher.staffId === 'report_active_teacher',
      ),
    ).toMatchObject({
      isActive: true,
      absences: 2,
      blackoutDays: 1,
      partialAbsences: 1,
      coverageMinutes: 50,
    });
    expect(
      data.teachers.find(
        (teacher) => teacher.staffId === 'report_inactive_teacher',
      ),
    ).toMatchObject({
      isActive: false,
      coverageMinutes: 30,
    });
    expect(
      data.teachers.some((teacher) => teacher.staffId === 'report_school_sub'),
    ).toBe(false);
    expect(
      data.teachers.some(
        (teacher) => teacher.staffId === 'report_administrator',
      ),
    ).toBe(false);
  });

  it('validates required ordered dates and remains administrator-protected', async () => {
    expect(
      (await api('/api/reports/teacher-performance')).response.status,
    ).toBe(400);
    expect(
      (
        await api(
          '/api/reports/teacher-performance?start=2028-02-10&end=2028-02-09',
        )
      ).response.status,
    ).toBe(400);
    expect(
      (
        await api(
          '/api/reports/teacher-performance?start=2028-02-30&end=2028-03-01',
        )
      ).response.status,
    ).toBe(400);
    expect(
      (
        await api(
          '/api/reports/teacher-performance?start=2028-02-07&end=2028-02-09',
          {
            ...testEnv,
            DEV_USER_EMAIL: 'not-authorized@example.test',
          },
        )
      ).response.status,
    ).toBe(403);
  });
});
