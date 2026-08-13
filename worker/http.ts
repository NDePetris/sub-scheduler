export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
} as const;

export function jsonSuccess<T>(
  data: T,
  requestId: string,
  status = 200,
): Response {
  return Response.json(
    { ok: true, data },
    { status, headers: { ...JSON_HEADERS, 'x-request-id': requestId } },
  );
}

export function jsonError(error: HttpError, requestId: string): Response {
  return Response.json(
    {
      ok: false,
      error: { code: error.code, message: error.message, requestId },
    },
    {
      status: error.status,
      headers: { ...JSON_HEADERS, 'x-request-id': requestId },
    },
  );
}
