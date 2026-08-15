import { describe, expect, it } from 'vitest';

import {
  assignmentNote,
  assignmentResolutionLabel,
  buildFullScheduleTimeline,
  formatRoomLabel,
  type FullScheduleTimelineInput,
  type TimelineAssignmentInput,
  type TimelineScheduleEntry,
  type TimelineStaff,
} from '../../src/features/sub-plan/sub-plan-presentation';

describe('Sub Plan presentation helpers', () => {
  it('labels simple room identifiers without duplicating an existing label', () => {
    expect(formatRoomLabel('7')).toBe('Room 7');
    expect(formatRoomLabel('101A')).toBe('Room 101A');
    expect(formatRoomLabel('PRI-101')).toBe('Room PRI-101');
    expect(formatRoomLabel('Room 7')).toBe('Room 7');
  });

  it('preserves descriptive room values', () => {
    expect(formatRoomLabel('GYM')).toBe('GYM');
    expect(formatRoomLabel('Lower School Library')).toBe(
      'Lower School Library',
    );
    expect(formatRoomLabel('Library 2')).toBe('Library 2');
    expect(formatRoomLabel(null)).toBeNull();
  });

  it('presents structured alternate resolutions without enum or JSON labels', () => {
    const combined = assignment({
      status: 'assigned',
      resolutionType: 'combine_class',
      resolutionDetails: {
        receivingStaffName: 'Jane Jones',
        receivingDescription: 'EL Math',
        note: 'Students join after morning meeting.',
      },
    });
    const redistributed = assignment({
      status: 'assigned',
      resolutionType: 'redistribution',
      resolutionDetails: {
        receivingStaffNames: ['Jane Jones', 'Mark Lee'],
      },
    });

    expect(assignmentResolutionLabel(combined)).toBe(
      'Combined with Jane Jones — EL Math',
    );
    expect(assignmentNote(combined.resolutionDetails)).toBe(
      'Students join after morning meeting.',
    );
    expect(assignmentResolutionLabel(redistributed)).toBe(
      'Redistributed to Jane Jones + Mark Lee',
    );
  });
});

const absentStaff = staff('smith', 'Sam Smith');
const coveringStaff = staff('jane', 'Jane Jones');

