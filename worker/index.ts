import { ApplicationRepository } from './db/application-repository';
import { HttpError, jsonError, jsonSuccess } from './http';
import { createRequestContext } from './identity';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();

    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        throw new HttpError(
          404,
          'not_found',
          'The requested API resource does not exist.',
        );
      }
      if (request.method !== 'GET') {
        throw new HttpError(
          405,
          'method_not_allowed',
          'This endpoint only accepts GET requests.',
        );
      }

      const repository = new ApplicationRepository(env.DB);

      if (url.pathname === '/api/health') {
        await repository.checkConnection();
        return jsonSuccess(
          {
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString(),
          },
          requestId,
        );
      }

      const context = await createRequestContext(env, requestId);

      if (url.pathname === '/api/bootstrap') {
        const bootstrap = await repository.getBootstrapSummary();
        return jsonSuccess(
          {
            ...bootstrap,
            actor: {
              displayName: context.actor.displayName,
              email: context.actor.email,
            },
          },
          requestId,
        );
      }

      if (url.pathname === '/api/staff') {
        return jsonSuccess(
          { staff: await repository.listActiveStaff() },
          requestId,
        );
      }

      throw new HttpError(
        404,
        'not_found',
        'The requested API resource does not exist.',
      );
    } catch (cause) {
      if (cause instanceof HttpError) return jsonError(cause, requestId);
      console.error('Unhandled API error', { requestId, cause });
      return jsonError(
        new HttpError(
          500,
          'internal_error',
          'The server could not complete the request.',
        ),
        requestId,
      );
    }
  },
} satisfies ExportedHandler<Env>;
