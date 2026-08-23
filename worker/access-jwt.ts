import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface CloudflareAccessConfiguration {
  readonly issuer: string;
  readonly audience: string;
}

export interface AccessJwtVerifier {
  verify(
    token: string,
    configuration: CloudflareAccessConfiguration,
  ): Promise<unknown>;
}

let cachedJwks:
  | {
      readonly issuer: string;
      readonly keySet: ReturnType<typeof createRemoteJWKSet>;
    }
  | undefined;

export const cloudflareAccessJwtVerifier: AccessJwtVerifier = {
  async verify(token, configuration) {
    const keySet = getCloudflareAccessJwks(configuration.issuer);
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      audience: configuration.audience,
      issuer: configuration.issuer,
      requiredClaims: ['email', 'exp'],
    });
    return payload;
  },
};

function getCloudflareAccessJwks(issuer: string) {
  if (cachedJwks?.issuer === issuer) return cachedJwks.keySet;

  const keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  cachedJwks = { issuer, keySet };
  return keySet;
}