describe('Full Schedule timeline presentation', () => {
  it('marks an unresolved class as Absent and Needs Sub', () => {
    const timeline = buildFullScheduleTimeline(detail());
    const row = timeline.rows.find(
      (candidate) => candidate.staffId === 'smith',
    );

    expect(row).toMatchObject({ isAbsent: true });
    expect(row?.entries).toHaveLength(1);
    expect(row?.absenceOverlays).toEqual([
      expect.objectContaining({
        assignmentId: 'assignment-1',
        label: 'Absent · Needs Sub',
        tone: 'needs-sub',
      }),
    ]);
  });

  it('shows normal assigned coverage on both staff rows', () => {
    const assigned = assignment({
      status: 'assigned',
      assignedStaff: coveringStaff,
      resolutionSource: 'Available',
    });
    const timeline = buildFullScheduleTimeline(
      detail({ assignments: [assigned] }),
    );

    expect(row(timeline, 'smith').absenceOverlays[0]?.label).toBe(
      'Absent · Covered by Jane Jones',
    );
    expect(row(timeline, 'jane').coverageOverlays[0]).toMatchObject({
      description: 'EL Math',
      absentStaffName: 'Sam Smith',
      source: 'Available',
    });
  });

  it('adds an overlay-only row for an unscheduled School Sub', () => {
    const schoolSub = staff('school-sub', 'Alex Rivera', true);
    const timeline = buildFullScheduleTimeline(
      detail({
        assignments: [
          assignment({
            status: 'assigned',
            assignedStaff: schoolSub,
            resolutionSource: 'School Sub',
          }),
        ],
      }),
    );

    expect(row(timeline, 'school-sub')).toMatchObject({
      staffName: 'Alex Rivera',
      entries: [],
    });
    expect(row(timeline, 'school-sub').coverageOverlays[0]?.source).toBe(
      'School Sub',
    );
  });

  it.each([
    ['plan', 'PLAN'],
    ['admin', 'Admin'],
  ] as const)(
    'preserves a %s base block under coverage',
    (activityType, source) => {
      const timeline = buildFullScheduleTimeline(
        detail({
          schedule: [baseEntry(), coveringEntry(activityType)],
          assignments: [
            assignment({
              status: 'assigned',
              assignedStaff: coveringStaff,
              resolutionSource: source,
            }),
          ],
        }),
      );

      expect(row(timeline, 'jane').entries).toContainEqual(
        coveringEntry(activityType),
      );
      expect(row(timeline, 'jane').coverageOverlays[0]?.source).toBe(source);
    },
  );

  it('shows coverage during open time without inventing a base block', () => {
    const openEntry = {
      ...coveringEntry('instruction'),
      startTime: '10:00',
      endTime: '11:00',
    };
    const timeline = buildFullScheduleTimeline(
      detail({
        schedule: [baseEntry(), openEntry],
        assignments: [
          assignment({
            status: 'assigned',
            assignedStaff: coveringStaff,
            resolutionSource: 'Available',
          }),
        ],
      }),
    );

    expect(row(timeline, 'jane').entries).toEqual([openEntry]);
    expect(row(timeline, 'jane').coverageOverlays[0]).toMatchObject({
      startTime: '09:00',
      endTime: '09:50',
      source: 'Available',
    });
  });

  it('uses persisted split intervals on each covering staff row', () => {
    const mark = staff('mark', 'Mark Jones');
    const timeline = buildFullScheduleTimeline(
      detail({
        assignments: [
          assignment({
            status: 'assigned',
            segments: [
              {
                id: 'segment-1',
                startTime: '09:00',
                endTime: '09:40',
                staffId: coveringStaff.id,
                staffName: coveringStaff.displayName,
              },
              {
                id: 'segment-2',
                startTime: '09:40',
                endTime: '09:50',
                staffId: mark.id,
                staffName: mark.displayName,
              },
            ],
          }),
        ],
      }),
    );

    expect(row(timeline, 'smith').absenceOverlays[0]?.label).toBe(
      'Absent · Split coverage',
    );
    expect(row(timeline, 'jane').coverageOverlays[0]).toMatchObject({
      startTime: '09:00',
      endTime: '09:40',
      isSplitSegment: true,
    });
    expect(row(timeline, 'mark').coverageOverlays[0]).toMatchObject({
      startTime: '09:40',
      endTime: '09:50',
    });
  });

  it('labels an intentionally uncovered duty without coverage rows', () => {
    const timeline = buildFullScheduleTimeline(
      detail({
        assignments: [
          assignment({
            description: 'Lunch Duty',
            status: 'intentionally_uncovered',
          }),
        ],
      }),
    );

    expect(row(timeline, 'smith').absenceOverlays[0]).toMatchObject({
      label: 'Absent · Intentionally Uncovered',
      tone: 'intentionally-uncovered',
    });
    expect(timeline.rows).toHaveLength(1);
  });

  it('shows a meaningful alternate resolution and planned room modifier', () => {
    const timeline = buildFullScheduleTimeline(
      detail({
        assignments: [
          assignment({
            status: 'assigned',
            resolutionType: 'combine_class',
            resolutionDetails: {
              receivingStaffName: 'Jane Jones',
              receivingDescription: 'EL Math',
            },
            roomId: 'room-12',
            room: '12',
          }),
        ],
      }),
    );

    expect(row(timeline, 'smith').absenceOverlays[0]?.label).toBe(
      'Absent · Combined with Jane Jones — EL Math · Room 12',
    );
  });

  it('derives Planning, Finalized, and reopened visual states from plan status', () => {
    const assigned = assignment({
      status: 'assigned',
      assignedStaff: coveringStaff,
    });
    const planning = buildFullScheduleTimeline(
      detail({ assignments: [assigned], status: 'draft' }),
    );
    const finalized = buildFullScheduleTimeline(
      detail({ assignments: [assigned], status: 'finalized' }),
    );
    const reopened = buildFullScheduleTimeline(
      detail({
        assignments: [assigned],
        status: 'draft',
        finalizedAt: '2026-08-14T12:00:00.000Z',
      }),
    );

    expect(planning.planState).toBe('planning');
    expect(row(planning, 'jane').coverageOverlays[0]?.planState).toBe(
      'planning',
    );
    expect(finalized.planState).toBe('finalized');
    expect(row(finalized, 'jane').coverageOverlays[0]?.planState).toBe(
      'finalized',
    );
    expect(reopened.planState).toBe('planning');
  });

  it('attaches normal and Special Schedule assignments by exact source identity', () => {
    const normal = buildFullScheduleTimeline(detail());
    const special = buildFullScheduleTimeline(
      detail({
        special: true,
        assignments: [
          assignment({
            sourceScheduleEntryId: null,
            sourceSpecialScheduleEntryId: 'entry-1',
          }),
        ],
      }),
    );

    expect(row(normal, 'smith').absenceOverlays).toHaveLength(1);
    expect(row(special, 'smith').absenceOverlays).toHaveLength(1);
  });
});

