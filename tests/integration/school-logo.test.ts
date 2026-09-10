import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../../worker';
import { schoolLogoIdFromUrl, schoolLogoKey } from '../../worker/logo';
import type { Env } from '../../worker/types';

const testEnv = env as unknown as Env;
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

describe.sequential('School logo API', () => {
  it('stores, serves, replaces, and removes the current private logo', async () => {
    const first = await upload('image/png', PNG);
    expect(first.response.status).toBe(200);
    const firstUrl = settings(first.payload).schoolLogoUrl;
    expect(firstUrl).toMatch(/^\/api\/settings\/logo\/[0-9a-f-]{36}$/);
    expect(await storedLogoUrl()).toBe(firstUrl);
    expect(await updatedBy()).toBe('user_local_admin');
    expect((await bootstrap()).school.logoUrl).toBe(firstUrl);

    const firstId = requiredId(firstUrl);
    const firstObject = await testEnv.SCHOOL_ASSETS.get(schoolLogoKey(firstId));
    expect(firstObject).not.toBeNull();
    expect(await firstObject?.arrayBuffer()).toEqual(PNG);
    await expectServed(firstUrl, PNG, 'image/png');
    expect(
      (await request(`${firstUrl}-not-current`, 'GET')).response.status,
    ).toBe(404);

    const second = await upload('image/jpeg', JPEG);
    const secondUrl = settings(second.payload).schoolLogoUrl;
    expect(second.response.status).toBe(200);
    expect(secondUrl).not.toBe(firstUrl);
    expect((await request(firstUrl, 'GET')).response.status).toBe(404);
    expect(await testEnv.SCHOOL_ASSETS.get(schoolLogoKey(firstId))).toBeNull();
    await expectServed(secondUrl, JPEG, 'image/jpeg');

    const third = await upload('image/webp', WEBP);
    const thirdUrl = settings(third.payload).schoolLogoUrl;
    expect(third.response.status).toBe(200);
    expect(thirdUrl).not.toBe(secondUrl);
    await expectServed(thirdUrl, WEBP, 'image/webp');

    const removed = await request('/api/settings/logo', 'DELETE');
    expect(removed.response.status).toBe(200);
    expect(settings(removed.payload).schoolLogoUrl).toBeNull();
    expect(await storedLogoUrl()).toBeNull();
    expect((await bootstrap()).school.logoUrl).toBeNull();
    expect((await request(thirdUrl, 'GET')).response.status).toBe(404);
    expect(
      await testEnv.SCHOOL_ASSETS.get(schoolLogoKey(requiredId(thirdUrl))),
    ).toBeNull();
  });

  it.each([
    ['image/png', new ArrayBuffer(0), 'empty_logo'],
    ['image/gif', PNG, 'unsupported_logo_type'],
    ['image/svg+xml', PNG, 'unsupported_logo_type'],
    ['image/jpeg', PNG, 'logo_content_mismatch'],
    ['image/png', new ArrayBuffer(2 * 1024 * 1024 + 1), 'logo_too_large'],
  ] as const)(
    'rejects invalid upload input',
    async (contentType, body, code) => {
      const result = await upload(contentType, body);
      expect(result.response.status).toBeGreaterThanOrEqual(400);
      expect(result.payload).toMatchObject({ ok: false, error: { code } });
    },
  );

  it('protects logo reads and mutations with the normal allowlist', async () => {
    const unauthorized = { ...testEnv, DEV_USER_EMAIL: 'unknown@example.test' };
    for (const [path, method, contentType, body] of [
      ['/api/settings/logo', 'PUT', 'image/png', PNG],
      ['/api/settings/logo', 'DELETE', undefined, undefined],
      ['/api/settings/logo/not-current', 'GET', undefined, undefined],
    ] as const) {
      const result = await request(
        path,
        method,
        contentType,
        body,
        unauthorized,
      );
      expect(result.response.status).toBe(403);
      expect(result.payload).toMatchObject({
        ok: false,
        error: { code: 'not_authorized' },
      });
    }
  });
});

async function upload(contentType: string, body: ArrayBuffer) {
  return request('/api/settings/logo', 'PUT', contentType, body);
}

async function request(
  path: string,
  method: string,
  contentType?: string,
  body?: ArrayBuffer,
  targetEnv: Env = testEnv,
) {
  const response = await worker.fetch(
    new Request(`https://app.test${path}`, {
      method,
      headers: contentType ? { 'content-type': contentType } : undefined,
      body,
    }),
    targetEnv,
  );
  const payload: unknown = response.headers
    .get('content-type')
    ?.includes('application/json')
    ? await response.json()
    : null;
  return { response, payload };
}

async function bootstrap(): Promise<{ school: { logoUrl: string | null } }> {
  const result = await request('/api/bootstrap', 'GET');
  return (result.payload as { data: { school: { logoUrl: string | null } } })
    .data;
}

async function storedLogoUrl(): Promise<string | null> {
  const row = await testEnv.DB.prepare(
    "SELECT school_logo_url FROM application_settings WHERE id = 'school'",
  ).first<{ school_logo_url: string | null }>();
  return row?.school_logo_url ?? null;
}

async function updatedBy(): Promise<string | null> {
  const row = await testEnv.DB.prepare(
    "SELECT updated_by FROM application_settings WHERE id = 'school'",
  ).first<{ updated_by: string }>();
  return row?.updated_by ?? null;
}
async function expectServed(
  url: string,
  expected: ArrayBuffer,
  contentType: string,
) {
  const result = await request(url, 'GET');
  expect(result.response.status).toBe(200);
  expect(result.response.headers.get('content-type')).toBe(contentType);
  expect(result.response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(result.response.headers.get('cache-control')).toBe(
    'private, max-age=31536000, immutable',
  );
  expect(await result.response.arrayBuffer()).toEqual(expected);
}

function requiredId(url: string): string {
  const id = schoolLogoIdFromUrl(url);
  if (!id) throw new Error('Expected an internal school logo URL.');
  return id;
}

function settings(payload: unknown): { schoolLogoUrl: string } {
  return (payload as { data: { schoolLogoUrl: string } }).data;
}

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}
