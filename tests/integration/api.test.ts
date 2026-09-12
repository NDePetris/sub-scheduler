import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;

function healthDatabase({
  migrationNames = ['0001_initial_schema.sql'],
  unavailable = false,
  unreadableLedger = false,
}: {
  readonly migrationNames?: readonly unknown[];
  readonly unavailable?: boolean;
  readonly unreadableLedger?: boolean;
}): D1Database {
  return {
    prepare(query: string) {
      if (query === 'SELECT 1') {
        return {
          first: () =>
            unavailable
              ? Promise.reject(new Error('database unavailable'))
              : Promise.resolve(null),
        };
      }
      if (query === 'SELECT name FROM d1_migrations ORDER BY id') {
        return {
          all: () =>
            unreadableLedger
              ? Promise.reject(new Error('ledger unavailable'))
              : Promise.resolve({
                  results: migrationNames.map((name) => ({ name })),
                }),
        };
      }
      throw new Error(`Unexpected health query: ${query}`);
    },
  } as unknown as D1Database;
}

describe('Worker and D1 smoke path', () => {
  it('serves D1-backed health information', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/health'),
      { ...testEnv, DEPLOYMENT_VERSION: 'test-commit-sha' },
    );
    const body: {
      ok: boolean;
      data: {
        status: string;
        database: string;
        schema: string;
        deploymentVersion: string;
      };
    } = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body).toMatchObject({
      ok: true,
      data: {
        status: 'ok',
        database: 'connected',
        schema: 'ready',
        deploymentVersion: 'test-commit-sha',
      },
    });
  });

  it('reports a reachable database with a missing migration as schema not ready', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/health'),
      {
        ...testEnv,
        DB: healthDatabase({ migrationNames: [] }),
        DEPLOYMENT_VERSION: 'test-commit-sha',
      },
    );
    const body: {
      ok: boolean;
      data: { status: string; database: string; schema: string };
      error: { code: string; message: string };
    } = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      data: { status: 'error', database: 'connected', schema: 'not_ready' },
      error: {
        code: 'schema_not_ready',
        message: 'The database schema is not ready for this Worker.',
      },
    });
  });

  it('does not report readiness when the migration ledger is malformed or unavailable', async () => {
    for (const database of [
      healthDatabase({ migrationNames: [null] }),
      healthDatabase({ unreadableLedger: true }),
    ]) {
      const response = await worker.fetch(
        new Request('https://app.test/api/health'),
        { ...testEnv, DB: database },
      );
      const body: {
        ok: boolean;
        data: { database: string; schema: string };
        error: { code: string };
      } = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        ok: false,
        data: { database: 'connected', schema: 'not_ready' },
        error: { code: 'schema_not_ready' },
      });
    }
  });

  it('keeps database connectivity failures distinct from schema incompatibility', async () => {
    const response = await worker.fetch(
      new Request('https://app.test/api/health'),
      { ...testEnv, DB: healthDatabase({ unavailable: true }) },
    );
    const body: { ok: boolean; error: { code: string } } =
      await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: { code: 'internal_error' },
    });
    expect(body).not.toHaveProperty('data');
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
