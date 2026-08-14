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

    const finalizedEdit = await api(`/api/plans/${date}/message`, 'PATCH', {
      editedText: 'This must not be saved while finalized.',
    });
    expect(finalizedEdit.response.status).toBe(409);
    expect(
      (finalizedEdit.payload as { error: { code: string } }).error.code,
    ).toBe('plan_finalized');

    const finalizedRegenerate = await api(
      `/api/plans/${date}/message/regenerate`,
      'POST',
      {},
    );
    expect(finalizedRegenerate.response.status).toBe(409);
    expect(
      (finalizedRegenerate.payload as { error: { code: string } }).error.code,
    ).toBe('plan_finalized');

    const reopened = await api(`/api/plans/${date}/status`, 'POST', {
      status: 'draft',
    });
    const reopenedPlan = data<{
      detail: { plan: { status: string; finalizedAt: string | null } };
    }>(reopened.payload).detail.plan;
    expect(reopenedPlan.status).toBe('draft');
    expect(reopenedPlan.finalizedAt).toBeTruthy();

    const reopenedEdit = await api(`/api/plans/${date}/message`, 'PATCH', {
      editedText: 'Editing is restored after reopening.',
    });
    expect(reopenedEdit.response.status).toBe(200);
    const reopenedRegenerate = await api(
      `/api/plans/${date}/message/regenerate`,
      'POST',
      {},
    );
    expect(reopenedRegenerate.response.status).toBe(200);
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
          assignedStaff: { id: string } | null;
          isDefault: boolean;
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
      assignedStaff: null,
      isDefault: false,
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

  it('returns batched candidate availability and rolling workload data used by the resolution UI', async () => {
    const targetDate = '2027-01-14';
    const priorDate = '2027-01-12';
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub)
         VALUES
           ('staff_candidate_plan', 'Candidate Plan', 'teacher', 1, 1, 0),
           ('staff_candidate_low', 'Candidate Lower Burden', 'teacher', 1, 1, 0),
           ('staff_candidate_admin', 'Candidate Admin', 'administrator', 1, 1, 0),
           ('staff_candidate_manual', 'Candidate Manual', 'teacher', 1, 1, 0),
           ('staff_candidate_threshold', 'Candidate Threshold', 'teacher', 1, 1, 0),
           ('staff_candidate_conflict', 'Candidate Conflict', 'teacher', 1, 1, 0)`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO schedule_entries (
           id, schedule_version_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, room_id, requires_sub
         ) VALUES
           ('candidate_plan_0900', 'schedule_2026_fall', 'staff_candidate_plan', 'A', '09:00', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_plan_0940', 'schedule_2026_fall', 'staff_candidate_plan', 'A', '09:40', '10:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_low_0900', 'schedule_2026_fall', 'staff_candidate_low', 'A', '09:00', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_low_0940', 'schedule_2026_fall', 'staff_candidate_low', 'A', '09:40', '10:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_admin_0900', 'schedule_2026_fall', 'staff_candidate_admin', 'A', '09:00', '10:20', 'admin', 'PLAN_ADMIN', 'Admin', NULL, 0),
           ('candidate_conflict_plan', 'schedule_2026_fall', 'staff_candidate_conflict', 'A', '09:00', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_conflict_class', 'schedule_2026_fall', 'staff_candidate_conflict', 'A', '09:00', '09:40', 'instruction', 'INT', 'INT Math', 'room_int_301', 1),
           ('candidate_threshold_0900', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '09:00', '09:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_threshold_1000', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '10:00', '10:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_threshold_1040', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '10:40', '11:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_threshold_1120', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '11:20', '12:00', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_threshold_1200', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '12:00', '12:40', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_threshold_1240', 'schedule_2026_fall', 'staff_candidate_threshold', 'A', '12:40', '13:20', 'plan', 'PLAN_ADMIN', 'PLAN', NULL, 0),
           ('candidate_target_whole_source', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '09:00', '09:40', 'instruction', 'PRI', 'Target Whole', 'room_pri_101', 1),
           ('candidate_target_partial_source', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '09:00', '09:20', 'instruction', 'PRI', 'Target Partial', 'room_pri_101', 1),
           ('candidate_target_span_source', 'schedule_2026_fall', 'staff_avery_bennett', 'A', '09:00', '09:50', 'instruction', 'PRI', 'Target Span', 'room_pri_101', 1),
           ('candidate_prior_direct_source', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '09:00', '09:40', 'instruction', 'EL', 'Prior Direct', 'room_el_204', 1),
           ('candidate_prior_split_source', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '09:40', '10:20', 'instruction', 'EL', 'Prior Split', 'room_el_204', 1),
           ('candidate_prior_threshold_source', 'schedule_2026_fall', 'staff_jordan_kim', 'A', '10:00', '13:10', 'instruction', 'EL', 'Prior Threshold', 'room_el_204', 1)`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, special_schedule_id,
           status, created_by, updated_by
         ) VALUES
           ('candidate_target_plan', ?, 'A', 'schedule_2026_fall', NULL, 'draft', 'user_local_admin', 'user_local_admin'),
           ('candidate_prior_plan', ?, 'A', 'schedule_2026_fall', NULL, 'draft', 'user_local_admin', 'user_local_admin')`,
      ).bind(targetDate, priorDate),
      testEnv.DB.prepare(
        `INSERT INTO absences (
           id, staff_id, start_date, end_date, start_time, end_time,
           created_by, updated_by
         ) VALUES
           ('candidate_target_absence', 'staff_avery_bennett', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin'),
           ('candidate_prior_absence', 'staff_jordan_kim', ?, ?, NULL, NULL, 'user_local_admin', 'user_local_admin')`,
      ).bind(targetDate, targetDate, priorDate, priorDate),
      testEnv.DB.prepare(
        `INSERT INTO default_sub_plan_actions (
           id, default_sub_plan_id, sequence, start_time, end_time,
           action_type, assigned_staff_id, room_id, details_json
         ) VALUES (
           'candidate_default_action', 'default_avery_shared', 99,
           '09:00', '09:40', 'teacher_covers', 'staff_candidate_plan', NULL, NULL
         )`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO assignments (
           id, daily_sub_plan_id, absence_id, source_schedule_entry_id,
           source_special_schedule_entry_id, start_time, end_time,
           responsibility_type, description, room_id, default_action_id,
           assigned_staff_id, resolution_type, status, is_default, updated_by
         ) VALUES
           ('candidate_target_whole', 'candidate_target_plan', 'candidate_target_absence', 'candidate_target_whole_source', NULL, '09:00', '09:40', 'instruction', 'Target Whole', 'room_pri_101', 'candidate_default_action', NULL, NULL, 'unresolved', 0, 'user_local_admin'),
           ('candidate_target_partial', 'candidate_target_plan', 'candidate_target_absence', 'candidate_target_partial_source', NULL, '09:00', '09:20', 'instruction', 'Target Partial', 'room_pri_101', NULL, NULL, NULL, 'unresolved', 0, 'user_local_admin'),
           ('candidate_target_span', 'candidate_target_plan', 'candidate_target_absence', 'candidate_target_span_source', NULL, '09:00', '09:50', 'instruction', 'Target Span', 'room_pri_101', NULL, NULL, NULL, 'unresolved', 0, 'user_local_admin'),
           ('candidate_prior_direct', 'candidate_prior_plan', 'candidate_prior_absence', 'candidate_prior_direct_source', NULL, '09:00', '09:40', 'instruction', 'Prior Direct', 'room_el_204', NULL, 'staff_candidate_plan', 'teacher_cover', 'assigned', 0, 'user_local_admin'),
           ('candidate_prior_split', 'candidate_prior_plan', 'candidate_prior_absence', 'candidate_prior_split_source', NULL, '09:40', '10:20', 'instruction', 'Prior Split', 'room_el_204', NULL, NULL, 'split_coverage', 'assigned', 0, 'user_local_admin'),
           ('candidate_prior_threshold', 'candidate_prior_plan', 'candidate_prior_absence', 'candidate_prior_threshold_source', NULL, '10:00', '13:10', 'instruction', 'Prior Threshold', 'room_el_204', NULL, 'staff_candidate_threshold', 'teacher_cover', 'assigned', 0, 'user_local_admin')`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO assignment_segments (
           id, assignment_id, start_time, end_time, staff_id, sequence
         ) VALUES
           ('candidate_prior_split_first', 'candidate_prior_split', '09:40', '10:00', 'staff_candidate_plan', 0),
           ('candidate_prior_split_second', 'candidate_prior_split', '10:00', '10:20', 'staff_casey_brooks', 1)`,
      ),
    ]);

    type Candidate = {
      id: string;
      availability: string;
      availabilitySource: string;
      conflicts: string[];
      warnings: string[];
      currentBurden: number;
      proposedBurden: number;
      projectedBurden: number;
      windowDays: number;
    };
    async function candidatesFor(id: string) {
      const result = await api(
        `/api/assignments/${encodeURIComponent(id)}/candidates`,
      );
      expect(result.response.status).toBe(200);
      return data<{ candidates: Candidate[] }>(result.payload).candidates;
    }

    const whole = await candidatesFor('candidate_target_whole');
    expect(whole[0]).toMatchObject({
      id: 'staff_candidate_plan',
      availability: 'default',
      currentBurden: 1.5,
      proposedBurden: 1,
      projectedBurden: 2.5,
      windowDays: 7,
    });
    expect(whole[1]).toMatchObject({
      id: 'staff_riley_quinn',
      availability: 'school_sub',
      currentBurden: 0,
      proposedBurden: 0,
    });

    const partial = await candidatesFor('candidate_target_partial');
    const candidatePlan = partial.find(
      (candidate) => candidate.id === 'staff_candidate_plan',
    );
    const threshold = partial.find(
      (candidate) => candidate.id === 'staff_candidate_threshold',
    );
    const admin = partial.find(
      (candidate) => candidate.id === 'staff_candidate_admin',
    );
    const schoolSub = partial.find(
      (candidate) => candidate.id === 'staff_riley_quinn',
    );
    const manual = partial.find(
      (candidate) => candidate.id === 'staff_candidate_manual',
    );
    const conflicted = partial.find(
      (candidate) => candidate.id === 'staff_candidate_conflict',
    );
    expect(candidatePlan).toMatchObject({
      availability: 'plan',
      currentBurden: 1.5,
      proposedBurden: 0.5,
      projectedBurden: 2,
    });
    expect(threshold).toMatchObject({
      availability: 'plan',
      currentBurden: 4.75,
      proposedBurden: 0.5,
      projectedBurden: 5.25,
    });
    expect(threshold?.warnings.join(' ')).toContain('5.25');
    expect(admin).toMatchObject({
      availability: 'admin',
      availabilitySource: 'Admin',
      proposedBurden: 0,
    });
    expect(schoolSub).toMatchObject({
      availability: 'school_sub',
      currentBurden: 0,
      proposedBurden: 0,
    });
    expect(manual).toMatchObject({
      availability: 'manual',
      warnings: [],
    });
    expect(conflicted?.conflicts).toContain(
      'Scheduled conflict: INT Math, 09:00–09:40.',
    );
    expect(
      partial.findIndex((candidate) => candidate.id === 'staff_candidate_low'),
    ).toBeLessThan(
      partial.findIndex((candidate) => candidate.id === 'staff_candidate_plan'),
    );
    expect(
      partial.findIndex(
        (candidate) => candidate.id === 'staff_candidate_admin',
      ),
    ).toBeLessThan(
      partial.findIndex(
        (candidate) => candidate.id === 'staff_candidate_conflict',
      ),
    );

    const spanning = await candidatesFor('candidate_target_span');
    expect(
      spanning.find((candidate) => candidate.id === 'staff_candidate_plan'),
    ).toMatchObject({
      currentBurden: 1.5,
      proposedBurden: 1.25,
      projectedBurden: 2.75,
    });

    await testEnv.DB.prepare(
      `UPDATE assignments
          SET assigned_staff_id = 'staff_candidate_plan',
              resolution_type = 'teacher_cover', status = 'assigned'
        WHERE id = 'candidate_target_whole'`,
    ).run();
    const reassignment = await candidatesFor('candidate_target_whole');
    expect(
      reassignment.find((candidate) => candidate.id === 'staff_candidate_plan'),
    ).toMatchObject({ currentBurden: 1.5, projectedBurden: 2.5 });
    const detail = data<{
      detail: {
        assignments: Array<{ id: string; resolutionSource: string | null }>;
      };
    }>((await api(`/api/plans/${targetDate}`)).payload).detail;
    expect(
      detail.assignments.find(
        (assignment) => assignment.id === 'candidate_target_whole',
      ),
    ).toMatchObject({ resolutionSource: 'PLAN' });
  });

  it('generates independent idempotent Assignments for an A/B/A multi-day absence', async () => {
    const dates = ['2026-10-12', '2026-10-13', '2026-10-14'] as const;
    for (const [index, date] of dates.entries()) {
      await api('/api/plans/ensure', 'POST', {
        date,
        dayType: index === 1 ? 'B' : 'A',
      });
    }
    const result = await api('/api/absences', 'POST', {
      staffId: 'staff_priya_nair',
      startDate: dates[0],
      endDate: dates[2],
      startTime: null,
      endTime: null,
    });
    expect(result.response.status).toBe(201);
    const absenceId = data<{ absenceId: string }>(result.payload).absenceId;
    const assignmentIds: string[] = [];
    for (const [index, date] of dates.entries()) {
      const planResult = await api(`/api/plans/${date}`);
      const detail = data<{
        detail: {
          plan: { date: string; dayType: string; scheduleVersionId: string };
          absences: unknown[];
          assignments: Array<{
            id: string;
            startTime: string;
            description: string;
          }>;
        };
      }>(planResult.payload).detail;
      expect(detail.plan).toMatchObject({
        date,
        dayType: index === 1 ? 'B' : 'A',
        scheduleVersionId: 'schedule_2026_fall',
      });
      expect(detail.absences).toHaveLength(1);
      expect(detail.assignments).toHaveLength(1);
      expect(detail.assignments[0]).toMatchObject({
        startTime: index === 1 ? '10:30' : '09:40',
        description: 'Middle School Humanities',
      });
      assignmentIds.push(detail.assignments[0]!.id);
    }
    expect(new Set(assignmentIds).size).toBe(3);

    const repeatedSources = await testEnv.DB.prepare(
      `SELECT p.date, a.id, a.source_schedule_entry_id
         FROM assignments a
         JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
        WHERE a.absence_id = ?
        ORDER BY p.date`,
    )
      .bind(absenceId)
      .all<{ date: string; id: string; source_schedule_entry_id: string }>();
    expect(
      repeatedSources.results.map((row) => row.source_schedule_entry_id),
    ).toEqual([
      'entry_priya_a_0940',
      'entry_priya_b_1030',
      'entry_priya_a_0940',
    ]);

    await testEnv.DB.prepare(
      `INSERT OR IGNORE INTO assignments (
         id, daily_sub_plan_id, absence_id, source_schedule_entry_id,
         source_special_schedule_entry_id, start_time, end_time,
         responsibility_type, description, room_id, status, is_default,
         updated_by
       )
       SELECT 'duplicate_generated_assignment', daily_sub_plan_id, absence_id,
              source_schedule_entry_id, source_special_schedule_entry_id,
              start_time, end_time, responsibility_type, description, room_id,
              status, is_default, updated_by
         FROM assignments WHERE id = ?`,
    )
      .bind(assignmentIds[0])
      .run();
    const firstPlanCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM assignments
        WHERE daily_sub_plan_id = (
          SELECT daily_sub_plan_id FROM assignments WHERE id = ?
        ) AND absence_id = ? AND source_schedule_entry_id = 'entry_priya_a_0940'`,
    )
      .bind(assignmentIds[0], absenceId)
      .first<{ count: number }>();
    expect(firstPlanCount?.count).toBe(1);
  });

  it('invalidates overlapping manual direct coverage when its teacher becomes absent', async () => {
    const date = '2026-09-17';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_avery_bennett',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const initial = data<{
      detail: { assignments: Array<{ id: string; startTime: string }> };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    const assignmentId = initial.assignments.find(
      (assignment) => assignment.startTime === '08:00',
    )!.id;
    await api(
      `/api/assignments/${encodeURIComponent(assignmentId)}/resolve`,
      'POST',
      {
        action: 'assign',
        staffId: 'staff_casey_brooks',
        assignAnyway: false,
      },
    );

    await api('/api/absences', 'POST', {
      staffId: 'staff_casey_brooks',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const invalidated = data<{
      detail: {
        assignments: Array<{
          id: string;
          status: string;
          assignedStaff: unknown;
          conflictExplanation: string | null;
          defaultAction: unknown;
        }>;
      };
    }>((await api(`/api/plans/${date}`)).payload).detail.assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    expect(invalidated).toMatchObject({
      status: 'unresolved',
      assignedStaff: null,
      conflictExplanation: 'Casey Brooks is also absent.',
    });
    expect(invalidated?.defaultAction).toBeTruthy();
  });

  it('invalidates split coverage and removes all stale segments when a split teacher becomes absent', async () => {
    const date = '2026-09-18';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_jordan_kim',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const initial = data<{
      detail: { assignments: Array<{ id: string; startTime: string }> };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    const assignmentId = initial.assignments.find(
      (assignment) => assignment.startTime === '08:00',
    )!.id;
    await api(
      `/api/assignments/${encodeURIComponent(assignmentId)}/resolve`,
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

    await api('/api/absences', 'POST', {
      staffId: 'staff_casey_brooks',
      startDate: date,
      endDate: date,
      startTime: '08:40',
      endTime: '08:50',
    });
    const invalidated = data<{
      detail: {
        assignments: Array<{
          id: string;
          status: string;
          resolutionType: string | null;
          conflictExplanation: string | null;
          segments: unknown[];
        }>;
      };
    }>((await api(`/api/plans/${date}`)).payload).detail.assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    expect(invalidated).toMatchObject({
      status: 'unresolved',
      resolutionType: null,
      conflictExplanation:
        'Casey Brooks, who was providing split coverage, is also absent.',
      segments: [],
    });
    const segmentCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM assignment_segments WHERE assignment_id = ?`,
    )
      .bind(assignmentId)
      .first<{ count: number }>();
    expect(segmentCount?.count).toBe(0);
  });

  it('keeps direct coverage assigned when a new partial absence does not overlap it', async () => {
    const date = '2026-09-21';
    await api('/api/plans/ensure', 'POST', { date, dayType: 'A' });
    await api('/api/absences', 'POST', {
      staffId: 'staff_avery_bennett',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    const initial = data<{
      detail: { assignments: Array<{ id: string; startTime: string }> };
    }>((await api(`/api/plans/${date}`)).payload).detail;
    const assignmentId = initial.assignments.find(
      (assignment) => assignment.startTime === '08:00',
    )!.id;
    await api(
      `/api/assignments/${encodeURIComponent(assignmentId)}/resolve`,
      'POST',
      {
        action: 'assign',
        staffId: 'staff_casey_brooks',
        assignAnyway: false,
      },
    );

    await api('/api/absences', 'POST', {
      staffId: 'staff_casey_brooks',
      startDate: date,
      endDate: date,
      startTime: '09:00',
      endTime: '09:30',
    });
    const unchanged = data<{
      detail: {
        assignments: Array<{
          id: string;
          status: string;
          assignedStaff: { id: string } | null;
          conflictExplanation: string | null;
        }>;
      };
    }>((await api(`/api/plans/${date}`)).payload).detail.assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    expect(unchanged).toMatchObject({
      status: 'assigned',
      assignedStaff: { id: 'staff_casey_brooks' },
      conflictExplanation: null,
    });
  });

  it('creates plans only for weekdays in Friday-to-Monday absence expansion', async () => {
    const result = await api('/api/absences', 'POST', {
      staffId: 'staff_priya_nair',
      startDate: '2026-11-06',
      endDate: '2026-11-09',
      startTime: null,
      endTime: null,
    });
    expect(result.response.status).toBe(201);
    expect(data<{ dates: string[] }>(result.payload).dates).toEqual([
      '2026-11-06',
      '2026-11-09',
    ]);
    const plans = await testEnv.DB.prepare(
      `SELECT date FROM daily_sub_plans
        WHERE date BETWEEN '2026-11-06' AND '2026-11-09'
        ORDER BY date`,
    ).all<{ date: string }>();
    expect(plans.results.map((plan) => plan.date)).toEqual([
      '2026-11-06',
      '2026-11-09',
    ]);
  });

  it('accepts a weekend-only absence without creating a Daily Sub Plan or Assignment', async () => {
    const date = '2026-11-14';
    const result = await api('/api/absences', 'POST', {
      staffId: 'staff_theo_wallace',
      startDate: date,
      endDate: date,
      startTime: null,
      endTime: null,
    });
    expect(result.response.status).toBe(201);
    expect(data<{ dates: string[] }>(result.payload).dates).toEqual([]);
    const planCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM daily_sub_plans WHERE date = ?`,
    )
      .bind(date)
      .first<{ count: number }>();
    const assignmentCount = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count
         FROM assignments a
         JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
        WHERE p.date = ?`,
    )
      .bind(date)
      .first<{ count: number }>();
    expect(planCount?.count).toBe(0);
    expect(assignmentCount?.count).toBe(0);
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