function staff(
  id: string,
  displayName: string,
  isSchoolSub = false,
): TimelineStaff & { readonly isSchoolSub: boolean } {
  return { id, displayName, isSchoolSub };
}

function baseEntry(): TimelineScheduleEntry {
  return {
    id: 'entry-1',
    staffId: absentStaff.id,
    staffName: absentStaff.displayName,
    dayType: 'ALL',
    startTime: '09:00',
    endTime: '09:50',
    activityType: 'instruction',
    category: 'EL',
    description: 'EL Math',
    room: '7',
  };
}

function coveringEntry(activityType: string): TimelineScheduleEntry {
  return {
    id: `entry-jane-${activityType}`,
    staffId: coveringStaff.id,
    staffName: coveringStaff.displayName,
    dayType: 'ALL',
    startTime: '09:00',
    endTime: '09:50',
    activityType,
    category: 'PLAN_ADMIN',
    description: activityType === 'admin' ? 'Admin' : 'PLAN',
    room: null,
  };
}

function assignment(
  overrides: Partial<TimelineAssignmentInput> = {},
): TimelineAssignmentInput {
  return {
    id: 'assignment-1',
    sourceScheduleEntryId: 'entry-1',
    sourceSpecialScheduleEntryId: null,
    startTime: '09:00',
    endTime: '09:50',
    description: 'EL Math',
    absentStaff,
    assignedStaff: null,
    resolutionSource: null,
    resolutionType: null,
    resolutionDetails: null,
    roomId: 'room-7',
    room: '7',
    scheduledRoomId: 'room-7',
    scheduledRoom: '7',
    status: 'unresolved',
    isDefault: false,
    segments: [],
    ...overrides,
  };
}

function detail(
  options: {
    readonly assignments?: readonly TimelineAssignmentInput[];
    readonly schedule?: readonly TimelineScheduleEntry[];
    readonly status?: 'draft' | 'finalized';
    readonly finalizedAt?: string | null;
    readonly special?: boolean;
  } = {},
): FullScheduleTimelineInput {
  const special = options.special ?? false;
  const assignments = options.assignments ?? [assignment()];
  const schedule = options.schedule ?? [baseEntry()];
  return {
    plan: {
      dayType: 'A',
      specialScheduleId: special ? 'special-1' : null,
      status: options.status ?? 'draft',
      finalizedAt: options.finalizedAt ?? null,
    },
    assignments,
    schedule,
  };
}

function row(
  timeline: ReturnType<typeof buildFullScheduleTimeline>,
  staffId: string,
) {
  const value = timeline.rows.find(
    (candidate) => candidate.staffId === staffId,
  );
  if (!value) throw new Error(`Missing timeline row for ${staffId}`);
  return value;
}
