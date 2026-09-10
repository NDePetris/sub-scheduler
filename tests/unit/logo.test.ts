import { describe, expect, it } from 'vitest';

import { HttpError } from '../../worker/http';
import { MAX_SCHOOL_LOGO_BYTES, validateSchoolLogo } from '../../worker/logo';

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

describe('school-logo upload validation', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ] as const)('accepts a valid %s signature', (contentType, payload) => {
    expect(validateSchoolLogo(contentType, payload)).toMatchObject({
      contentType,
    });
  });

  it.each([
    ['image/png', new ArrayBuffer(0), 'empty_logo'],
    ['image/gif', PNG, 'unsupported_logo_type'],
    ['image/svg+xml', PNG, 'unsupported_logo_type'],
    ['image/jpeg', PNG, 'logo_content_mismatch'],
    ['image/png', bytes(0x89, 0x50, 0x4e), 'invalid_logo_signature'],
    ['image/jpeg', bytes(0xff, 0xd8), 'invalid_logo_signature'],
    ['image/webp', bytes(0x52, 0x49, 0x46, 0x46), 'invalid_logo_signature'],
  ] as const)('rejects invalid input (%s)', (contentType, payload, code) => {
    expectHttpError(() => validateSchoolLogo(contentType, payload), code);
  });

  it('rejects payloads larger than 2 MiB', () => {
    expectHttpError(
      () =>
        validateSchoolLogo(
          'image/png',
          new ArrayBuffer(MAX_SCHOOL_LOGO_BYTES + 1),
        ),
      'logo_too_large',
    );
  });
});

function bytes(...values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

function expectHttpError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected logo validation to fail.');
  } catch (cause) {
    expect(cause).toBeInstanceOf(HttpError);
    expect((cause as HttpError).code).toBe(code);
  }
}
