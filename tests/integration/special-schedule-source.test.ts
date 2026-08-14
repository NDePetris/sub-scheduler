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
const actorId = 'user_local_admin';

const candidate: SchoolScheduleCandidate = {
  sheetName: 'SY27 Teacher Schedules',
  staffDisplayValues: ['Avery Bennett', 'Casey Brooks'],
  roomDisplayValues: ['PRI-101'],
  aBDetected: true,
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
      description: 'Special Day Class',
      requiresSub: true,
    },
    {
      sourceSheet: 'SY27 Teacher Schedules',
      sourceCell: 'D4',
      staffDisplayValue: 'Casey Brooks',
      roomDisplayValue: null,
      dayType: 'A',
      startTime: '08:00',
      endTime: '08:50',
      activityType: 'plan',
      category: 'PLAN_ADMIN',
      description: 'PLAN',
      requiresSub: false,
    },
  ],
};

describe.sequential('exclusive normal or Special Schedule sources', () => {
  it('creates a Special-only plan and generates Needs Sub Assignments without a normal schedule', async () => {
    const imports = new ImportRepository(testEnv.DB);
    const planning = new PlanningRepository(testEnv.DB);
    const staged = await imports.stage({
      kind: 'special',
      name: 'Testing Day',
      fileName: 'testing-day.xlsx',
      sha256: 'special-only-source',
      specialDate: '2040-03-15',
      effectiveTo: null,
      candidate,
      issues: [],
      actorId,
    });
    expect(staged).toMatchObject({
      kind: 'special',
      specialDate: '2040-03-15',
      effectiveFrom: null,
      status: 'ready',
    });
    const activated = await imports.activateSpecial(staged.id, actorId);
    const detail = await planning.ensurePlan('2040-03-15', 'A', actorId);
    expect(detail.plan).toMatchObject({
      scheduleVersionId: null,
      scheduleName: null,
      specialScheduleId: activated.activatedSpecialScheduleId,
      specialScheduleName: 'Testing Day',
      expectedDayType: null,
    });

    await planning.addAbsence(
      {
        staffId: 'staff_avery_bennett',
        startDate: '2040-03-15',
        endDate: '2040-03-15',
        startTime: null,
        endTime: null,
      },
      actorId,
    );
    const generated = await planning.getPlan('2040-03-15');
    expect(generated.assignments).toEqual([
      expect.objectContaining({ description: 'Special Day Class' }),
    ]);
    const source = await testEnv.DB.prepare(
      `SELECT source_schedule_entry_id, source_special_schedule_entry_id
         FROM assignments WHERE daily_sub_plan_id = ?`,
    )
      .bind(generated.plan.id)
      .first<{
        source_schedule_entry_id: string | null;
        source_special_schedule_entry_id: string | null;
      }>();
    expect(source?.source_schedule_entry_id).toBeNull();
    expect(source?.source_special_schedule_entry_id).toBeTruthy();
    await expect(
      planning.candidates(generated.assignments[0]!.id),
    ).resolves.toMatchObject({ assignmentId: generated.assignments[0]!.id });
  });

  it('pins only Special when both sources apply and normal on the following date', async () => {
    const planning = new PlanningRepository(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare(
        `INSERT INTO special_schedules
           (id, date, name, status, created_by, activated_by, activated_at)
         VALUES ('special_precedence', '2026-10-20', 'Conference Schedule',
                 'active', ?, ?, '2026-10-01T12:00:00.000Z')`,
      ).bind(actorId, actorId),
      testEnv.DB.prepare(
        `INSERT INTO special_schedule_entries (
           id, special_schedule_id, staff_id, day_type, start_time, end_time,
           activity_type, category, description, room_id, requires_sub
         ) VALUES ('special_precedence_entry', 'special_precedence',
                   'staff_avery_bennett', 'ALL', '10:00', '10:30',
                   'instruction', 'PRI', 'Conference Class', 'room_pri_101', 1)`,
      ),
    ]);
    const special = await planning.ensurePlan('2026-10-20', 'B', actorId);
    expect(special.plan).toMatchObject({
      scheduleVersionId: null,
      specialScheduleId: 'special_precedence',
      expectedDayType: null,
    });
    expect(special.schedule.map((entry) => entry.description)).toEqual([
      'Conference Class',
    ]);
    const normal = await planning.ensurePlan('2026-10-21', 'A', actorId);
    expect(normal.plan.scheduleVersionId).toBe('schedule_2026_fall');
    expect(normal.plan.specialScheduleId).toBeNull();
    expect(normal.plan.expectedDayType).not.toBeNull();
  });

  it('fails clearly and atomically when no schedule source is available', async () => {
    const planning = new PlanningRepository(testEnv.DB);
    await expectHttpError(
      planning.ensurePlan('2025-02-03', 'A', actorId),
      'no_schedule_for_date',
    );
    const row = await testEnv.DB.prepare(
      `SELECT id FROM daily_sub_plans WHERE date = '2025-02-03'`,
    ).first();
    expect(row).toBeNull();
  });

  it('configures staged metadata and protects activated imports', async () => {
    const imports = new ImportRepository(testEnv.DB);
    const staged = await imports.stage({
      name: 'Initial Name',
      fileName: 'normal-config.xlsx',
      sha256: 'normal-config-source',
      effectiveFrom: '2042-01-01',
      effectiveTo: null,
      candidate,
      issues: [],
      actorId,
    });
    const configured = await imports.configure(staged.id, {
      kind: 'normal',
      name: 'Corrected Name',
      effectiveFrom: '2042-02-01',
      effectiveTo: '2042-06-30',
    });
    expect(configured).toMatchObject({
      name: 'Corrected Name',
      effectiveFrom: '2042-02-01',
      effectiveTo: '2042-06-30',
    });
    expect(await imports.activationPreview(staged.id)).toMatchObject({
      action: 'close_predecessor',
    });
    await imports.activate(staged.id, undefined, actorId, true);
    await expectHttpError(
      imports.configure(staged.id, {
        kind: 'normal',
        name: 'Too Late',
        effectiveFrom: '2043-01-01',
        effectiveTo: null,
      }),
      'import_already_activated',
    );
  });

  it('enforces one Special Schedule per date and applies delete/archive history rules', async () => {
    const imports = new ImportRepository(testEnv.DB);
    const schedules = new ScheduleRepository(testEnv.DB);
    const planning = new PlanningRepository(testEnv.DB);
    const unused = await imports.stage({
      kind: 'special',
      name: 'Field Day',
      fileName: 'field-day.xlsx',
      sha256: 'special-lifecycle-unused',
      specialDate: '2041-05-01',
      effectiveTo: null,
      candidate,
      issues: [],
      actorId,
    });
    const moved = await imports.configure(unused.id, {
      kind: 'special',
      name: 'Field Day Corrected',
      date: '2041-05-02',
    });
    const activated = await imports.activateSpecial(moved.id, actorId);
    await expectHttpError(
      imports.stage({
        kind: 'special',
        name: 'Duplicate',
        fileName: 'duplicate.xlsx',
        sha256: 'special-lifecycle-duplicate',
        specialDate: '2041-05-02',
        effectiveTo: null,
        candidate,
        issues: [],
        actorId,
      }),
      'special_schedule_date_conflict',
    );
    await schedules.deleteSpecial(activated.activatedSpecialScheduleId!);
    expect(
      await testEnv.DB.prepare(`SELECT id FROM special_schedules WHERE id = ?`)
        .bind(activated.activatedSpecialScheduleId)
        .first(),
    ).toBeNull();

    const usedId = (
      await imports.activateSpecial(
        (
          await imports.stage({
            kind: 'special',
            name: 'Referenced Special',
            fileName: 'referenced-special.xlsx',
            sha256: 'special-lifecycle-used',
            specialDate: '2041-05-03',
            effectiveTo: null,
            candidate,
            issues: [],
            actorId,
          })
        ).id,
        actorId,
      )
    ).activatedSpecialScheduleId!;
    await planning.ensurePlan('2041-05-03', 'A', actorId);
    await expectHttpError(
      schedules.configureSpecial(usedId, {
        name: 'Referenced Special',
        date: '2041-05-04',
      }),
      'special_schedule_date_pinned',
    );
    await expectHttpError(
      schedules.deleteSpecial(usedId),
      'special_schedule_in_use',
    );
    await schedules.archiveSpecial(usedId);
    await expect(planning.getPlan('2041-05-03')).resolves.toMatchObject({
      plan: { specialScheduleId: usedId },
    });
  });
});

async function expectHttpError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected the operation to fail.');
  } catch (cause) {
    expect(cause).toBeInstanceOf(HttpError);
    if (cause instanceof HttpError) expect(cause.code).toBe(code);
  }
}
