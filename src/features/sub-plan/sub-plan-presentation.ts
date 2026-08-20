export function formatRoomLabel(room: string | null): string | null {
  const value = room?.trim();
  if (!value) return null;
  if (/^room\b/i.test(value)) return value;
  if (
    /^\d+[A-Za-z]?$/.test(value) ||
    /^[A-Z]{1,4}-\d+[A-Za-z]?$/.test(value) ||
    /^[A-Z]\d+[A-Za-z]?$/.test(value)
  )
    return `Room ${value}`;
  return value;
}

export interface TimelineStaff {
  readonly id: string;
  readonly displayName: string;
}

export interface TimelineScheduleEntry {
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
}

export interface TimelineAssignmentInput {
  readonly id: string;
  readonly sourceScheduleEntryId: string | null;
  readonly sourceSpecialScheduleEntryId: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly description: string;
  readonly absentStaff: TimelineStaff;
  readonly assignedStaff: TimelineStaff | null;
  readonly resolutionSource: string | null;
  readonly resolutionType: string | null;
  readonly resolutionDetails: unknown;
  readonly roomId: string | null;
  readonly room: string | null;
  readonly scheduledRoomId: string | null;
  readonly scheduledRoom: string | null;
  readonly status: 'unresolved' | 'assigned' | 'intentionally_uncovered';
  readonly isDefault: boolean;
  readonly segments: readonly {
    readonly id: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly staffId: string;
    readonly staffName: string;
  }[];
}

export interface FullScheduleTimelineInput {
  readonly plan: {
    readonly dayType: 'A' | 'B';
    readonly specialScheduleId: string | null;
    readonly status: 'draft' | 'finalized';
    readonly finalizedAt?: string | null;
  };
  readonly schedule: readonly TimelineScheduleEntry[];
  readonly assignments: readonly TimelineAssignmentInput[];
}

export type TimelinePlanState = 'planning' | 'finalized';

export interface TimelineAbsentOverlay {
  readonly assignmentId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly label: string;
  readonly tone:
    | 'needs-sub'
    | 'covered'
    | 'split'
    | 'intentionally-uncovered'
    | 'structured';
}

export interface TimelineCoverageOverlay {
  readonly assignmentId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly description: string;
  readonly absentStaffName: string;
  readonly source: string | null;
  readonly planState: TimelinePlanState;
  readonly isSplitSegment: boolean;
}

export interface FullScheduleTimelineRow {
  readonly staffId: string;
  readonly staffName: string;
  readonly isAbsent: boolean;
  readonly entries: readonly TimelineScheduleEntry[];
  readonly absenceOverlays: readonly TimelineAbsentOverlay[];
  readonly coverageOverlays: readonly TimelineCoverageOverlay[];
}

export interface FullScheduleTimeline {
  readonly planState: TimelinePlanState;
  readonly rows: readonly FullScheduleTimelineRow[];
}

/** Builds Full Schedule overlays from the already-hydrated, pinned PlanDetail. */
export function buildFullScheduleTimeline(
  detail: FullScheduleTimelineInput,
): FullScheduleTimeline {
  const planState: TimelinePlanState =
    detail.plan.status === 'finalized' ? 'finalized' : 'planning';
  const applicableEntries = detail.schedule.filter(
    (entry) => entry.dayType === 'ALL' || entry.dayType === detail.plan.dayType,
  );
  const rowMap = new Map<
    string,
    {
      staffId: string;
      staffName: string;
      entries: TimelineScheduleEntry[];
      absenceOverlays: TimelineAbsentOverlay[];
      coverageOverlays: TimelineCoverageOverlay[];
    }
  >();

  const ensureRow = (staffId: string, staffName: string) => {
    let row = rowMap.get(staffId);
    if (!row) {
      row = {
        staffId,
        staffName,
        entries: [],
        absenceOverlays: [],
        coverageOverlays: [],
      };
      rowMap.set(staffId, row);
    }
    return row;
  };

  const entriesById = new Map<string, TimelineScheduleEntry>();
  for (const entry of applicableEntries) {
    entriesById.set(entry.id, entry);
    ensureRow(entry.staffId, entry.staffName).entries.push(entry);
  }

  for (const assignment of detail.assignments) {
    const sourceEntryId = detail.plan.specialScheduleId
      ? assignment.sourceSpecialScheduleEntryId
      : assignment.sourceScheduleEntryId;
    const sourceEntry = sourceEntryId ? entriesById.get(sourceEntryId) : null;
    if (sourceEntry) {
      ensureRow(
        sourceEntry.staffId,
        sourceEntry.staffName,
      ).absenceOverlays.push(absentOverlay(assignment));
    }

    const source = assignment.isDefault
      ? 'Default'
      : assignment.resolutionSource;
    if (assignment.segments.length > 0) {
      for (const segment of assignment.segments) {
        ensureRow(segment.staffId, segment.staffName).coverageOverlays.push({
          assignmentId: assignment.id,
          startTime: segment.startTime,
          endTime: segment.endTime,
          description: assignment.description,
          absentStaffName: assignment.absentStaff.displayName,
          source,
          planState,
          isSplitSegment: true,
        });
      }
    } else if (
      assignment.assignedStaff &&
      !(
        assignment.resolutionType === 'solo_coverage' &&
        recordDetails(assignment.resolutionDetails).soloKind === 'scheduled'
      )
    ) {
      ensureRow(
        assignment.assignedStaff.id,
        assignment.assignedStaff.displayName,
      ).coverageOverlays.push({
        assignmentId: assignment.id,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        description: assignment.description,
        absentStaffName: assignment.absentStaff.displayName,
        source,
        planState,
        isSplitSegment: false,
      });
    }
  }

  return {
    planState,
    rows: [...rowMap.values()].map((row) => ({
      ...row,
      isAbsent: row.absenceOverlays.length > 0,
    })),
  };
}

