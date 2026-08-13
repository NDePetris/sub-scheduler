import { z } from 'zod';

import { HttpError } from './http';
import type { Env, RequestContext } from './types';

const environmentSchema = z.enum(['local', 'test']);
const emailSchema = z.string().trim().toLowerCase().email();

interface AuthorizedUserRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

export async function createRequestContext(
  env: Env,
  requestId: string,
): Promise<RequestContext> {
  const environment = environmentSchema.safeParse(env.APP_ENV);
  if (!environment.success) {
    throw new HttpError(
      503,
      'identity_not_configured',
      'Production identity verification is not configured for this environment.',
    );
  }

  const email = emailSchema.safeParse(env.DEV_USER_EMAIL);
  if (!email.success) {
    throw new HttpError(
      503,
      'development_identity_missing',
      'Set a valid DEV_USER_EMAIL in .dev.vars for local development.',
    );
  }

  const user = await env.DB.prepare(
    `SELECT id, email, display_name, role
       FROM authorized_users
      WHERE email = ? AND is_active = 1`,
  )
    .bind(email.data)
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
