import { z } from 'zod';

import type { StaffRole } from '@/domain/staff';

const staffSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: z.enum(['Teacher', 'Administrator', 'Staff']),
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
    schoolSubs: z.array(staffSchema),
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
  readonly role: StaffRole;
  readonly isSchoolSub: boolean;
}

export type { StaffRole } from '@/domain/staff';

export interface ManagedStaffData {
  readonly id: string;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly isActive: boolean;
  readonly canSub: boolean;
  readonly isSchoolSub: boolean;
  readonly standardPeriodMinutes: number | null;
  readonly inferredStandardPeriodMinutes: number | null;
  readonly aliases: readonly {
    readonly id: string;
    readonly displayValue: string;
  }[];
}

export interface RoomData {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface PlanAssignment {
  readonly id: string;
  readonly sourceScheduleEntryId: string | null;
  readonly sourceSpecialScheduleEntryId: string | null;
  readonly sharedResponsibilityKey: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly responsibilityType:
    'instruction' | 'duty' | 'after_school' | 'other';
  readonly description: string;
  readonly roomId: string | null;
  readonly room: string | null;
  readonly scheduledRoomId: string | null;
  readonly scheduledRoom: string | null;
  readonly absentStaff: StaffData;
  readonly assignedStaff: StaffData | null;
  readonly resolutionSource:
    | 'School Sub'
    | 'PLAN'
    | 'Admin'
    | 'Available'
    | 'Manual'
    | 'Override'
    | 'Scheduled'
    | null;
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
    readonly calendar: {
      readonly isSchoolDay: boolean;
      readonly isBlackoutDay: boolean;
      readonly expectsSpecialSchedule: boolean;
      readonly label: string | null;
      readonly specialScheduleExpectedWarning: boolean;
    };
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
    readonly roomId: string | null;
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
    readonly generatedHtml: string;
    readonly editedHtml: string;
    readonly generatedAt: string;
  } | null;
}

export interface CalendarDateData {
  readonly date: string;
  readonly expectedDayType: 'A' | 'B' | null;
  readonly isSchoolDay: boolean;
  readonly isBlackoutDay: boolean;
  readonly expectsSpecialSchedule: boolean;
  readonly label: string | null;
}

export async function listCalendarDates(): Promise<CalendarDateData[]> {
  return (
    await apiRequest<{ records: CalendarDateData[] }>('/api/calendar-dates')
  ).records;
}

export async function replaceCalendarDates(
  records: readonly CalendarDateData[],
): Promise<CalendarDateData[]> {
  return (
    await apiRequest<{ records: CalendarDateData[] }>(
      '/api/calendar-dates/replace',
      {
        method: 'PUT',
        body: JSON.stringify({ records }),
      },
    )
  ).records;
}

export interface CandidatePreview {
  readonly id: string;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly isSchoolSub: boolean;
  readonly isDefaultCandidate: boolean;
  readonly availability:
    'default' | 'school_sub' | 'plan' | 'admin' | 'open' | 'manual';
  readonly availabilitySource: string;
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly currentBurden: number | null;
  readonly proposedBurden: number | null;
  readonly projectedBurden: number | null;
  readonly standardPeriodMinutes: number | null;
  readonly standardPeriodSource: 'configured' | 'auto' | null;
  readonly workloadKnown: boolean;
  readonly threshold: number;
  readonly windowDays: number;
}

export interface SoloCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'scheduled' | 'replacement';
  readonly conflicts: readonly string[];
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

export async function listStaff(
  signal?: AbortSignal,
  includeInactive = false,
): Promise<ManagedStaffData[]> {
  const result = await apiRequest<{ staff: ManagedStaffData[] }>(
    `/api/staff${includeInactive ? '?includeInactive=true' : ''}`,
    {
      signal,
    },
  );
  return result.staff;
}

export async function listRooms(
  signal?: AbortSignal,
  includeInactive = false,
): Promise<RoomData[]> {
  const result = await apiRequest<{ rooms: RoomData[] }>(
    `/api/rooms${includeInactive ? '?includeInactive=true' : ''}`,
    { signal },
  );
  return result.rooms;
}

export interface StaffWriteInput {
  readonly displayName: string;
  readonly role: StaffRole;
  readonly canSub: boolean;
  readonly isSchoolSub: boolean;
  readonly standardPeriodMinutes: 40 | 50 | null;
}

