import { describe, expect, it } from 'vitest';

import { serializeErrorForLog } from '../../worker/error-logging';

describe('serializeErrorForLog', () => {
  it('preserves non-enumerable Error diagnostics', () => {
    const cause = new Error('database connection failed');

    expect(Object.keys(cause)).not.toContain('message');
    const serialized = serializeErrorForLog(cause);
    expect(serialized).toMatchObject({
      kind: 'error',
      name: 'Error',
      message: 'database connection failed',
    });
    expect(serialized.kind).toBe('error');
    if (serialized.kind === 'error')
      expect(typeof serialized.stack).toBe('string');
  });

  it('serializes nested Error causes', () => {
    const cause = new Error('request failed', {
      cause: new TypeError('database connection failed'),
    });

    const serialized = serializeErrorForLog(cause);
    expect(serialized).toMatchObject({
      kind: 'error',
      name: 'Error',
      message: 'request failed',
      cause: {
        kind: 'error',
        name: 'TypeError',
        message: 'database connection failed',
      },
    });
    expect(serialized.kind).toBe('error');
    if (serialized.kind === 'error' && serialized.cause?.kind === 'error') {
      expect(typeof serialized.cause.stack).toBe('string');
    }
  });

  it('records non-Error thrown values without copying object contents', () => {
    expect(serializeErrorForLog('connection failed')).toEqual({
      kind: 'non-error',
      type: 'string',
      value: 'connection failed',
    });
    expect(serializeErrorForLog({ authorization: 'do-not-log' })).toEqual({
      kind: 'non-error',
      type: 'object',
    });
  });
});
