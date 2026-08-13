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

export interface StaffData {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isSchoolSub: boolean;
}

export interface RoomData {
  readonly id: string;
  readonly name: string;
}

export interface PlanAssignment {
  readonly id: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly responsibilityType:
    'instruction' | 'duty' | 'after_school' | 'other';
  readonly description: string;
  readonly room: string | null;
  readonly absentStaff: StaffData;
  readonly assignedStaff: StaffData | null;
  readonly resolutionType: string | null;
  readonly resolutionDetails: unknown;
  readonly status: 'unresolved' | 'assigned' | 'intentionally_uncovered';
  readonly isDefault: boolean;
  readonly conflictExplanation: string | null;
  readonly defaultAction: {
    readonly id: string;
    readonly actionType: string;
    readonly staffId: string | null;
    readonly staffName: string | null;
    readonly details: unknown;
  } | null;
  readonly segments: readonly {
    readonly id: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly staffId: string;
    readonly staffName: string;
  }[];
}

export interface PlanDetail {
  readonly plan: {
    readonly id: string;
    readonly date: string;
    readonly dayType: 'A' | 'B';
    readonly expectedDayType: 'A' | 'B';
    readonly scheduleVersionId: string;
    readonly scheduleName: string;
    readonly specialScheduleId: string | null;
    readonly status: 'draft' | 'finalized';
    readonly finalizedAt: string | null;
    readonly finalizedBy: string | null;
  };
  readonly absences: readonly {
    readonly id: string;
    readonly staffId: string;
    readonly staffName: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly startTime: string | null;
    readonly endTime: string | null;
  }[];
  readonly assignments: readonly PlanAssignment[];
  readonly schedule: readonly {
    readonly id: string;
    readonly staffId: string;
    readonly staffName: string;
    readonly dayType: 'A' | 'B' | 'ALL';
    readonly startTime: string;
    readonly endTime: string;
    readonly activityType: string;
    readonly category: string;
    readonly description: string;
    readonly room: string | null;
  }[];
  readonly summary: {
    readonly teachersAbsent: number;
    readonly assignments: number;
    readonly assigned: number;
    readonly unresolved: number;
    readonly workloadWarnings: number;
  };
  readonly settings: {
    readonly workloadThreshold: number;
    readonly workloadWindowDays: number;
    readonly splitSnapMinutes: number;
  };
  readonly message: {
    readonly generatedText: string;
    readonly editedText: string;
    readonly generatedAt: string;
  } | null;
}

export interface CandidatePreview {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isSchoolSub: boolean;
  readonly availability: 'default' | 'school_sub' | 'plan' | 'admin' | 'manual';
  readonly availabilitySource: string;
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly currentBurden: number;
  readonly proposedBurden: number;
  readonly projectedBurden: number;
  readonly threshold: number;
  readonly windowDays: number;
}

export interface ScheduleImportDetail {
  readonly id: string;
  readonly sourceFileName: string;
  readonly sourceFileSha256: string;
  readonly status: 'staged' | 'ready' | 'activated' | 'failed';
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sheetName: string | null;
  readonly aBDetected: boolean;
  readonly createdAt: string;
  readonly activatedScheduleVersionId: string | null;
  readonly activatedAt: string | null;
  readonly entryCount: number;
  readonly staffMappings: readonly ImportMapping[];
  readonly roomMappings: readonly ImportMapping[];
  readonly unmappedStaff: number;
  readonly unmappedRooms: number;
  readonly recognizedStaff: number;
  readonly recognizedRooms: number;
  readonly blockingErrors: number;
  readonly warnings: number;
  readonly issues: readonly {
    readonly severity: 'error' | 'warning';
    readonly code: string;
    readonly message: string;
    readonly sheet: string | null;
    readonly cell: string | null;
  }[];
}

export interface ImportMapping {
  readonly displayValue: string;
  readonly targetId: string | null;
  readonly status: 'unmapped' | 'exact' | 'mapped' | 'created';
}

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

export async function listStaff(signal?: AbortSignal): Promise<StaffData[]> {
  const result = await apiRequest<{ staff: StaffData[] }>('/api/staff', {
    signal,
  });
  return result.staff;
}

export async function listRooms(signal?: AbortSignal): Promise<RoomData[]> {
  const result = await apiRequest<{ rooms: RoomData[] }>('/api/rooms', {
    signal,
  });
  return result.rooms;
}

export async function ensurePlan(
  date: string,
  dayType?: 'A' | 'B',
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>('/api/plans/ensure', {
    method: 'POST',
    body: JSON.stringify({ date, dayType }),
  });
  return result.detail;
}

export async function getPlan(date: string): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(`/api/plans/${date}`);
  return result.detail;
}

export async function addAbsence(input: {
  readonly staffId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
}): Promise<void> {
  await apiRequest('/api/absences', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCandidates(
  assignmentId: string,
): Promise<CandidatePreview[]> {
  const result = await apiRequest<{ candidates: CandidatePreview[] }>(
    `/api/assignments/${encodeURIComponent(assignmentId)}/candidates`,
  );
  return result.candidates;
}

export async function resolveAssignment(
  assignmentId: string,
  input: Record<string, unknown>,
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/assignments/${encodeURIComponent(assignmentId)}/resolve`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return result.detail;
}

export async function regenerateMessage(date: string): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/plans/${date}/message/regenerate`,
    { method: 'POST', body: '{}' },
  );
  return result.detail;
}

export async function editMessage(
  date: string,
  editedText: string,
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/plans/${date}/message`,
    {
      method: 'PATCH',
      body: JSON.stringify({ editedText }),
    },
  );
  return result.detail;
}

export async function setPlanStatus(
  date: string,
  status: 'draft' | 'finalized',
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/plans/${date}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ status }),
    },
  );
  return result.detail;
}

export async function listScheduleImports(): Promise<ScheduleImportDetail[]> {
  const result = await apiRequest<{ imports: ScheduleImportDetail[] }>(
    '/api/schedule-imports',
  );
  return result.imports;
}

export async function uploadScheduleImport(input: {
  readonly file: File;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
}): Promise<ScheduleImportDetail> {
  const form = new FormData();
  form.set('file', input.file);
  form.set('effectiveFrom', input.effectiveFrom);
  if (input.effectiveTo) form.set('effectiveTo', input.effectiveTo);
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    '/api/schedule-imports',
    {
      method: 'POST',
      body: form,
    },
  );
  return result.import;
}

export async function mapImportValue(
  importId: string,
  input: {
    readonly kind: 'staff' | 'room';
    readonly displayValue: string;
    readonly targetId?: string;
    readonly createNew: boolean;
  },
): Promise<ScheduleImportDetail> {
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    `/api/schedule-imports/${importId}/mappings`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return result.import;
}

export async function activateScheduleImport(
  importId: string,
  name: string,
): Promise<ScheduleImportDetail> {
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    `/api/schedule-imports/${importId}/activate`,
    { method: 'POST', body: JSON.stringify({ name }) },
  );
  return result.import;
}

async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (typeof init.body === 'string')
    headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload: unknown = await response.json();
  if (!isRecord(payload))
    throw new Error('The application API returned an invalid response.');
  if (payload.ok === false) {
    const error = isRecord(payload.error) ? payload.error : null;
    throw new Error(
      typeof error?.message === 'string'
        ? error.message
        : 'The request failed.',
    );
  }
  if (payload.ok !== true || !('data' in payload)) {
    throw new Error('The application API returned an invalid response.');
  }
  return payload.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
