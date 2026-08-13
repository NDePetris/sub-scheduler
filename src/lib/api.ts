import { z } from 'zod';

const staffSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.string(),
  isSchoolSub: z.boolean(),
});

const bootstrapSchema = z.object({
  school: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    timezone: z.string(),
  }),
  actor: z.object({
    displayName: z.string(),
    email: z.string().email(),
  }),
  summary: z.object({
    activeStaff: z.number().int().nonnegative(),
    activeRooms: z.number().int().nonnegative(),
    activeSchedule: z
      .object({
        id: z.string(),
        name: z.string(),
        effectiveFrom: z.string(),
        entryCount: z.number().int().nonnegative(),
      })
      .nullable(),
    schoolSub: staffSchema.nullable(),
    dayTypeCounts: z.object({
      A: z.number(),
      B: z.number(),
      shared: z.number(),
    }),
  }),
});

const successEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: bootstrapSchema,
});
const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export type BootstrapData = z.infer<typeof bootstrapSchema>;

export async function getBootstrapData(
  signal?: AbortSignal,
): Promise<BootstrapData> {
  const response = await fetch('/api/bootstrap', {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(payload);
    throw new Error(
      parsedError.success
        ? parsedError.data.error.message
        : 'The application API is unavailable.',
    );
  }

  return successEnvelopeSchema.parse(payload).data;
}
