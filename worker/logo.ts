import { HttpError } from './http';

export const MAX_SCHOOL_LOGO_BYTES = 2 * 1024 * 1024;
export const SCHOOL_LOGO_URL_PREFIX = '/api/settings/logo/';

export type SchoolLogoContentType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ValidatedSchoolLogo {
  readonly bytes: ArrayBuffer;
  readonly contentType: SchoolLogoContentType;
}

const LOGO_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validateSchoolLogo(
  contentTypeHeader: string | null,
  bytes: ArrayBuffer,
): ValidatedSchoolLogo {
  const contentType = declaredLogoContentType(contentTypeHeader);
  if (!contentType) {
    throw new HttpError(
      415,
      'unsupported_logo_type',
      'School logos must be PNG, JPEG, or WebP images.',
    );
  }
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'empty_logo', 'Choose a non-empty image file.');
  }
  if (bytes.byteLength > MAX_SCHOOL_LOGO_BYTES) {
    throw new HttpError(
      413,
      'logo_too_large',
      'School logos must be 2 MiB or smaller.',
    );
  }

  const detectedType = signatureContentType(new Uint8Array(bytes));
  if (!detectedType) {
    throw new HttpError(
      400,
      'invalid_logo_signature',
      'The uploaded file is not a valid PNG, JPEG, or WebP image.',
    );
  }
  if (detectedType !== contentType) {
    throw new HttpError(
      400,
      'logo_content_mismatch',
      'The image bytes do not match the declared Content-Type.',
    );
  }

  return { bytes, contentType };
}

export function schoolLogoUrl(id: string): string {
  return `${SCHOOL_LOGO_URL_PREFIX}${id}`;
}

export function schoolLogoKey(id: string): string {
  return `school-logos/${id}`;
}

export function schoolLogoIdFromUrl(url: string | null): string | null {
  if (!url?.startsWith(SCHOOL_LOGO_URL_PREFIX)) return null;
  const id = url.slice(SCHOOL_LOGO_URL_PREFIX.length);
  return LOGO_ID_PATTERN.test(id) ? id : null;
}

export function isSchoolLogoContentType(
  value: string | undefined,
): value is SchoolLogoContentType {
  return (
    value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
  );
}

function declaredLogoContentType(
  contentTypeHeader: string | null,
): SchoolLogoContentType | null {
  const value = contentTypeHeader?.split(';', 1)[0]?.trim().toLowerCase();
  return isSchoolLogoContentType(value) ? value : null;
}

function signatureContentType(bytes: Uint8Array): SchoolLogoContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
