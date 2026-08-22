import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;

async function api(path: string, method = 'GET', body?: unknown) {
  const response = await worker.fetch(
    new Request(`https://app.test${path}`, {
      method,
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  );
  const payload: unknown = await response.json();
  return { response, payload };
}

function data<T>(payload: unknown): T {
  return (payload as { data: T }).data;
}

async function addAbsence(
  staffId: string,
  startDate: string,
  endDate = startDate,
  startTime: string | null = null,
  endTime: string | null = null,
) {
  return api('/api/absences', 'POST', {
    staffId,
    startDate,
    endDate,
    startTime,
    endTime,
  });
}

async function remove(
  absenceId: string,
  currentDate: string,
  scope: 'current_date' | 'entire_block',
) {
  return api(`/api/absences/${absenceId}`, 'DELETE', {
    currentDate,
    scope,
  });
}

describe('Absence and resolution lifecycle', () => {
  it('removes a one-day Absence and its generated Needs without touching another Absence', async () => {
    const date = '2026-11-02';
    const target = await addAbsence('staff_priya_nair', date);
    await addAbsence('staff_theo_wallace', date);
    const absenceId = data<{ absenceId: string }>(target.payload).absenceId;

    const result = await remove(absenceId, date, 'current_date');

    expect(result.response.status).toBe(200);
    const detail = data<{
      detail: {
        absences: Array<{ id: string; staffId: string }>;
        assignments: Array<{ absentStaff: { id: string } }>;
      };
    }>(result.payload).detail;
    expect(detail.absences).toHaveLength(1);
    expect(detail.absences[0]?.staffId).toBe('staff_theo_wallace');
    expect(
      detail.assignments.some(
        (assignment) => assignment.absentStaff.id === 'staff_priya_nair',
      ),
    ).toBe(false);
  });

  it.each([
    ['first', '2026-11-09', [['2026-11-10', '2026-11-11']]],
    ['last', '2026-11-20', [['2026-11-18', '2026-11-19']]],
    [
      'middle',
      '2026-11-24',
      [
        ['2026-11-23', '2026-11-23'],
        ['2026-11-25', '2026-11-25'],
      ],
    ],
  ] as const)(
    'removes the %s day and deterministically splits its range',
    async (_position, removedDate, expectedRanges) => {
      const ranges = {
        '2026-11-09': ['2026-11-09', '2026-11-11'],
        '2026-11-20': ['2026-11-18', '2026-11-20'],
        '2026-11-24': ['2026-11-23', '2026-11-25'],
      } as const;
      const [startDate, endDate] = ranges[removedDate];
      const created = await addAbsence('staff_priya_nair', startDate, endDate);
      const absenceId = data<{ absenceId: string }>(created.payload).absenceId;

      expect(
        (await remove(absenceId, removedDate, 'current_date')).response.status,
      ).toBe(200);
      const rows = await testEnv.DB.prepare(
        `SELECT start_date, end_date FROM absences
        WHERE staff_id = 'staff_priya_nair' AND start_date >= ? AND end_date <= ?
        ORDER BY start_date`,
      )
        .bind(startDate, endDate)
        .all<{ start_date: string; end_date: string }>();
      expect(rows.results.map((row) => [row.start_date, row.end_date])).toEqual(
        expectedRanges,
      );
      const removedAssignments = await testEnv.DB.prepare(
        `SELECT COUNT(*) AS count FROM assignments a
        JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
       WHERE p.date = ? AND a.absence_id IN
             (SELECT id FROM absences WHERE staff_id = 'staff_priya_nair')`,
      )
        .bind(removedDate)
        .first<{ count: number }>();
      expect(removedAssignments?.count).toBe(0);
    },
  );

  it('removes an entire multi-day block and rejects changes spanning a finalized plan', async () => {
    const created = await addAbsence(
      'staff_theo_wallace',
      '2026-12-07',
      '2026-12-09',
    );
    const absenceId = data<{ absenceId: string }>(created.payload).absenceId;
    await testEnv.DB.prepare(
      `UPDATE daily_sub_plans
          SET status = 'finalized', finalized_by = 'user_local_admin',
              finalized_at = '2026-08-21T12:00:00.000Z'
        WHERE date = '2026-12-08'`,
    ).run();

    const blocked = await remove(absenceId, '2026-12-07', 'entire_block');
    expect(blocked.response.status).toBe(409);
    expect(
      await testEnv.DB.prepare('SELECT id FROM absences WHERE id = ?')
        .bind(absenceId)
        .first(),
    ).not.toBeNull();

    await testEnv.DB.prepare(
      `UPDATE daily_sub_plans
          SET status = 'draft', finalized_by = NULL, finalized_at = NULL
        WHERE date = '2026-12-08'`,
    ).run();
    expect(
      (await remove(absenceId, '2026-12-07', 'entire_block')).response.status,
    ).toBe(200);
    expect(
      await testEnv.DB.prepare('SELECT id FROM absences WHERE id = ?')
        .bind(absenceId)
        .first(),
    ).toBeNull();
  });

  it('rejects duplicate/full-day and overlapping partial Absences but permits adjacent intervals', async () => {
    const date = '2026-12-14';
    expect(
      (await addAbsence('staff_priya_nair', date, date, '08:00', '09:00'))
        .response.status,
    ).toBe(201);
    expect(
      (await addAbsence('staff_priya_nair', date, date, '08:30', '09:30'))
        .response.status,
    ).toBe(409);
    expect(
      (await addAbsence('staff_priya_nair', date, date, '09:00', '10:00'))
        .response.status,
    ).toBe(201);
    expect((await addAbsence('staff_priya_nair', date)).response.status).toBe(
      409,
    );
    expect(
      (await addAbsence('staff_priya_nair', date, '2026-12-16')).response
        .status,
    ).toBe(409);
  });

  it('locks A/B after an Absence even when no Need was generated', async () => {
    await testEnv.DB.prepare(
      `INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub)
       VALUES ('staff_no_schedule', 'No Schedule', 'teacher', 1, 1, 0)`,
    ).run();
    const date = '2026-12-21';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await addAbsence('staff_no_schedule', date);

    const changed = await api('/api/plans/ensure', 'POST', {
      date,
      dayType: 'B',
    });
    expect(changed.response.status).toBe(409);
    expect(
      await testEnv.DB.prepare(
        `SELECT COUNT(*) AS count FROM assignments a
          JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
         WHERE p.date = ?`,
      )
        .bind(date)
        .first<{ count: number }>(),
    ).toMatchObject({ count: 0 });
  });

  it('clears direct and split primary resolution state while preserving the Note', async () => {
    const date = '2026-12-22';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await addAbsence('staff_jordan_kim', date);
    const plan = data<{
      detail: {
        assignments: Array<{ id: string; responsibilityType: string }>;
      };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    const assignment = plan.assignments.find(
      (item) => item.responsibilityType === 'instruction',
    );
    expect(assignment).toBeTruthy();
    const path = `/api/assignments/${assignment!.id}/resolve`;
    await api(path, 'POST', {
      action: 'update_details',
      roomId: null,
      note: 'Keep this note.',
    });
    await api(path, 'POST', {
      action: 'split',
      assignAnyway: true,
      segments: [
        {
          staffId: 'staff_riley_quinn',
          startTime: '08:00',
          endTime: '08:20',
        },
        {
          staffId: 'staff_casey_brooks',
          startTime: '08:20',
          endTime: '08:50',
        },
      ],
    });

    const cleared = await api(path, 'POST', { action: 'clear_resolution' });
    expect(cleared.response.status).toBe(200);
    const after = data<{
      detail: {
        assignments: Array<{
          id: string;
          status: string;
          resolutionType: string | null;
          resolutionDetails: unknown;
          segments: unknown[];
        }>;
      };
    }>(cleared.payload).detail.assignments.find(
      (item) => item.id === assignment!.id,
    );
    expect(after).toMatchObject({
      status: 'unresolved',
      resolutionType: null,
      resolutionDetails: { note: 'Keep this note.' },
      segments: [],
    });
  });

  it('groups a shared duty by its block room and recomputes operational counts after removal', async () => {
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO schedule_entries
           (id, schedule_version_id, staff_id, day_type, start_time, end_time,
            activity_type, category, description, room_id, requires_sub)
         VALUES
           ('pilot_shared_avery', 'schedule_2026_fall', 'staff_avery_bennett',
            'ALL', '12:30', '13:00', 'duty', 'LUNCH', 'EL Lunch', 'room_pri_101', 1),
           ('pilot_shared_jordan', 'schedule_2026_fall', 'staff_jordan_kim',
            'ALL', '12:30', '13:00', 'duty', 'LUNCH', 'EL Lunch', 'room_pri_101', 1)`,
      ),
    ]);
    const date = '2026-12-23';
    const avery = await addAbsence('staff_avery_bennett', date);
    await addAbsence('staff_jordan_kim', date);
    const averyId = data<{ absenceId: string }>(avery.payload).absenceId;
    const before = data<{
      detail: {
        assignments: Array<{
          description: string;
          sharedResponsibilityKey: string | null;
        }>;
        summary: { assignments: number; assigned: number; unresolved: number };
      };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    const siblings = before.assignments.filter(
      (assignment) => assignment.description === 'EL Lunch',
    );
    expect(siblings).toHaveLength(2);
    expect(
      new Set(siblings.map((item) => item.sharedResponsibilityKey)).size,
    ).toBe(1);
    expect(before.summary).toMatchObject({
      assignments: before.assignments.length - 1,
    });

    const after = data<{
      detail: {
        assignments: Array<{
          description: string;
          status: string;
          resolutionType: string | null;
          assignedStaff: { id: string } | null;
        }>;
        summary: { assignments: number; assigned: number; unresolved: number };
      };
    }>((await remove(averyId, date, 'entire_block')).payload).detail;
    expect(
      after.assignments.find(
        (assignment) => assignment.description === 'EL Lunch',
      ),
    ).toMatchObject({
      status: 'assigned',
      resolutionType: 'solo_coverage',
      assignedStaff: { id: 'staff_avery_bennett' },
    });
    expect(after.summary.assigned + after.summary.unresolved).toBe(
      after.summary.assignments,
    );
  });

  it('persists the latest message edit before finalization', async () => {
    const date = '2026-12-28';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await addAbsence('staff_priya_nair', date);
    const initial = data<{
      detail: { assignments: Array<{ id: string }> };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    for (const assignment of initial.assignments) {
      await api(`/api/assignments/${assignment.id}/resolve`, 'POST', {
        action: 'assign',
        staffId: 'staff_riley_quinn',
        assignAnyway: false,
      });
    }
    await api(`/api/plans/${date}/message/regenerate`, 'POST', {});
    const editedHtml = '<p><strong>Latest administrator edit</strong></p>';
    expect(
      (await api(`/api/plans/${date}/message`, 'PATCH', { editedHtml }))
        .response.status,
    ).toBe(200);
    const finalized = await api(`/api/plans/${date}/status`, 'POST', {
      status: 'finalized',
    });
    expect(finalized.response.status).toBe(200);
    expect(
      data<{
        detail: {
          plan: { status: string };
          message: { editedHtml: string };
        };
      }>(finalized.payload).detail,
    ).toMatchObject({
      plan: { status: 'finalized' },
      message: { editedHtml },
    });
  });
});
