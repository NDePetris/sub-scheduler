import { describe, expect, it, vi } from 'vitest';

import type { AccessJwtVerifier } from '../../worker/access-jwt';
import { createRequestContext } from '../../worker/identity';
import type { Env } from '../../worker/types';

interface AuthorizedUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

const administrator: AuthorizedUserRow = {
  id: 'user_admin',
  email: 'admin@sub-planning.test',
  display_name: 'Administrator',
  role: 'administrator',
};

describe('request identity', () => {
  it('resolves a local or test development identity through the allowlist', async () => {
    await expect(
      createRequestContext(
        makeEnv(administrator),
        new Request('https://app.test/api/bootstrap'),
        'request-id',
      ),
    ).resolves.toMatchObject({ actor: { id: administrator.id } });
  });

  it('rejects a missing, unknown, inactive, or non-administrator development identity', async () => {
    await expect(
      createRequestContext(
        makeEnv(administrator, { DEV_USER_EMAIL: undefined }),
        new Request('https://app.test/api/bootstrap'),
        'request-id',
      ),
    ).rejects.toMatchObject({ code: 'development_identity_missing' });

    for (const user of [null, { ...administrator, role: 'staff' }]) {
      await expect(
        createRequestContext(
          makeEnv(user),
          new Request('https://app.test/api/bootstrap'),
          'request-id',
        ),
      ).rejects.toMatchObject({ status: 403, code: 'not_authorized' });
    }
  });

  it('uses a verified production token email and still enforces the allowlist', async () => {
    const verified = verifiedEmail('admin@sub-planning.test');
    const context = await createRequestContext(
      makeEnv(administrator, { APP_ENV: 'production' }),
      accessRequest(),
      'request-id',
      verified.verifier,
    );

    expect(context.actor.email).toBe('admin@sub-planning.test');
    expect(verified.verify).toHaveBeenCalledWith('verified-token', {
      issuer: 'https://school.cloudflareaccess.com',
      audience: 'school-sub-planning-audience',
    });

    await expect(
      createRequestContext(
        makeEnv(null, { APP_ENV: 'production' }),
        accessRequest(),
        'request-id',
        verified.verifier,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'not_authorized' });
  });

  it('rejects a missing or invalid production assertion without using DEV_USER_EMAIL', async () => {
    await expect(
      createRequestContext(
        makeEnv(administrator, { APP_ENV: 'production' }),
        new Request('https://app.test/api/bootstrap'),
        'request-id',
      ),
    ).rejects.toMatchObject({ status: 401, code: 'access_token_missing' });

    const invalidVerifier: AccessJwtVerifier = {
      verify: vi.fn().mockRejectedValue(new Error('invalid token')),
    };
    await expect(
      createRequestContext(
        makeEnv(administrator, { APP_ENV: 'production' }),
        accessRequest(),
        'request-id',
        invalidVerifier,
      ),
    ).rejects.toMatchObject({ status: 401, code: 'access_token_invalid' });
  });

  it('fails clearly when the production Access configuration is missing or invalid', async () => {
    await expect(
      createRequestContext(
        makeEnv(administrator, {
          APP_ENV: 'production',
          CLOUDFLARE_ACCESS_AUD: undefined,
        }),
        accessRequest(),
        'request-id',
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: 'production_identity_configuration_missing',
    });

    await expect(
      createRequestContext(
        makeEnv(administrator, {
          APP_ENV: 'production',
          CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'http://school.example.test',
        }),
        accessRequest(),
        'request-id',
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: 'production_identity_configuration_invalid',
    });
  });
});

function makeEnv(
  user: AuthorizedUserRow | null,
  overrides: Partial<Env> = {},
): Env {
  const first = vi.fn().mockResolvedValue(user);
  const bind = vi.fn().mockReturnValue({ first });
  return {
    APP_ENV: 'test',
    CLOUDFLARE_ACCESS_AUD: 'school-sub-planning-audience',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com',
    DB: { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database,
    DEV_USER_EMAIL: 'admin@sub-planning.test',
    ...overrides,
  };
}

function accessRequest(): Request {
  return new Request('https://app.test/api/bootstrap', {
    headers: { 'Cf-Access-Jwt-Assertion': 'verified-token' },
  });
}

function verifiedEmail(email: string) {
  const verify = vi.fn().mockResolvedValue({ email });
  return {
    verifier: { verify } satisfies AccessJwtVerifier,
    verify,
  };
}
