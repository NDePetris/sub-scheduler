import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import {
  schoolScheduleAdapter,
  type SchoolScheduleCandidate,
} from '../../src/features/schedule-import/school-schedule-adapter';
import { ImportRepository } from '../../worker/db/import-repository';
import { PlanningRepository } from '../../worker/db/planning-repository';

interface TestEnv {
  DB: D1Database;
}

const testEnv = env as unknown as TestEnv;

function candidate(staff: string, room: string): SchoolScheduleCandidate {
  return {
    sheetName: 'SY27 Teacher Schedules',
    staffDisplayValues: [staff],
    roomDisplayValues: [room],
    aBDetected: true,
    entries: [
      {
        sourceSheet: 'SY27 Teacher Schedules',
        sourceCell: 'C4',
        staffDisplayValue: staff,
        roomDisplayValue: room,
        dayType: 'ALL',
        startTime: '08:00',
        endTime: '08:50',
        activityType: 'instruction',
        category: 'PRI',
        description: 'Fixture Class',
        requiresSub: true,
      },
    ],
  };
}

describe.sequential('schedule import lifecycle', () => {
  it('persists parsed Break responsibilities as coverable duties', async () => {
    const parsed = schoolScheduleAdapter.parse({
      sheets: [
        {
          name: 'SY27 Teacher Schedules',
          mergedCells: [],
          rows: [
            [null, 'PRI-101'],
            [null, 'Avery Bennett'],
            [null, null],
            ['10:00 - 10:10', 'Break'],
          ],
        },
      ],
    });
    expect(parsed.candidate).not.toBeNull();
    const repository = new ImportRepository(testEnv.DB);
    const staged = await repository.stage({
      kind: 'special',
      name: 'Break Duty Schedule',
      fileName: 'break-schedule.xlsx',
      sha256: 'fixture-import-break-duty',
      specialDate: '2030-01-07',
      effectiveTo: null,
      candidate: parsed.candidate!,
      issues: parsed.issues,
      actorId: 'user_local_admin',
    });
    const activated = await repository.activateSpecial(
      staged.id,
      'user_local_admin',
    );
    const entry = await testEnv.DB.prepare(
      `SELECT activity_type, requires_sub FROM special_schedule_entries
        WHERE special_schedule_id = ? AND description = 'Break'`,
    )
      .bind(activated.activatedSpecialScheduleId)
      .first<{ activity_type: string; requires_sub: number }>();
    expect(entry).toEqual({ activity_type: 'duty', requires_sub: 1 });
    const planning = new PlanningRepository(testEnv.DB);
    await planning.ensurePlan('2030-01-07', 'A', 'user_local_admin');
    await planning.addAbsence(
      {
        staffId: 'staff_avery_bennett',
        startDate: '2030-01-07',
        endDate: '2030-01-07',
        startTime: null,
        endTime: null,
      },
      'user_local_admin',
    );
    const detail = await planning.getPlan('2030-01-07');
    expect(detail.assignments).toContainEqual(
      expect.objectContaining({
        description: 'Break',
        responsibilityType: 'duty',
      }),
    );
  });

  it('stages exact identities and atomically activates a newer effective-dated schedule', async () => {
    const repository = new ImportRepository(testEnv.DB);
    const staged = await repository.stage({
      fileName: 'fixture-schedule.xlsx',
      sha256: 'fixture-import-sha-2099',
      effectiveFrom: '2026-08-17',
      effectiveTo: null,
      candidate: candidate('Avery Bennett', 'PRI-101'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(staged).toMatchObject({
      status: 'ready',
      recognizedStaff: 1,
      recognizedRooms: 1,
      entryCount: 1,
    });

    const preview = await repository.activationPreview(staged.id);
    expect(preview).toEqual({
      action: 'close_predecessor',
      predecessor: {
        id: 'schedule_2026_fall',
        name: 'Fictional Fall Schedule',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        proposedEffectiveTo: '2026-08-16',
      },
    });

    const activated = await repository.activate(
      staged.id,
      'Future Fixture Schedule',
      'user_local_admin',
      true,
    );
    expect(activated.status).toBe('activated');
    expect(activated.activatedScheduleVersionId).toBeTruthy();

    const prior = await testEnv.DB.prepare(
      `SELECT effective_to FROM schedule_versions WHERE id = 'schedule_2026_fall'`,
    ).first<{ effective_to: string | null }>();
    expect(prior?.effective_to).toBe('2026-08-16');
    const entries = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM schedule_entries WHERE schedule_version_id = ?`,
    )
      .bind(activated.activatedScheduleVersionId)
      .first<{ count: number }>();
    expect(entries?.count).toBe(1);

    const repeated = await repository.activate(
      staged.id,
      'Ignored duplicate activation',
      'user_local_admin',
    );
    expect(repeated.activatedScheduleVersionId).toBe(
      activated.activatedScheduleVersionId,
    );
  });

  it('keeps new labels staged until each persistent identity is mapped or created', async () => {
    const repository = new ImportRepository(testEnv.DB);
    let detail = await repository.stage({
      fileName: 'new-labels.xlsx',
      sha256: 'fixture-import-new-labels',
      effectiveFrom: '2100-01-01',
      effectiveTo: '2100-06-01',
      candidate: candidate('Fictional New Teacher', 'FIC-100'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(detail).toMatchObject({
      status: 'staged',
      unmappedStaff: 1,
      unmappedRooms: 1,
    });

    detail = await repository.mapValue({
      importId: detail.id,
      kind: 'staff',
      displayValue: 'Fictional New Teacher',
      createNew: true,
    });
    expect(detail).toMatchObject({
      status: 'staged',
      unmappedStaff: 0,
      unmappedRooms: 1,
    });

    detail = await repository.mapValue({
      importId: detail.id,
      kind: 'room',
      displayValue: 'FIC-100',
      createNew: true,
    });
    expect(detail).toMatchObject({
      status: 'ready',
      unmappedStaff: 0,
      unmappedRooms: 0,
    });
  });
});
