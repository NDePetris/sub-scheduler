import { z } from 'zod';

import {
  cloudflareAccessJwtVerifier,
  type AccessJwtVerifier,
  type CloudflareAccessConfiguration,
} from './access-jwt';
import { HttpError } from './http';
import type { Env, RequestContext } from './types';

const environmentSchema = z.enum(['local', 'test', 'production']);
const emailSchema = z.string().trim().toLowerCase().email();
const accessJwtClaimsSchema = z.object({ email: emailSchema });

interface AuthorizedUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

export async function createRequestContext(
  env: Env,
  request: Request,
  requestId: string,
  accessJwtVerifier: AccessJwtVerifier = cloudflareAccessJwtVerifier,
): Promise<RequestContext> {
  const environment = environmentSchema.safeParse(env.APP_ENV);
  if (!environment.success) {
    throw new HttpError(
      503,
      'identity_not_configured',
      'Production identity verification is not configured for this environment.',
    );
  }

  const email =
    environment.data === 'production'
      ? await getProductionEmail(env, request, accessJwtVerifier)
      : getDevelopmentEmail(env);

  const user = await env.DB.prepare(
    `SELECT id, email, display_name, role
       FROM authorized_users
      WHERE email = ? AND is_active = 1`,
  )
    .bind(email)
    .first<AuthorizedUserRow>();

  if (!user || user.role !== 'administrator') {
    throw new HttpError(
      403,
      'not_authorized',
      'This account is not authorized to administer the app.',
    );
  }

  return {
    requestId,
    actor: {
      id: user.id,
      email: user.email.toLowerCase(),
      displayName: user.display_name,
      role: 'administrator',
    },
  };
}

function getDevelopmentEmail(env: Env): string {
  const email = emailSchema.safeParse(env.DEV_USER_EMAIL);
  if (email.success) return email.data;

  throw new HttpError(
    503,
    'development_identity_missing',
    'Set a valid DEV_USER_EMAIL in .dev.vars for local development.',
  );
}

async function getProductionEmail(
  env: Env,
  request: Request,
  accessJwtVerifier: AccessJwtVerifier,
): Promise<string> {
  const configuration = getCloudflareAccessConfiguration(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    throw new HttpError(
      401,
      'access_token_missing',
      'Cloudflare Access did not provide an identity assertion.',
    );
  }

  try {
    const claims = await accessJwtVerifier.verify(token, configuration);
    const parsedClaims = accessJwtClaimsSchema.safeParse(claims);
    if (!parsedClaims.success) throw new Error('Access token has no email.');
    return parsedClaims.data.email;
  } catch {
    throw new HttpError(
      401,
      'access_token_invalid',
      'The Cloudflare Access identity assertion is invalid or expired.',
    );
  }
}

function getCloudflareAccessConfiguration(
  env: Env,
): CloudflareAccessConfiguration {
  const teamDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CLOUDFLARE_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) {
    throw new HttpError(
      503,
      'production_identity_configuration_missing',
      'Set CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD for production identity verification.',
    );
  }

  const issuer = normalizeTeamDomain(teamDomain);
  if (!issuer) {
    throw new HttpError(
      503,
      'production_identity_configuration_invalid',
      'CLOUDFLARE_ACCESS_TEAM_DOMAIN must be an HTTPS Cloudflare Access team domain.',
    );
  }

  return { issuer, audience };
}

function normalizeTeamDomain(value: string): string | null {
  const candidate = value.includes('://') ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !url.hostname.endsWith('.cloudflareaccess.com')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
