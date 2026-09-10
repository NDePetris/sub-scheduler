import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;

interface CalendarInput {
  expectedDayType: 'A' | 'B' | null;
  isSchoolDay: boolean;
  isBlackoutDay: boolean;
  expectsSpecialSchedule: boolean;
  label: string | null;
}

async function request(
  path: string,
  init: RequestInit = {},
  environment: Env = testEnv,
) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await worker.fetch(
    new Request(`https://app.test${path}`, { ...init, headers }),
    environment,
  );
  return { response, payload: await response.json() };
}

function normalDay(overrides: Partial<CalendarInput> = {}): CalendarInput {
  return {
    expectedDayType: 'A',
    isSchoolDay: true,
    isBlackoutDay: false,
    expectsSpecialSchedule: false,
    label: 'Configured day',
    ...overrides,
  };
}

describe('calendar administration API', () => {
  it('upserts only the target date and writes manual provenance', async () => {
    const before = '2031-09-08';
    const target = '2031-09-09';
    const after = '2031-09-10';
    for (const date of [before, after]) {
      const result = await request(`/api/calendar/${date}`, {
        method: 'PUT',
        body: JSON.stringify(normalDay({ label: date })),
      });
      expect(result.response.status).toBe(200);
    }

    const created = await request(`/api/calendar/${target}`, {
      method: 'PUT',
      body: JSON.stringify(normalDay()),
    });
    expect(created.response.status).toBe(200);
    expect(
      (created.payload as { data: { date: unknown } }).data.date,
    ).toMatchObject({
      date: target,
      sourceType: 'manual_admin',
      updatedBy: 'user_local_admin',
      specialSchedule: null,
      specialScheduleExpectedWarning: false,
    });

    const updated = await request(`/api/calendar/${target}`, {
      method: 'PUT',
      body: JSON.stringify(
        normalDay({ expectedDayType: 'B', label: 'Updated' }),
      ),
    });
    expect(updated.response.status).toBe(200);
    expect(
      (
        updated.payload as {
          data: { date: { expectedDayType: string; label: string } };
        }
      ).data.date,
    ).toMatchObject({
      expectedDayType: 'B',
      label: 'Updated',
    });

    const listed = await request(`/api/calendar?start=${before}&end=${after}`);
    expect(listed.response.status).toBe(200);
    expect(
      (
        listed.payload as {
          data: { range: unknown; dates: Array<{ date: string }> };
        }
      ).data,
    ).toMatchObject({
      range: { startDate: before, endDate: after },
    });
    expect(
      (
        listed.payload as { data: { dates: Array<{ date: string }> } }
      ).data.dates.map((date) => date.date),
    ).toEqual([before, target, after]);
  });

  it('deletes only the explicit target row and returns it to fallback', async () => {
    const target = '2031-09-11';
    const neighbor = '2031-09-12';
    await request(`/api/calendar/${target}`, {
      method: 'PUT',
      body: JSON.stringify(normalDay()),
    });
    await request(`/api/calendar/${neighbor}`, {
      method: 'PUT',
      body: JSON.stringify(normalDay()),
    });

    const deleted = await request(`/api/calendar/${target}`, {
      method: 'DELETE',
    });
    expect(deleted.response.status).toBe(200);
    const listed = await request(
      `/api/calendar?start=${target}&end=${neighbor}`,
    );
    expect(
      (
        listed.payload as { data: { dates: Array<{ date: string }> } }
      ).data.dates.map((date) => date.date),
    ).toEqual([neighbor]);
  });

  it('validates ranges and coherent No School state', async () => {
    expect((await request('/api/calendar')).response.status).toBe(400);
    expect(
      (await request('/api/calendar?start=2031-09-12&end=2031-09-11')).response
        .status,
    ).toBe(400);
    expect(
      (await request('/api/calendar?start=2031-02-30&end=2031-03-01')).response
        .status,
    ).toBe(400);
    expect(
      (
        await request('/api/calendar/2031-09-13', {
          method: 'PUT',
          body: JSON.stringify(
            normalDay({
              isSchoolDay: false,
              isBlackoutDay: true,
              expectsSpecialSchedule: true,
            }),
          ),
        })
      ).response.status,
    ).toBe(400);
    expect(
      (
        await request('/api/calendar/not-a-date', {
          method: 'PUT',
          body: JSON.stringify(normalDay()),
        })
      ).response.status,
    ).toBe(400);
  });

  it('returns a non-blocking warning until an active Special Schedule exists', async () => {
    const date = '2031-09-15';
    const saved = await request(`/api/calendar/${date}`, {
      method: 'PUT',
      body: JSON.stringify(normalDay({ expectsSpecialSchedule: true })),
    });
    expect(
      (
        saved.payload as {
          data: { date: { specialScheduleExpectedWarning: boolean } };
        }
      ).data.date.specialScheduleExpectedWarning,
    ).toBe(true);

    await testEnv.DB.prepare(
      `INSERT INTO special_schedules (id, date, name, status, created_by)
       VALUES ('calendar_admin_special', ?, 'Calendar administration special', 'active', 'user_local_admin')`,
    )
      .bind(date)
      .run();
    const listed = await request(`/api/calendar?start=${date}&end=${date}`);
    expect(
      (
        listed.payload as {
          data: {
            dates: Array<{
              specialSchedule: unknown;
              specialScheduleExpectedWarning: boolean;
            }>;
          };
        }
      ).data.dates[0],
    ).toMatchObject({
      specialSchedule: {
        id: 'calendar_admin_special',
        status: 'active',
      },
      specialScheduleExpectedWarning: false,
    });
  });

  it('remains protected by the administrator allowlist', async () => {
    const result = await request(
      '/api/calendar?start=2031-09-01&end=2031-09-30',
      {},
      {
        ...testEnv,
        DEV_USER_EMAIL: 'not-authorized@example.test',
      },
    );
    expect(result.response.status).toBe(403);
  });

  it('changes reporting calendar facts without changing fallback after deletion', async () => {
    const noSchool = '2031-10-06';
    const blackout = '2031-10-07';
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub)
         VALUES ('calendar_reporting_teacher', 'Calendar Reporting Teacher', 'teacher', 1, 1, 0)`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO absences (id, staff_id, start_date, end_date, start_time, end_time, created_by, updated_by)
         VALUES
           ('calendar_reporting_no_school', 'calendar_reporting_teacher', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin'),
           ('calendar_reporting_blackout', 'calendar_reporting_teacher', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin')`,
      ).bind(noSchool, noSchool, blackout, blackout),
    ]);
    await request(`/api/calendar/${noSchool}`, {
      method: 'PUT',
      body: JSON.stringify(
        normalDay({
          expectedDayType: null,
          isSchoolDay: false,
          label: 'No School',
        }),
      ),
    });
    await request(`/api/calendar/${blackout}`, {
      method: 'PUT',
      body: JSON.stringify(
        normalDay({ isBlackoutDay: true, label: 'Blackout' }),
      ),
    });

    const reported = await request(
      `/api/reports/teacher-performance?start=${noSchool}&end=${blackout}`,
    );
    const report = reported.payload as {
      data: {
        calendar: { complete: boolean; missingWeekdayDates: number };
        teachers: Array<{
          staffId: string;
          absences: number;
          blackoutDays: number;
        }>;
      };
    };
    expect(report.data.calendar).toEqual({
      complete: true,
      missingWeekdayDates: 0,
    });
    expect(
      report.data.teachers.find(
        (teacher) => teacher.staffId === 'calendar_reporting_teacher',
      ),
    ).toMatchObject({ absences: 1, blackoutDays: 1 });

    await request(`/api/calendar/${blackout}`, { method: 'DELETE' });
    const fallback = await request(
      `/api/reports/teacher-performance?start=${noSchool}&end=${blackout}`,
    );
    expect(
      (
        fallback.payload as {
          data: {
            calendar: { complete: boolean; missingWeekdayDates: number };
          };
        }
      ).data.calendar,
    ).toEqual({ complete: false, missingWeekdayDates: 1 });
  });

  it('does not rewrite finalized Daily Sub Plan schedule references', async () => {
    const date = '2031-10-08';
    await testEnv.DB.prepare(
      `INSERT INTO daily_sub_plans
         (id, date, day_type, schedule_version_id, status, created_by, updated_by, finalized_by, finalized_at)
       VALUES ('calendar_finalized_plan', ?, 'A', 'schedule_2026_fall', 'finalized',
               'user_local_admin', 'user_local_admin', 'user_local_admin', '2031-10-08T18:00:00.000Z')`,
    )
      .bind(date)
      .run();

    await request(`/api/calendar/${date}`, {
      method: 'PUT',
      body: JSON.stringify(
        normalDay({
          expectedDayType: null,
          isSchoolDay: false,
          label: 'Retrospective correction',
        }),
      ),
    });
    const plan = await testEnv.DB.prepare(
      `SELECT schedule_version_id, special_schedule_id, status, finalized_at
         FROM daily_sub_plans WHERE id = 'calendar_finalized_plan'`,
    ).first<{
      schedule_version_id: string | null;
      special_schedule_id: string | null;
      status: string;
      finalized_at: string | null;
    }>();
    expect(plan).toEqual({
      schedule_version_id: 'schedule_2026_fall',
      special_schedule_id: null,
      status: 'finalized',
      finalized_at: '2031-10-08T18:00:00.000Z',
    });
  });
});