export async function createStaff(
  input: StaffWriteInput,
): Promise<ManagedStaffData> {
  const result = await apiRequest<{ staff: ManagedStaffData }>('/api/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.staff;
}

export async function updateStaff(
  id: string,
  input: StaffWriteInput,
): Promise<ManagedStaffData> {
  const result = await apiRequest<{ staff: ManagedStaffData }>(
    `/api/staff/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return result.staff;
}

export async function setStaffActive(
  id: string,
  active: boolean,
): Promise<ManagedStaffData> {
  const result = await apiRequest<{ staff: ManagedStaffData }>(
    `/api/staff/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
    { method: 'POST', body: '{}' },
  );
  return result.staff;
}

export async function addStaffAlias(
  id: string,
  displayValue: string,
): Promise<ManagedStaffData> {
  const result = await apiRequest<{ staff: ManagedStaffData }>(
    `/api/staff/${encodeURIComponent(id)}/aliases`,
    { method: 'POST', body: JSON.stringify({ displayValue }) },
  );
  return result.staff;
}

export async function removeStaffAlias(
  id: string,
  aliasId: string,
): Promise<ManagedStaffData> {
  const result = await apiRequest<{ staff: ManagedStaffData }>(
    `/api/staff/${encodeURIComponent(id)}/aliases/${encodeURIComponent(aliasId)}`,
    { method: 'DELETE' },
  );
  return result.staff;
}

export async function createRoom(name: string): Promise<RoomData> {
  const result = await apiRequest<{ room: RoomData }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return result.room;
}

export async function updateRoom(id: string, name: string): Promise<RoomData> {
  const result = await apiRequest<{ room: RoomData }>(
    `/api/rooms/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
  );
  return result.room;
}

export async function setRoomActive(
  id: string,
  active: boolean,
): Promise<RoomData> {
  const result = await apiRequest<{ room: RoomData }>(
    `/api/rooms/${encodeURIComponent(id)}/${active ? 'reactivate' : 'deactivate'}`,
    { method: 'POST', body: '{}' },
  );
  return result.room;
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

export async function removeAbsence(
  absenceId: string,
  input: {
    readonly currentDate: string;
    readonly scope: 'current_date' | 'entire_block';
  },
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/absences/${encodeURIComponent(absenceId)}`,
    { method: 'DELETE', body: JSON.stringify(input) },
  );
  return result.detail;
}

export async function getCandidates(
  assignmentId: string,
  options: {
    readonly startTime?: string;
    readonly endTime?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<CandidatePreview[]> {
  const search = new URLSearchParams();
  if (options.startTime) search.set('startTime', options.startTime);
  if (options.endTime) search.set('endTime', options.endTime);
  const query = search.size > 0 ? `?${search.toString()}` : '';
  const result = await apiRequest<{ candidates: CandidatePreview[] }>(
    `/api/assignments/${encodeURIComponent(assignmentId)}/candidates${query}`,
    { signal: options.signal },
  );
  return result.candidates;
}

export async function getCandidatesWithSolo(
  assignmentId: string,
  signal?: AbortSignal,
): Promise<{
  readonly candidates: CandidatePreview[];
  readonly soloCandidates: SoloCandidate[];
}> {
  return apiRequest<{
    candidates: CandidatePreview[];
    soloCandidates: SoloCandidate[];
  }>(`/api/assignments/${encodeURIComponent(assignmentId)}/candidates`, {
    signal,
  });
}

export async function resolveAssignment(
  assignmentId: string,
  input: AssignmentResolutionInput,
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/assignments/${encodeURIComponent(assignmentId)}/resolve`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return result.detail;
}

export interface TeacherBulkResult {
  readonly changed: number;
  readonly alreadyAssigned: number;
  readonly skipped: number;
  readonly conflicted: number;
  readonly noDefault: number;
}

export async function coverTeacherWithSchoolSub(
  planId: string,
  absentStaffId: string,
): Promise<{
  readonly detail: PlanDetail;
  readonly result: TeacherBulkResult;
}> {
  return apiRequest(
    `/api/daily-sub-plans/${encodeURIComponent(planId)}/cover-with-school-sub`,
    { method: 'POST', body: JSON.stringify({ absentStaffId }) },
  );
}

export async function restoreTeacherDefaults(
  planId: string,
  absentStaffId: string,
): Promise<{
  readonly detail: PlanDetail;
  readonly result: TeacherBulkResult;
}> {
  return apiRequest(
    `/api/daily-sub-plans/${encodeURIComponent(planId)}/restore-defaults`,
    { method: 'POST', body: JSON.stringify({ absentStaffId }) },
  );
}

export async function markUncoveredDuties(planId: string): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/daily-sub-plans/${encodeURIComponent(planId)}/mark-uncovered-duties`,
    { method: 'POST', body: '{}' },
  );
  return result.detail;
}

export type AssignmentResolutionInput =
  | {
      readonly action: 'assign';
      readonly staffId: string;
      readonly assignAnyway: boolean;
    }
  | {
      readonly action: 'solo_coverage';
      readonly staffId: string;
      readonly assignAnyway: boolean;
    }
  | {
      readonly action: 'leave_uncovered';
      readonly acknowledged: boolean;
    }
  | { readonly action: 'clear_resolution' }
  | {
      readonly action: 'split';
      readonly segments: readonly {
        readonly staffId: string;
        readonly startTime: string;
        readonly endTime: string;
      }[];
      readonly assignAnyway: boolean;
    }
  | {
      readonly action: 'combine_class';
      readonly receivingScheduleEntryId: string;
      readonly roomId: string | null;
      readonly note: string | null;
      readonly overrideAcknowledged: boolean;
    }
  | {
      readonly action: 'redistribute';
      readonly receivingStaffIds: readonly string[];
      readonly roomId: string | null;
      readonly note: string | null;
      readonly overrideAcknowledged: boolean;
    }
  | {
      readonly action: 'update_details';
      readonly roomId: string | null;
      readonly note: string | null;
    };

export async function regenerateMessage(date: string): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/plans/${date}/message/regenerate`,
    { method: 'POST', body: '{}' },
  );
  return result.detail;
}

export async function editMessage(
  date: string,
  editedHtml: string,
): Promise<PlanDetail> {
  const result = await apiRequest<{ detail: PlanDetail }>(
    `/api/plans/${date}/message`,
    {
      method: 'PATCH',
      body: JSON.stringify({ editedHtml }),
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
    throw new ApiError(
      typeof error?.code === 'string' ? error.code : 'request_failed',
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

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
