import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  cloudflareAccessJwtVerifier,
  type CloudflareAccessConfiguration,
} from '../../worker/access-jwt';

const configuration: CloudflareAccessConfiguration = {
  issuer: 'https://identity-test.cloudflareaccess.com',
  audience: 'school-sub-planning-test-audience',
};

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = 'test-access-signing-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      expect(String(input)).toBe(
        `${configuration.issuer}/cdn-cgi/access/certs`,
      );
      return Promise.resolve(Response.json({ keys: [publicJwk] }));
    }),
  );
});

afterAll(() => vi.unstubAllGlobals());

describe('Cloudflare Access JWT verification', () => {
  it('accepts an RS256 token issued for the configured Access application', async () => {
    await expect(
      cloudflareAccessJwtVerifier.verify(
        await signAccessToken(),
        configuration,
      ),
    ).resolves.toMatchObject({ email: 'admin@sub-planning.test' });
  });

  it('rejects malformed, expired, wrongly issued, and wrongly scoped tokens', async () => {
    await expect(
      cloudflareAccessJwtVerifier.verify('not-a-jwt', configuration),
    ).rejects.toBeDefined();
    await expect(
      cloudflareAccessJwtVerifier.verify(
        await signAccessToken({ expirationTime: '1 second ago' }),
        configuration,
      ),
    ).rejects.toBeDefined();
    await expect(
      cloudflareAccessJwtVerifier.verify(
        await signAccessToken({ issuer: 'https://other.cloudflareaccess.com' }),
        configuration,
      ),
    ).rejects.toBeDefined();
    await expect(
      cloudflareAccessJwtVerifier.verify(
        await signAccessToken({ audience: 'different-audience' }),
        configuration,
      ),
    ).rejects.toBeDefined();
  });
});

async function signAccessToken(options?: {
  audience?: string;
  expirationTime?: string;
  issuer?: string;
}): Promise<string> {
  return new SignJWT({ email: 'admin@sub-planning.test' })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuedAt()
    .setIssuer(options?.issuer ?? configuration.issuer)
    .setAudience(options?.audience ?? configuration.audience)
    .setExpirationTime(options?.expirationTime ?? '5 minutes')
    .sign(privateKey);
}
