import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;

describe('Worker and D1 smoke path', () => {
  it('serves D1-backed health information', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/health'),
      testEnv,
    );
    const body: {
      ok: boolean;
      data: { status: string; database: string };
    } = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body).toMatchObject({
      ok: true,
      data: { status: 'ok', database: 'connected' },
    });
  });

  it('returns seeded school and schedule data through the authorized API', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/bootstrap'),
      testEnv,
    );
    const body: {
      ok: boolean;
      data: {
        school: { name: string; timezone: string };
        actor: { email: string };
        summary: {
          activeStaff: number;
          activeRooms: number;
          activeSchedule: { name: string; entryCount: number };
          schoolSubs: { displayName: string; isSchoolSub: boolean }[];
          dayTypeCounts: { A: number; B: number; shared: number };
        };
      };
    } = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: {
        school: { name: 'Fictional Academy', timezone: 'America/Chicago' },
        actor: { email: 'admin@sub-planning.test' },
        summary: {
          activeStaff: 7,
          activeRooms: 6,
          activeSchedule: { name: 'Fictional Fall Schedule', entryCount: 27 },
          schoolSubs: [{ displayName: 'Riley Quinn', isSchoolSub: true }],
          dayTypeCounts: { A: 12, B: 11, shared: 4 },
        },
      },
    });
  });

  it('keeps the School Sub as a normal Staff record in deterministic ordering', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/staff'),
      testEnv,
    );
    const body: {
      data: { staff: { displayName: string; isSchoolSub: boolean }[] };
    } = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.staff[0]).toMatchObject({
      id: 'staff_riley_quinn',
      displayName: 'Riley Quinn',
      role: 'Staff',
      canSub: true,
      isSchoolSub: true,
    });
  });

  it('fails closed when the development identity is not allowlisted', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/bootstrap'),
      {
        ...testEnv,
        DEV_USER_EMAIL: 'unknown@example.test',
      },
    );
    const body: { error: { code: string } } = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('not_authorized');
  });
});
