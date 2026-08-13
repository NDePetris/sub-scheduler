import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { SchoolScheduleCandidate } from '../../src/features/schedule-import/school-schedule-adapter';
import { ImportRepository } from '../../worker/db/import-repository';
import { PlanningRepository } from '../../worker/db/planning-repository';
import { ScheduleRepository } from '../../worker/db/schedule-repository';
import { HttpError } from '../../worker/http';

interface TestEnv {
  DB: D1Database;
}

const testEnv = env as unknown as TestEnv;

const candidate: SchoolScheduleCandidate = {
  sheetName: 'SY27 Teacher Schedules',
  staffDisplayValues: ['Avery Bennett'],
  roomDisplayValues: ['PRI-101'],
  aBDetected: false,
  entries: [
    {
      sourceSheet: 'SY27 Teacher Schedules',
      sourceCell: 'C4',
      staffDisplayValue: 'Avery Bennett',
      roomDisplayValue: 'PRI-101',
      dayType: 'ALL',
      startTime: '08:00',
      endTime: '08:50',
      activityType: 'instruction',
      category: 'PRI',
      description: 'Replacement Class',
      requiresSub: true,
    },
  ],
};

describe.sequential('Schedule Management', () => {
  it('rejects a genuine finite overlap with a named conflict and no mutation', async () => {
    await testEnv.DB.prepare(
      `UPDATE schedule_versions SET effective_to = '2026-09-30'
        WHERE id = 'schedule_2026_fall'`,
    ).run();
    const imports = new ImportRepository(testEnv.DB);
    const staged = await imports.stage({
      fileName: 'overlap.xlsx',
      sha256: 'finite-overlap-management',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-10-31',
      candidate,
      issues: [],
      actorId: 'user_local_admin',
    });

    await expectHttpError(
      imports.activationPreview(staged.id),
      'schedule_range_conflict',
      'Fictional Fall Schedule',
    );
    expect(
      await testEnv.DB.prepare(
        `SELECT effective_to FROM schedule_versions WHERE id = 'schedule_2026_fall'`,
      ).first(),
    ).toMatchObject({ effective_to: '2026-09-30' });
    expect((await imports.get(staged.id)).status).toBe('ready');
    await testEnv.DB.prepare(
      `UPDATE schedule_versions SET effective_to = NULL
        WHERE id = 'schedule_2026_fall'`,
    ).run();
  });

  it('edits valid dates, rejects conflicting corrections, and keeps plans pinned', async () => {
    const planning = new PlanningRepository(testEnv.DB);
    const schedules = new ScheduleRepository(testEnv.DB);
    const original = await planning.ensurePlan(
      '2026-09-14',
      'A',
      'user_local_admin',
    );
    await testEnv.DB.prepare(
      `INSERT INTO schedule_versions (
         id, name, effective_from, effective_to, status, created_by,
         activated_by, activated_at
       ) VALUES (
         'schedule_2027', 'Winter Schedule', '2027-01-01', NULL, 'active',
         'user_local_admin', 'user_local_admin', '2026-12-01T12:00:00.000Z'
       )`,
    ).run();

    await schedules.configure('schedule_2026_fall', {
      name: 'Corrected Fall Schedule',
      effectiveFrom: '2026-08-01',
      effectiveTo: '2026-12-31',
    });
    await expectHttpError(
      schedules.configure('schedule_2026_fall', {
        name: 'Invalid overlap',
        effectiveFrom: '2026-08-01',
        effectiveTo: '2027-01-15',
      }),
      'schedule_range_conflict',
      'Winter Schedule',
    );

    const row = await testEnv.DB.prepare(
      `SELECT name, effective_to FROM schedule_versions WHERE id = 'schedule_2026_fall'`,
    ).first();
    expect(row).toMatchObject({
      name: 'Corrected Fall Schedule',
      effective_to: '2026-12-31',
    });
    const persisted = await planning.getPlan('2026-09-14');
    expect(persisted.plan.scheduleVersionId).toBe(
      original.plan.scheduleVersionId,
    );
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `UPDATE schedule_versions
            SET name = 'Fictional Fall Schedule', effective_to = NULL
          WHERE id = 'schedule_2026_fall'`,
      ),
      testEnv.DB.prepare(
        `DELETE FROM schedule_versions WHERE id = 'schedule_2027'`,
      ),
    ]);
  });

  it('deletes unused versions, requires archival for used versions, and preserves pinned plans', async () => {
    const planning = new PlanningRepository(testEnv.DB);
    const schedules = new ScheduleRepository(testEnv.DB);
    await testEnv.DB.prepare(
      `INSERT INTO schedule_versions (
         id, name, effective_from, effective_to, status, created_by,
         activated_by, activated_at
       ) VALUES (
         'unused_schedule', 'Unused Schedule', '2025-01-01', '2025-06-01',
         'active', 'user_local_admin', 'user_local_admin',
         '2025-01-01T12:00:00.000Z'
       )`,
    ).run();
    await schedules.delete('unused_schedule');
    expect(
      await testEnv.DB.prepare(
        `SELECT id FROM schedule_versions WHERE id = 'unused_schedule'`,
      ).first(),
    ).toBeNull();

    await planning.ensurePlan('2026-09-15', 'B', 'user_local_admin');
    await expect(schedules.delete('schedule_2026_fall')).rejects.toBeInstanceOf(
      HttpError,
    );
    await schedules.archive('schedule_2026_fall');
    expect((await planning.getPlan('2026-09-15')).plan.scheduleVersionId).toBe(
      'schedule_2026_fall',
    );
    const listed = await schedules.list();
    expect(
      listed.scheduleVersions.find((item) => item.id === 'schedule_2026_fall'),
    ).toMatchObject({ status: 'archived' });
    await testEnv.DB.prepare(
      `UPDATE schedule_versions SET status = 'active'
        WHERE id = 'schedule_2026_fall'`,
    ).run();
  });

  it('deletes staged imports without deleting identities created during mapping', async () => {
    const imports = new ImportRepository(testEnv.DB);
    let staged = await imports.stage({
      fileName: 'staged-delete.xlsx',
      sha256: 'staged-delete-management',
      effectiveFrom: '2030-01-01',
      effectiveTo: null,
      candidate: {
        ...candidate,
        staffDisplayValues: ['New Fixture Teacher'],
        roomDisplayValues: [],
        entries: candidate.entries.map((entry) => ({
          ...entry,
          staffDisplayValue: 'New Fixture Teacher',
          roomDisplayValue: null,
        })),
      },
      issues: [],
      actorId: 'user_local_admin',
    });
    staged = await imports.mapValue({
      importId: staged.id,
      kind: 'staff',
      displayValue: 'New Fixture Teacher',
      createNew: true,
    });
    const staffId = staged.staffMappings[0]?.targetId;
    await imports.deleteStaged(staged.id);
    expect(
      await testEnv.DB.prepare(`SELECT id FROM schedule_imports WHERE id = ?`)
        .bind(staged.id)
        .first(),
    ).toBeNull();
    expect(
      await testEnv.DB.prepare(`SELECT id FROM staff WHERE id = ?`)
        .bind(staffId)
        .first(),
    ).toMatchObject({ id: staffId });
  });

  it('lists Special Schedules separately and pins the one-day override only on its date', async () => {
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO special_schedules (
           id, date, name, status, created_by, activated_by, activated_at
         ) VALUES (
           'special_assembly', '2026-09-16', 'Assembly Day', 'active',
           'user_local_admin', 'user_local_admin', '2026-09-01T12:00:00.000Z'
         )`,
      ),
      testEnv.DB.prepare(
        `INSERT INTO special_schedule_entries (
           id, special_schedule_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, room_id, requires_sub
         ) VALUES (
           'special_entry', 'special_assembly', 'staff_avery_bennett', 'ALL',
           '09:00', '09:30', 'instruction', 'PRI', 'Assembly Class',
           'room_pri_101', 1
         )`,
      ),
    ]);
    const planning = new PlanningRepository(testEnv.DB);
    const schedules = new ScheduleRepository(testEnv.DB);
    const specialDay = await planning.ensurePlan(
      '2026-09-16',
      'A',
      'user_local_admin',
    );
    const followingDay = await planning.ensurePlan(
      '2026-09-17',
      'B',
      'user_local_admin',
    );
    expect(specialDay.plan).toMatchObject({
      specialScheduleId: 'special_assembly',
      specialScheduleName: 'Assembly Day',
    });
    expect(followingDay.plan.specialScheduleId).toBeNull();
    expect((await schedules.list()).specialSchedules).toEqual([
      expect.objectContaining({ id: 'special_assembly', date: '2026-09-16' }),
    ]);
  });

  it('persists an absence with no applicable responsibilities and exposes an informational warning', async () => {
    await testEnv.DB.prepare(
      `INSERT INTO staff (
         id, display_name, role, is_active, can_sub, is_school_sub
       ) VALUES ('staff_no_schedule', 'Jordan Smith', 'teacher', 1, 1, 0)`,
    ).run();
    const planning = new PlanningRepository(testEnv.DB);
    await planning.ensurePlan('2026-09-18', 'A', 'user_local_admin');
    const added = await planning.addAbsence(
      {
        staffId: 'staff_no_schedule',
        startDate: '2026-09-18',
        endDate: '2026-09-18',
        startTime: null,
        endTime: null,
      },
      'user_local_admin',
    );
    const detail = await planning.getPlan('2026-09-18');
    expect(added.absenceId).toBeTruthy();
    expect(detail.assignments).toHaveLength(0);
    expect(detail.absences[0]?.staffName).toBe('Jordan Smith');
    expect(detail.absences[0]?.informationalWarning).toContain(
      'no schedule entries',
    );
  });
});

async function expectHttpError(
  promise: Promise<unknown>,
  code: string,
  messagePart: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected the operation to fail.');
  } catch (cause) {
    expect(cause).toBeInstanceOf(HttpError);
    if (!(cause instanceof HttpError)) return;
    expect(cause.code).toBe(code);
    expect(cause.message).toContain(messagePart);
  }
}
