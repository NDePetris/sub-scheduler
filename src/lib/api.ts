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
  readonly resolutionSource:
    'School Sub' | 'PLAN' | 'Admin' | 'Manual' | 'Override' | null;
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
    readonly expectedDayType: 'A' | 'B' | null;
    readonly scheduleVersionId: string | null;
    readonly scheduleName: string | null;
    readonly specialScheduleId: string | null;
    readonly specialScheduleName: string | null;
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
    readonly informationalWarning: string | null;
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
  readonly kind: 'normal' | 'special';
  readonly name: string;
  readonly sourceFileName: string;
  readonly sourceFileSha256: string;
  readonly status: 'staged' | 'ready' | 'activated' | 'failed';
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly specialDate: string | null;
  readonly sheetName: string | null;
  readonly aBDetected: boolean;
  readonly createdAt: string;
  readonly activatedScheduleVersionId: string | null;
  readonly activatedSpecialScheduleId: string | null;
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

export interface ScheduleVersionSummary {
  readonly id: string;
  readonly name: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: 'current' | 'future' | 'historical' | 'archived';
  readonly sourceFileName: string | null;
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly entryCount: number;
  readonly planReferenceCount: number;
  readonly canDelete: boolean;
}

export interface SpecialScheduleSummary {
  readonly id: string;
  readonly date: string;
  readonly name: string;
  readonly status: 'draft' | 'active' | 'archived';
  readonly sourceFileName: string | null;
  readonly createdAt: string;
  readonly entryCount: number;
  readonly planReferenceCount: number;
  readonly canDelete: boolean;
}

export interface ScheduleManagementData {
  readonly schoolDate: string;
  readonly scheduleVersions: readonly ScheduleVersionSummary[];
  readonly specialSchedules: readonly SpecialScheduleSummary[];
}

export interface ActivationPreview {
  readonly action: 'activate' | 'close_predecessor';
  readonly predecessor: {
    readonly id: string;
    readonly name: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: null;
    readonly proposedEffectiveTo: string;
  } | null;
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
  signal?: AbortSignal,
): Promise<CandidatePreview[]> {
  const result = await apiRequest<{ candidates: CandidatePreview[] }>(
    `/api/assignments/${encodeURIComponent(assignmentId)}/candidates`,
    { signal },
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
  readonly kind: 'normal' | 'special';
  readonly name: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly specialDate?: string;
}): Promise<ScheduleImportDetail> {
  const form = new FormData();
  form.set('file', input.file);
  form.set('kind', input.kind);
  form.set('name', input.name);
  if (input.effectiveFrom) form.set('effectiveFrom', input.effectiveFrom);
  if (input.effectiveTo) form.set('effectiveTo', input.effectiveTo);
  if (input.specialDate) form.set('specialDate', input.specialDate);
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    '/api/schedule-imports',
    {
      method: 'POST',
      body: form,
    },
  );
  return result.import;
}

export async function configureScheduleImport(
  importId: string,
  input:
    | {
        readonly kind: 'normal';
        readonly name: string;
        readonly effectiveFrom: string;
        readonly effectiveTo: string | null;
      }
    | {
        readonly kind: 'special';
        readonly name: string;
        readonly date: string;
      },
): Promise<ScheduleImportDetail> {
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    `/api/schedule-imports/${importId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
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
  confirmPredecessorClosure = false,
): Promise<ScheduleImportDetail> {
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    `/api/schedule-imports/${importId}/activate`,
    {
      method: 'POST',
      body: JSON.stringify({ name, confirmPredecessorClosure }),
    },
  );
  return result.import;
}

export async function activateSpecialScheduleImport(
  importId: string,
): Promise<ScheduleImportDetail> {
  const result = await apiRequest<{ import: ScheduleImportDetail }>(
    `/api/schedule-imports/${importId}/activate-special`,
    { method: 'POST', body: JSON.stringify({ confirmed: true }) },
  );
  return result.import;
}

export async function previewScheduleActivation(
  importId: string,
): Promise<ActivationPreview> {
  const result = await apiRequest<{ preview: ActivationPreview }>(
    `/api/schedule-imports/${importId}/activation-preview`,
  );
  return result.preview;
}

export async function deleteScheduleImport(importId: string): Promise<void> {
  await apiRequest(`/api/schedule-imports/${importId}`, { method: 'DELETE' });
}

export async function getScheduleManagement(): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>('/api/schedules');
}

export async function configureSchedule(
  id: string,
  input: {
    readonly name: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
  },
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(`/api/schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSchedule(
  id: string,
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(`/api/schedules/${id}`, {
    method: 'DELETE',
  });
}

export async function archiveSchedule(
  id: string,
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(`/api/schedules/${id}/archive`, {
    method: 'POST',
    body: '{}',
  });
}

export async function configureSpecialSchedule(
  id: string,
  input: { readonly name: string; readonly date: string },
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(`/api/special-schedules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteSpecialSchedule(
  id: string,
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(`/api/special-schedules/${id}`, {
    method: 'DELETE',
  });
}

export async function archiveSpecialSchedule(
  id: string,
): Promise<ScheduleManagementData> {
  return apiRequest<ScheduleManagementData>(
    `/api/special-schedules/${id}/archive`,
    { method: 'POST', body: '{}' },
  );
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
