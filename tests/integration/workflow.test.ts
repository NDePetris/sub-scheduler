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

describe('persisted MVP workflow', () => {
  it('applies valid defaults, resolves non-class needs, generates a message, and preserves finalization on reopen', async () => {
    const date = '2026-09-08';
    expect(
      (await api('/api/plans/ensure', 'POST', { date, dayType: 'B' })).response
        .status,
    ).toBe(200);
    expect(
      (
        await api('/api/absences', 'POST', {
          staffId: 'staff_avery_bennett',
          startDate: date,
          endDate: date,
          startTime: null,
          endTime: null,
        })
      ).response.status,
    ).toBe(201);

    const planResult = await api(`/api/plans/${date}`);
    const plan = data<{
      detail: {
        assignments: Array<Record<string, unknown>>;
        summary: { unresolved: number };
      };
    }>(planResult.payload).detail;
    expect(plan.summary.unresolved).toBe(0);
    const primary = plan.assignments.find(
      (assignment) => assignment.description === 'Primary Literacy',
    );
    const lunch = plan.assignments.find(
      (assignment) => assignment.description === 'Lunch Duty',
    );
    expect(primary).toMatchObject({
      status: 'assigned',
      isDefault: true,
      assignedStaff: { id: 'staff_morgan_ellis' },
    });
    expect(lunch).toMatchObject({
      status: 'intentionally_uncovered',
      isDefault: true,
    });

    const regenerated = await api(
      `/api/plans/${date}/message/regenerate`,
      'POST',
      {},
    );
    expect(
      data<{ detail: { message: { editedText: string } } }>(regenerated.payload)
        .detail.message.editedText,
    ).toContain('Primary Literacy');
    const edited = await api(`/api/plans/${date}/message`, 'PATCH', {
      editedText: 'Administrator-edited message',
    });
    expect(
      data<{ detail: { message: { editedText: string } } }>(edited.payload)
        .detail.message.editedText,
    ).toBe('Administrator-edited message');
    const rebuilt = await api(
      `/api/plans/${date}/message/regenerate`,
      'POST',
      {},
    );
    expect(
      data<{ detail: { message: { editedText: string } } }>(rebuilt.payload)
        .detail.message.editedText,
    ).toContain('Primary Literacy');
    expect(
      (await api(`/api/plans/${date}/status`, 'POST', { status: 'finalized' }))
        .response.status,
    ).toBe(200);
    const reopened = await api(`/api/plans/${date}/status`, 'POST', {
      status: 'draft',
    });
    const reopenedPlan = data<{
      detail: { plan: { status: string; finalizedAt: string | null } };
    }>(reopened.payload).detail.plan;
    expect(reopenedPlan.status).toBe('draft');
    expect(reopenedPlan.finalizedAt).toBeTruthy();
  });

  it('limits partial-day generation to overlapping responsibility time', async () => {
    const date = '2026-09-09';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'B' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_jordan_kim',
      startDate: date,
      endDate: date,
      startTime: '10:00',
      endTime: '13:30',
    });
    const result = await api(`/api/plans/${date}`);
    const assignments = data<{
      detail: { assignments: Array<{ startTime: string; endTime: string }> };
    }>(result.payload).detail.assignments;
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      startTime: '10:00',
      endTime: '10:30',
    });
  });

  it('retains and invalidates a default when the preferred teacher becomes absent', async () => {
    const date = '2026-09-10';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_avery_bennett',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    await api('/api/absences', 'POST', {
      staffId: 'staff_morgan_ellis',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const result = await api(`/api/plans/${date}`);
    const assignments = data<{
      detail: {
        assignments: Array<{
          id: string;
          description: string;
          status: string;
          defaultAction: unknown;
          conflictExplanation: string | null;
        }>;
      };
    }>(result.payload).detail.assignments;
    const affected = assignments.find(
      (assignment) => assignment.description === 'Primary Literacy',
    );
    expect(affected).toMatchObject({
      status: 'unresolved',
      conflictExplanation: 'Morgan Ellis is also absent.',
    });
    expect(affected?.defaultAction).toBeTruthy();

    expect(affected).toBeTruthy();
    const affectedId = affected?.id ?? '';
    const candidatesResult = await api(
      `/api/assignments/${encodeURIComponent(affectedId)}/candidates`,
    );
    const candidates = data<{
      candidates: Array<{
        id: string;
        isSchoolSub: boolean;
        conflicts: string[];
      }>;
    }>(candidatesResult.payload).candidates;
    expect(candidates[0]).toMatchObject({
      id: 'staff_riley_quinn',
      isSchoolSub: true,
    });
    const preferred = candidates.find(
      (candidate) => candidate.id === 'staff_morgan_ellis',
    );
    expect(preferred?.conflicts.join(' ')).toContain('absent');
    const rejected = await api(
      `/api/assignments/${encodeURIComponent(affectedId)}/resolve`,
      'POST',
      { action: 'assign', staffId: 'staff_morgan_ellis', assignAnyway: false },
    );
    expect(rejected.response.status).toBe(409);
    const overridden = await api(
      `/api/assignments/${encodeURIComponent(affectedId)}/resolve`,
      'POST',
      { action: 'assign', staffId: 'staff_morgan_ellis', assignAnyway: true },
    );
    expect(overridden.response.status).toBe(200);
    const audit = await testEnv.DB.prepare(
      `SELECT resolution_type, override_acknowledged_at, override_acknowledged_by
         FROM assignments WHERE id = ?`,
    )
      .bind(affectedId)
      .first<{
        resolution_type: string;
        override_acknowledged_at: string | null;
        override_acknowledged_by: string | null;
      }>();
    expect(audit).toMatchObject({
      resolution_type: 'manual_override',
      override_acknowledged_by: 'user_local_admin',
    });
    expect(audit?.override_acknowledged_at).toBeTruthy();
  });

  it('expands a multi-day absence into independently pinned daily plans', async () => {
    const result = await api('/api/absences', 'POST', {
      staffId: 'staff_priya_nair',
      startDate: '2026-09-14',
      endDate: '2026-09-16',
      startTime: null,
      endTime: null,
    });
    expect(result.response.status).toBe(201);
    for (const date of ['2026-09-14', '2026-09-15', '2026-09-16']) {
      const planResult = await api(`/api/plans/${date}`);
      const detail = data<{
        detail: {
          plan: { date: string; scheduleVersionId: string };
          absences: unknown[];
        };
      }>(planResult.payload).detail;
      expect(detail.plan).toMatchObject({
        date,
        scheduleVersionId: 'schedule_2026_fall',
      });
      expect(detail.absences).toHaveLength(1);
    }
  });

  it('creates and persists a valid 40/10 split', async () => {
    const date = '2026-09-11';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_jordan_kim',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const result = await api(`/api/plans/${date}`);
    const assignments = data<{
      detail: {
        assignments: Array<{ id: string; startTime: string; endTime: string }>;
      };
    }>(result.payload).detail.assignments;
    const assignment = assignments.find((item) => item.startTime === '08:00');
    expect(assignment).toBeTruthy();
    const resolved = await api(
      `/api/assignments/${encodeURIComponent(assignment!.id)}/resolve`,
      'POST',
      {
        action: 'split',
        assignAnyway: true,
        segments: [
          {
            staffId: 'staff_riley_quinn',
            startTime: '08:00',
            endTime: '08:40',
          },
          {
            staffId: 'staff_casey_brooks',
            startTime: '08:40',
            endTime: '08:50',
          },
        ],
      },
    );
    const updated = data<{
      detail: {
        assignments: Array<{ id: string; status: string; segments: unknown[] }>;
      };
    }>(resolved.payload).detail.assignments.find(
      (item) => item.id === assignment!.id,
    );
    expect(updated).toMatchObject({ status: 'assigned' });
    expect(updated?.segments).toHaveLength(2);
  });

  it('uses a one-day Special Schedule without changing the following day', async () => {
    const date = '2026-10-05';
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO special_schedules
           (id, date, name, status, created_by, activated_by, activated_at)
         VALUES ('special_acceptance', ?, 'Assembly Day', 'active',
                 'user_local_admin', 'user_local_admin', '2026-08-13T12:00:00.000Z')`,
      ).bind(date),
      testEnv.DB.prepare(
        `INSERT INTO special_schedule_entries (
           id, special_schedule_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, room_id, requires_sub
         ) VALUES (
           'special_entry_acceptance', 'special_acceptance', 'staff_avery_bennett',
           'ALL', '09:00', '10:00', 'instruction', 'PRI', 'Assembly Class',
           'room_pri_101', 1
         )`,
      ),
    ]);
    const special = await api('/api/plans/ensure', 'POST', {
      date,
      dayType: 'A',
    });
    expect(
      data<{ detail: { plan: { specialScheduleId: string | null } } }>(
        special.payload,
      ).detail.plan.specialScheduleId,
    ).toBe('special_acceptance');
    const normal = await api('/api/plans/ensure', 'POST', {
      date: '2026-10-06',
      dayType: 'B',
    });
    expect(
      data<{ detail: { plan: { specialScheduleId: string | null } } }>(
        normal.payload,
      ).detail.plan.specialScheduleId,
    ).toBeNull();
  });
});
