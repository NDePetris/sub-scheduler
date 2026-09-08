export interface LoggedError {
  readonly kind: 'error';
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: LoggedError | LoggedNonError;
}

export interface LoggedNonError {
  readonly kind: 'non-error';
  readonly type: string;
  readonly value?: string | number | boolean | null;
}

const MAX_CAUSE_DEPTH = 5;

/**
 * Makes Error's non-enumerable diagnostic fields visible to structured logs
 * without copying arbitrary thrown objects (which can contain request data).
 */
export function serializeErrorForLog(
  cause: unknown,
): LoggedError | LoggedNonError {
  return serialize(cause, new Set<object>(), 0);
}

function serialize(
  cause: unknown,
  seen: Set<object>,
  depth: number,
): LoggedError | LoggedNonError {
  if (!(cause instanceof Error)) return serializeNonError(cause);

  if (seen.has(cause)) {
    return { kind: 'non-error', type: 'circular_error_cause' };
  }
  if (depth >= MAX_CAUSE_DEPTH) {
    return { kind: 'non-error', type: 'error_cause_depth_exceeded' };
  }

  seen.add(cause);
  const error: {
    kind: 'error';
    name: string;
    message: string;
    stack?: string;
    cause?: LoggedError | LoggedNonError;
  } = {
    kind: 'error',
    name: stringValue(cause.name, 'Error'),
    message: stringValue(cause.message, 'Unknown error'),
  };
  if (typeof cause.stack === 'string') error.stack = cause.stack;

  if ('cause' in cause) error.cause = serialize(cause.cause, seen, depth + 1);
  return error;
}

function serializeNonError(cause: unknown): LoggedNonError {
  if (cause === null) return { kind: 'non-error', type: 'null', value: null };
  switch (typeof cause) {
    case 'string':
    case 'number':
    case 'boolean':
      return { kind: 'non-error', type: typeof cause, value: cause };
    case 'undefined':
      return { kind: 'non-error', type: 'undefined' };
    case 'bigint':
    case 'symbol':
    case 'function':
    case 'object':
      return { kind: 'non-error', type: typeof cause };
  }
  return { kind: 'non-error', type: 'unknown' };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}