function absentOverlay(
  assignment: TimelineAssignmentInput,
): TimelineAbsentOverlay {
  if (assignment.status === 'unresolved') {
    return {
      assignmentId: assignment.id,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      label: 'Absent · Needs Sub',
      tone: 'needs-sub',
    };
  }
  if (assignment.segments.length > 0) {
    return {
      assignmentId: assignment.id,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      label: 'Absent · Split coverage',
      tone: 'split',
    };
  }
  if (assignment.status === 'intentionally_uncovered') {
    return {
      assignmentId: assignment.id,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      label: 'Absent · Intentionally Uncovered',
      tone: 'intentionally-uncovered',
    };
  }
  if (assignment.assignedStaff) {
    return {
      assignmentId: assignment.id,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      label: `Absent · Covered by ${assignment.assignedStaff.displayName}`,
      tone: 'covered',
    };
  }
  if (
    assignment.resolutionType === 'combine_class' ||
    assignment.resolutionType === 'redistribution'
  ) {
    const room =
      assignment.roomId !== assignment.scheduledRoomId
        ? formatRoomLabel(assignment.room)
        : null;
    return {
      assignmentId: assignment.id,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      label: `Absent · ${assignmentResolutionLabel(assignment)}${room ? ` · ${room}` : ''}`,
      tone: 'structured',
    };
  }
  return {
    assignmentId: assignment.id,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    label: `Absent · ${resolutionTypeLabel(assignment.resolutionType)}`,
    tone: 'structured',
  };
}

function resolutionTypeLabel(resolutionType: string | null): string {
  if (!resolutionType) return 'Assigned';
  return resolutionType
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function assignmentResolutionLabel(
  assignment: Pick<
    TimelineAssignmentInput,
    | 'assignedStaff'
    | 'segments'
    | 'status'
    | 'resolutionType'
    | 'resolutionDetails'
  >,
): string {
  if (assignment.resolutionType === 'solo_coverage' && assignment.assignedStaff)
    return `${assignment.assignedStaff.displayName} solo`;
  if (assignment.assignedStaff) return assignment.assignedStaff.displayName;
  if (assignment.segments.length > 0)
    return assignment.segments.map((segment) => segment.staffName).join(' / ');
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  const details = recordDetails(assignment.resolutionDetails);
  if (assignment.resolutionType === 'combine_class') {
    const target = [
      textDetail(details, 'receivingStaffName'),
      textDetail(details, 'receivingDescription'),
    ]
      .filter(Boolean)
      .join(' — ');
    return target ? `Combined with ${target}` : 'Combined Class';
  }
  if (assignment.resolutionType === 'redistribution') {
    const recipients = stringArray(details.receivingStaffNames);
    return recipients.length > 0
      ? `Redistributed to ${recipients.join(' + ')}`
      : 'Redistributed Class';
  }
  return resolutionTypeLabel(assignment.resolutionType);
}

export function assignmentNote(resolutionDetails: unknown): string | null {
  const note = textDetail(recordDetails(resolutionDetails), 'note');
  return note || null;
}

function recordDetails(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textDetail(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
