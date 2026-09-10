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

interface SettingsStorageRow {
  school_name: string;
  school_logo_url: string | null;
  school_timezone: string;
  workload_warning_threshold: number;
  workload_window_days: number;
  split_snap_minutes: number;
  message_template: string;
  updated_by: string;
  updated_at: string;
}

describe.sequential('General Settings API', () => {
  it('returns and partially updates only the editable general settings', async () => {
    const before = await testEnv.DB.prepare(
      `SELECT school_name, school_logo_url, school_timezone,
              workload_warning_threshold, workload_window_days,
              split_snap_minutes, message_template, updated_by, updated_at
         FROM application_settings WHERE id = 'school'`,
    ).first<SettingsStorageRow>();
    expect(before).toBeTruthy();

    const initial = await api('/api/settings');
    expect(initial.response.status).toBe(200);
    expect(data(initial.payload)).toEqual({
      schoolName: before?.school_name,
      schoolLogoUrl: before?.school_logo_url,
      workloadWarningThreshold: before?.workload_warning_threshold,
      workloadWindowDays: before?.workload_window_days,
    });

    const nameUpdate = await api('/api/settings', 'PATCH', {
      schoolName: '  Fictional Academy North  ',
    });
    expect(nameUpdate.response.status).toBe(200);
    expect(data(nameUpdate.payload)).toEqual({
      schoolName: 'Fictional Academy North',
      schoolLogoUrl: before?.school_logo_url,
      workloadWarningThreshold: before?.workload_warning_threshold,
      workloadWindowDays: before?.workload_window_days,
    });

    const workloadUpdate = await api('/api/settings', 'PATCH', {
      workloadWarningThreshold: 3.5,
      workloadWindowDays: 14,
    });
    expect(workloadUpdate.response.status).toBe(200);
    expect(data(workloadUpdate.payload)).toEqual({
      schoolName: 'Fictional Academy North',
      schoolLogoUrl: before?.school_logo_url,
      workloadWarningThreshold: 3.5,
      workloadWindowDays: 14,
    });

    const stored = await testEnv.DB.prepare(
      `SELECT school_name, school_logo_url, school_timezone,
              workload_warning_threshold, workload_window_days,
              split_snap_minutes, message_template, updated_by, updated_at
         FROM application_settings WHERE id = 'school'`,
    ).first<SettingsStorageRow>();
    expect(stored).toMatchObject({
      school_name: 'Fictional Academy North',
      workload_warning_threshold: 3.5,
      workload_window_days: 14,
      updated_by: 'user_local_admin',
    });
    expect(stored?.updated_at).not.toBe(before?.updated_at);
    expect(stored?.school_logo_url).toBe(before?.school_logo_url);
    expect(stored?.school_timezone).toBe(before?.school_timezone);
    expect(stored?.split_snap_minutes).toBe(before?.split_snap_minutes);
    expect(stored?.message_template).toBe(before?.message_template);

    const bootstrap = await api('/api/bootstrap');
    expect(
      data<{ school: { name: string } }>(bootstrap.payload).school.name,
    ).toBe('Fictional Academy North');

    const plan = await api('/api/plans/ensure', 'POST', {
      date: '2030-01-02',
      dayType: 'A',
    });
    expect(
      data<{
        detail: {
          settings: { workloadThreshold: number; workloadWindowDays: number };
        };
      }>(plan.payload).detail.settings,
    ).toMatchObject({ workloadThreshold: 3.5, workloadWindowDays: 14 });
  });

  it('rejects invalid or unsupported updates', async () => {
    for (const body of [
      {},
      { schoolName: '   ' },
      { workloadWarningThreshold: 0 },
      { workloadWarningThreshold: -1 },
      { workloadWindowDays: 0 },
      { workloadWindowDays: -1 },
      { workloadWindowDays: 1.5 },
      { schoolTimezone: 'America/New_York' },
      {
        schoolLogoUrl:
          '/api/settings/logo/00000000-0000-0000-0000-000000000000',
      },
    ]) {
      const result = await api('/api/settings', 'PATCH', body);
      expect(result.response.status).toBe(400);
      expect(result.payload).toMatchObject({
        ok: false,
        error: { code: 'invalid_request' },
      });
    }
  });
});
