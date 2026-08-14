import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import type { SchoolScheduleCandidate } from '../../src/features/schedule-import/school-schedule-adapter';
import worker from '../../worker';
import { ImportRepository } from '../../worker/db/import-repository';
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
  const payload: {
    data?: Record<string, unknown>;
    error?: { code: string };
  } = await response.json();
  return { response, payload };
}

function importCandidate(staffName: string): SchoolScheduleCandidate {
  return {
    sheetName: 'SY27 Teacher Schedules',
    staffDisplayValues: [staffName],
    roomDisplayValues: ['PRI-101'],
    aBDetected: false,
    entries: [
      {
        sourceSheet: 'SY27 Teacher Schedules',
        sourceCell: 'C4',
        staffDisplayValue: staffName,
        roomDisplayValue: 'PRI-101',
        dayType: 'ALL',
        startTime: '08:00',
        endTime: '08:40',
        activityType: 'instruction',
        category: 'PRI',
        description: 'Alias Fixture',
        requiresSub: true,
      },
    ],
  };
}

describe.sequential('Staff & Rooms management foundation', () => {
  it('creates staff with defaults and enforces School Sub / Can Sub invariants for multiple people', async () => {
    const first = await api('/api/staff', 'POST', {
      displayName: 'Foundation Teacher One',
    });
    expect(first.response.status).toBe(201);
    const firstStaff = first.payload.data?.staff as {
      id: string;
      role: string;
      canSub: boolean;
      isSchoolSub: boolean;
      standardPeriodMinutes: null;
    };
    expect(firstStaff).toMatchObject({
      role: 'Teacher',
      canSub: true,
      isSchoolSub: false,
      standardPeriodMinutes: null,
    });

    const updated = await api(`/api/staff/${firstStaff.id}`, 'PATCH', {
      displayName: 'Foundation Teacher One',
      role: 'Administrator',
      canSub: false,
      isSchoolSub: true,
      standardPeriodMinutes: 40,
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.data?.staff).toMatchObject({
      role: 'Administrator',
      canSub: true,
      isSchoolSub: true,
      standardPeriodMinutes: 40,
    });

    const second = await api('/api/staff', 'POST', {
      displayName: 'Foundation Teacher Two',
      role: 'Staff',
      canSub: true,
      isSchoolSub: true,
      standardPeriodMinutes: 50,
    });
    expect(second.response.status).toBe(201);
    const schoolSubs = await testEnv.DB.prepare(
      `SELECT COUNT(*) AS count FROM staff WHERE is_active = 1 AND is_school_sub = 1`,
    ).first<{ count: number }>();
    expect(schoolSubs?.count).toBeGreaterThanOrEqual(3);

    const cleared = await api(`/api/staff/${firstStaff.id}`, 'PATCH', {
      displayName: 'Foundation Teacher One',
      role: 'Staff',
      canSub: false,
      isSchoolSub: false,
      standardPeriodMinutes: null,
    });
    expect(cleared.payload.data?.staff).toMatchObject({
      canSub: false,
      isSchoolSub: false,
    });

    await api('/api/plans/ensure', 'POST', {
      date: '2026-10-01',
      dayType: 'A',
    });
    await api('/api/absences', 'POST', {
      staffId: 'staff_avery_bennett',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      startTime: null,
      endTime: null,
    });
    const plan = await api('/api/plans/2026-10-01');
    const assignmentId = (
      plan.payload.data?.detail as { assignments: { id: string }[] }
    ).assignments[0]!.id;
    const candidates = await api(
      `/api/assignments/${encodeURIComponent(assignmentId)}/candidates`,
    );
    expect(
      (candidates.payload.data?.candidates as { id: string }[]).some(
        (candidate) => candidate.id === firstStaff.id,
      ),
    ).toBe(false);

    await testEnv.DB.prepare(
      `INSERT INTO schedule_entries (
         id, schedule_version_id, staff_id, day_type, start_time, end_time,
         activity_type, category, description, requires_sub
       ) VALUES ('foundation_staff_history', 'schedule_2026_fall', ?, 'ALL',
                 '15:30', '15:40', 'other', 'AFTER_SCHOOL_OTHER',
                 'Historical Foundation Reference', 0)`,
    )
      .bind(firstStaff.id)
      .run();
    const inactive = await api(
      `/api/staff/${firstStaff.id}/deactivate`,
      'POST',
      {},
    );
    expect(inactive.payload.data?.staff).toMatchObject({ isActive: false });
    expect(
      await testEnv.DB.prepare(
        `SELECT staff_id FROM schedule_entries WHERE id = 'foundation_staff_history'`,
      ).first(),
    ).toEqual({ staff_id: firstStaff.id });
    const reactivated = await api(
      `/api/staff/${firstStaff.id}/reactivate`,
      'POST',
      {},
    );
    expect(reactivated.payload.data?.staff).toMatchObject({ isActive: true });
  });

  it('preserves the old canonical name as an alias and uses aliases for future normal and Special imports', async () => {
    const created = await api('/api/staff', 'POST', {
      displayName: 'Jane A. Foundation',
    });
    const person = created.payload.data?.staff as { id: string };
    const renamed = await api(`/api/staff/${person.id}`, 'PATCH', {
      displayName: 'Jane Foundation',
      role: 'Teacher',
      canSub: true,
      isSchoolSub: false,
      standardPeriodMinutes: null,
    });
    expect(renamed.payload.data?.staff).toMatchObject({
      id: person.id,
      aliases: [{ displayValue: 'Jane A. Foundation' }],
    });

    const repository = new ImportRepository(testEnv.DB);
    const normal = await repository.stage({
      kind: 'normal',
      name: 'Alias Normal',
      fileName: 'alias-normal.xlsx',
      sha256: 'alias-normal-sha',
      effectiveFrom: '2120-01-01',
      effectiveTo: '2120-01-02',
      candidate: importCandidate('Jane A. Foundation'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(normal.staffMappings[0]).toMatchObject({
      targetId: person.id,
      status: 'mapped',
    });
    const special = await repository.stage({
      kind: 'special',
      name: 'Alias Special',
      fileName: 'alias-special.xlsx',
      sha256: 'alias-special-sha',
      specialDate: '2120-02-01',
      effectiveTo: null,
      candidate: importCandidate('Jane A. Foundation'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(special.staffMappings[0]).toMatchObject({
      targetId: person.id,
      status: 'mapped',
    });
  });

  it('teaches manual mappings, rejects collisions, and stops matching a removed alias', async () => {
    const repository = new ImportRepository(testEnv.DB);
    const staged = await repository.stage({
      kind: 'normal',
      name: 'Manual Alias',
      fileName: 'manual-alias.xlsx',
      sha256: 'manual-alias-sha',
      effectiveFrom: '2121-01-01',
      effectiveTo: '2121-01-02',
      candidate: importCandidate('Bennett, Avery'),
      issues: [],
      actorId: 'user_local_admin',
    });
    const mapped = await repository.mapValue({
      importId: staged.id,
      kind: 'staff',
      displayValue: 'Bennett, Avery',
      targetId: 'staff_avery_bennett',
      createNew: false,
    });
    expect(mapped.staffMappings[0]).toMatchObject({
      targetId: 'staff_avery_bennett',
      status: 'mapped',
    });
    const collision = await api('/api/staff/staff_jordan_kim/aliases', 'POST', {
      displayValue: 'Bennett, Avery',
    });
    expect(collision.response.status).toBe(409);
    expect(collision.payload.error?.code).toBe('staff_alias_conflict');

    const future = await repository.stage({
      kind: 'normal',
      name: 'Manual Alias Reuse',
      fileName: 'manual-alias-reuse.xlsx',
      sha256: 'manual-alias-reuse-sha',
      effectiveFrom: '2122-01-01',
      effectiveTo: '2122-01-02',
      candidate: importCandidate('Bennett, Avery'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(future.staffMappings[0]?.targetId).toBe('staff_avery_bennett');

    const alias = await testEnv.DB.prepare(
      `SELECT id FROM staff_aliases WHERE staff_id = 'staff_avery_bennett' AND normalized_value = 'bennett, avery'`,
    ).first<{ id: string }>();
    expect(alias).toBeTruthy();
    await api(`/api/staff/staff_avery_bennett/aliases/${alias!.id}`, 'DELETE');
    const afterRemoval = await repository.stage({
      kind: 'normal',
      name: 'Removed Alias',
      fileName: 'removed-alias.xlsx',
      sha256: 'removed-alias-sha',
      effectiveFrom: '2123-01-01',
      effectiveTo: '2123-01-02',
      candidate: importCandidate('Bennett, Avery'),
      issues: [],
      actorId: 'user_local_admin',
    });
    expect(afterRemoval.staffMappings[0]?.targetId).toBeNull();
  });

  it('adds, renames, deactivates, and reactivates rooms without changing identity', async () => {
    const created = await api('/api/rooms', 'POST', { name: 'FOUNDATION-1' });
    const room = created.payload.data?.room as { id: string };
    expect(created.response.status).toBe(201);
    const renamed = await api(`/api/rooms/${room.id}`, 'PATCH', {
      name: 'FOUNDATION-2',
    });
    expect(renamed.payload.data?.room).toMatchObject({
      id: room.id,
      name: 'FOUNDATION-2',
      isActive: true,
    });
    await testEnv.DB.prepare(
      `INSERT INTO schedule_entries (
         id, schedule_version_id, staff_id, day_type, start_time, end_time,
         activity_type, category, description, room_id, requires_sub
       ) VALUES ('foundation_room_history', 'schedule_2026_fall',
                 'staff_jordan_kim', 'ALL', '15:40', '15:50', 'other',
                 'AFTER_SCHOOL_OTHER', 'Historical Room Reference', ?, 0)`,
    )
      .bind(room.id)
      .run();
    const inactive = await api(`/api/rooms/${room.id}/deactivate`, 'POST', {});
    expect(inactive.payload.data?.room).toMatchObject({
      id: room.id,
      isActive: false,
    });
    expect(
      await testEnv.DB.prepare(
        `SELECT room_id FROM schedule_entries WHERE id = 'foundation_room_history'`,
      ).first(),
    ).toEqual({ room_id: room.id });
    const activeList = await api('/api/rooms');
    expect(
      (activeList.payload.data?.rooms as { id: string }[]).some(
        (item) => item.id === room.id,
      ),
    ).toBe(false);
    const reactivated = await api(
      `/api/rooms/${room.id}/reactivate`,
      'POST',
      {},
    );
    expect(reactivated.payload.data?.room).toMatchObject({
      id: room.id,
      isActive: true,
    });
  });
});
