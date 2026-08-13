import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { SchoolScheduleCandidate } from '../../src/features/schedule-import/school-schedule-adapter';
import { ImportRepository } from '../../worker/db/import-repository';

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
  it('stages exact identities and atomically activates a newer effective-dated schedule', async () => {
    const repository = new ImportRepository(testEnv.DB);
    const staged = await repository.stage({
      fileName: 'fixture-schedule.xlsx',
      sha256: 'fixture-import-sha-2099',
      effectiveFrom: '2099-01-01',
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

    const activated = await repository.activate(
      staged.id,
      'Future Fixture Schedule',
      'user_local_admin',
    );
    expect(activated.status).toBe('activated');
    expect(activated.activatedScheduleVersionId).toBeTruthy();

    const prior = await testEnv.DB.prepare(
      `SELECT effective_to FROM schedule_versions WHERE id = 'schedule_2026_fall'`,
    ).first<{ effective_to: string | null }>();
    expect(prior?.effective_to).toBe('2098-12-31');
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
