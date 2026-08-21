import {
  affectedResponsibilities,
  calculatePlanPeriodsLost,
  classifyScheduleAvailability,
  enumerateWeekdaySchoolDates,
  expectedDayType,
  projectedPlanPeriodsLost,
  rankCandidates,
  renderSubPlanMessage,
  resolveStandardPeriodMinutes,
  shiftSchoolDate,
  validateSplitSegments,
  type CandidateAvailability,
  type SplitSegmentInput,
} from '../../src/domain/planning';
import {
  calendarExpectedDayType,
  isSchoolDay,
} from '../../src/domain/calendar';
import { normalizeStaffRole } from '../../src/domain/staff';
import { HttpError } from '../http';

type DayType = 'A' | 'B';

interface PlanRow {
  id: string;
  date: string;
  day_type: DayType;
  schedule_version_id: string | null;
  special_schedule_id: string | null;
  status: 'draft' | 'finalized';
  finalized_at: string | null;
  finalized_by: string | null;
  schedule_name: string | null;
  special_schedule_name: string | null;
  effective_from: string | null;
  calendar_expected_day_type: DayType | null;
  calendar_is_school_day: number | null;
  calendar_is_blackout_day: number | null;
  calendar_expects_special_schedule: number | null;
  calendar_label: string | null;
}

interface ScheduleResolutionRow {
  id: string;
  name: string;
  effective_from: string;
}

interface SpecialScheduleRow {
  id: string;
  name: string;
}

interface EntryRow {
  id: string;
  staff_id: string;
  staff_name: string;
  day_type: 'A' | 'B' | 'ALL';
  start_time: string;
  end_time: string;
  activity_type: string;
  category: string;
  description: string;
  room_id: string | null;
  room_name: string | null;
  requires_sub: number;
}

interface AbsenceRow {
  id: string;
  staff_id: string;
  staff_name: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface DefaultActionRow {
  id: string;
  action_type: string;
  start_time: string;
  end_time: string;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  room_id: string | null;
  room_name: string | null;
  details_json: string | null;
  sequence: number;
}

interface AssignmentRow {
  id: string;
  daily_sub_plan_id: string;
  absence_id: string;
  shared_responsibility_key: string | null;
  counts_toward_workload: number;
  source_schedule_entry_id: string | null;
  source_special_schedule_entry_id: string | null;
  start_time: string;
  end_time: string;
  responsibility_type: 'instruction' | 'duty' | 'after_school' | 'other';
  description: string;
  room_id: string | null;
  room_name: string | null;
  default_action_id: string | null;
  default_action_type: string | null;
  default_staff_id: string | null;
  default_staff_name: string | null;
  default_details_json: string | null;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  assigned_is_school_sub: number | null;
  resolution_type: string | null;
  resolution_details_json: string | null;
  status: 'unresolved' | 'assigned' | 'intentionally_uncovered';
  is_default: number;
  conflict_explanation: string | null;
  absent_staff_id: string;
  absent_staff_name: string;
}

interface SegmentRow {
  id: string;
  assignment_id: string;
  start_time: string;
  end_time: string;
  staff_id: string;
  staff_name: string;
  staff_is_school_sub: number;
  sequence: number;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  is_school_sub: number;
  standard_period_minutes: number | null;
}

interface SettingsRow {
  school_name: string;
  workload_warning_threshold: number;
  workload_window_days: number;
  split_snap_minutes: number;
  message_template: string;
}

interface MessageRow {
  id: string;
  generated_text: string;
  edited_text: string;
  generated_at: string;
}

interface WorkloadCoverageRow {
  staff_id: string;
  date: string;
  day_type: DayType;
  schedule_version_id: string | null;
  special_schedule_id: string | null;
  start_time: string;
  end_time: string;
  standard_period_minutes: number | null;
  is_school_sub: number;
}

interface WorkloadPlanEntryRow {
  source_type: 'normal' | 'special';
  source_id: string;
  staff_id: string;
  day_type: 'A' | 'B' | 'ALL';
  start_time: string;
  end_time: string;
  activity_type: 'instruction' | 'plan';
}

interface CountRow {
  count: number;
}

interface CandidateCheck {
  readonly source:
    'School Sub' | 'Plan Period' | 'Admin' | 'Available' | 'Manual';
  readonly sourceType: Exclude<CandidateAvailability, 'default'>;
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
}

interface CandidatePreview {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isSchoolSub: boolean;
  readonly isDefaultCandidate: boolean;
  readonly availability: CandidateAvailability;
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

interface SoloCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly kind: 'scheduled' | 'replacement';
  readonly conflicts: readonly string[];
}

interface CandidateEvaluationContext {
  readonly entries: readonly EntryRow[];
  readonly absences: readonly AbsenceRow[];
  readonly assignments: readonly AssignmentRow[];
  readonly segments: readonly SegmentRow[];
}

export class PlanningRepository {
  constructor(private readonly db: D1Database) {}

  async ensurePlan(
    date: string,
    requestedDayType: DayType | undefined,
    actorId: string,
  ) {
    if (!isSchoolDay(date)) {
      throw new HttpError(
        400,
        'weekend_plan_not_allowed',
        'Daily Sub Plans require a weekday.',
      );
    }
    const existing = await this.findPlan(date);
    if (existing) {
      if (requestedDayType && requestedDayType !== existing.day_type) {
        await this.changeDayType(existing, requestedDayType, actorId);
      }
      return this.getPlan(date);
    }

    const resolved = await this.resolveSchedule(date);
    const calendar = await this.calendarForDate(date);
    const fallback = resolved.normal
      ? expectedDayType(date, resolved.normal.effective_from)
      : 'A';
    const dayType =
      requestedDayType ?? calendarExpectedDayType(calendar, fallback);
    const planId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO daily_sub_plans (
           id, date, day_type, schedule_version_id, special_schedule_id,
           status, created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .bind(
        planId,
        date,
        dayType,
        resolved.normal?.id ?? null,
        resolved.special?.id ?? null,
        actorId,
        actorId,
      )
      .run();
    return this.getPlan(date);
  }

  async getPlan(date: string) {
    const plan = await this.findPlan(date);
    if (!plan)
      throw new HttpError(
        404,
        'plan_not_found',
        'No Sub Plan exists for this date.',
      );
    assertPlanSource(plan);
    const [absences, assignments, schedule, settings, message] =
      await Promise.all([
        this.absencesForDate(date),
        this.assignmentsForPlan(plan.id),
        this.entriesForPlan(plan),
        this.settings(),
        this.latestMessage(plan.id),
      ]);
    const segments = await this.segmentsForAssignments(
      assignments.map((assignment) => assignment.id),
    );
    const segmentMap = new Map<string, SegmentRow[]>();
    for (const segment of segments) {
      const list = segmentMap.get(segment.assignment_id) ?? [];
      list.push(segment);
      segmentMap.set(segment.assignment_id, list);
    }
    const scheduleById = new Map(schedule.map((entry) => [entry.id, entry]));
    const assignmentDtos = assignments.map((assignment) => {
      const sourceEntryId = plan.special_schedule_id
        ? assignment.source_special_schedule_entry_id
        : assignment.source_schedule_entry_id;
      const sourceEntry = sourceEntryId
        ? scheduleById.get(sourceEntryId)
        : undefined;
      return {
        id: assignment.id,
        sharedResponsibilityKey: assignment.shared_responsibility_key,
        sourceScheduleEntryId: assignment.source_schedule_entry_id,
        sourceSpecialScheduleEntryId:
          assignment.source_special_schedule_entry_id,
        startTime: assignment.start_time,
        endTime: assignment.end_time,
        responsibilityType: assignment.responsibility_type,
        description: assignment.description,
        roomId: assignment.room_id,
        room: assignment.room_name,
        scheduledRoomId: sourceEntry?.room_id ?? null,
        scheduledRoom: sourceEntry?.room_name ?? null,
        absentStaff: {
          id: assignment.absent_staff_id,
          displayName: assignment.absent_staff_name,
        },
        assignedStaff: assignment.assigned_staff_id
          ? {
              id: assignment.assigned_staff_id,
              displayName: assignment.assigned_staff_name ?? '',
            }
          : null,
        resolutionSource: resolutionSource(assignment, schedule, plan.day_type),
        resolutionType: assignment.resolution_type,
        resolutionDetails: parseJson(assignment.resolution_details_json),
        status: assignment.status,
        isDefault: assignment.is_default === 1,
        conflictExplanation: assignment.conflict_explanation,
        defaultAction: assignment.default_action_id
          ? {
              id: assignment.default_action_id,
              actionType: assignment.default_action_type,
              staffId: assignment.default_staff_id,
              staffName: assignment.default_staff_name,
              details: parseJson(assignment.default_details_json),
            }
          : null,
        segments: (segmentMap.get(assignment.id) ?? []).map((segment) => ({
          id: segment.id,
          startTime: segment.start_time,
          endTime: segment.end_time,
          staffId: segment.staff_id,
          staffName: segment.staff_name,
        })),
      };
    });
    const assigned = assignmentDtos.filter(
      (assignment) => assignment.status !== 'unresolved',
    ).length;
    const assignedStaffIds = new Set([
      ...assignments.flatMap((assignment) =>
        assignment.assigned_staff_id &&
        assignment.assigned_is_school_sub !== 1 &&
        assignment.counts_toward_workload === 1
          ? [assignment.assigned_staff_id]
          : [],
      ),
      ...segments.flatMap((segment) =>
        segment.staff_is_school_sub !== 1 ? [segment.staff_id] : [],
      ),
    ]);
    const burdens =
      assignedStaffIds.size > 0
        ? await this.burdensForWindow(
            plan.date,
            settings.workload_window_days,
            '',
          )
        : new Map<string, number>();
    const workloadWarnings = [...assignedStaffIds].filter(
      (staffId) =>
        (burdens.get(staffId) ?? 0) >= settings.workload_warning_threshold,
    ).length;
    return {
      plan: {
        id: plan.id,
        date: plan.date,
        dayType: plan.day_type,
        expectedDayType:
          plan.calendar_expected_day_type ??
          (plan.effective_from
            ? expectedDayType(plan.date, plan.effective_from)
            : null),
        calendar: {
          isSchoolDay: plan.calendar_is_school_day !== 0,
          isBlackoutDay: plan.calendar_is_blackout_day === 1,
          expectsSpecialSchedule: plan.calendar_expects_special_schedule === 1,
          label: plan.calendar_label,
          specialScheduleExpectedWarning:
            plan.calendar_expects_special_schedule === 1 &&
            !plan.special_schedule_id,
        },
        scheduleVersionId: plan.schedule_version_id,
        scheduleName: plan.schedule_name,
        specialScheduleId: plan.special_schedule_id,
        specialScheduleName: plan.special_schedule_name,
        status: plan.status,
        finalizedAt: plan.finalized_at,
        finalizedBy: plan.finalized_by,
      },
      absences: absences.map((absence) => ({
        id: absence.id,
        staffId: absence.staff_id,
        staffName: absence.staff_name,
        startDate: absence.start_date,
        endDate: absence.end_date,
        startTime: absence.start_time,
        endTime: absence.end_time,
        informationalWarning: absenceWarning(
          absence,
          assignments,
          schedule,
          plan.day_type,
        ),
      })),
      assignments: assignmentDtos,
      schedule: schedule.map((entry) => ({
        id: entry.id,
        staffId: entry.staff_id,
        staffName: entry.staff_name,
        dayType: entry.day_type,
        startTime: entry.start_time,
        endTime: entry.end_time,
        activityType: entry.activity_type,
        category: entry.category,
        description: entry.description,
        roomId: entry.room_id,
        room: entry.room_name,
      })),
      summary: {
        teachersAbsent: new Set(absences.map((absence) => absence.staff_id))
          .size,
        assignments: assignmentDtos.length,
        assigned,
        unresolved: assignmentDtos.length - assigned,
        workloadWarnings,
      },
      settings: {
        workloadThreshold: settings.workload_warning_threshold,
        workloadWindowDays: settings.workload_window_days,
        splitSnapMinutes: settings.split_snap_minutes,
      },
      message: message
        ? {
            generatedText: message.generated_text,
            editedText: message.edited_text,
            generatedAt: message.generated_at,
          }
        : null,
    };
  }

  async addAbsence(
    input: {
      readonly staffId: string;
      readonly startDate: string;
      readonly endDate: string;
      readonly startTime: string | null;
      readonly endTime: string | null;
    },
    actorId: string,
  ) {
    const dates = enumerateWeekdaySchoolDates(input.startDate, input.endDate);
    const staff = await this.db
      .prepare(
        `SELECT id, display_name FROM staff WHERE id = ? AND is_active = 1`,
      )
      .bind(input.staffId)
      .first<{ id: string; display_name: string }>();
    if (!staff)
      throw new HttpError(400, 'invalid_staff', 'Choose an active teacher.');
    const absenceId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO absences (
             id, staff_id, start_date, end_date, start_time, end_time,
             created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          absenceId,
          input.staffId,
          input.startDate,
          input.endDate,
          input.startTime,
          input.endTime,
          actorId,
          actorId,
        ),
    ];

    for (const date of dates) {
      const planSeed = await this.planSeed(date, actorId);
      if (planSeed.plan.status === 'finalized') {
        throw new HttpError(
          409,
          'plan_finalized',
          `Reopen the finalized Sub Plan for ${date} before adding an absence.`,
        );
      }
      if (planSeed.insert) statements.push(planSeed.insert);
      const currentAssignments = await this.assignmentsForPlan(
        planSeed.plan.id,
      );
      const currentSegments = await this.segmentsForAssignments(
        currentAssignments.map((assignment) => assignment.id),
      );
      for (const assignment of currentAssignments) {
        const invalidation = resolutionInvalidation(
          assignment,
          currentSegments,
          staff,
          input.startTime,
          input.endTime,
        );
        if (!invalidation) continue;
        if (assignment.resolution_type === 'split_coverage') {
          statements.push(
            this.db
              .prepare(
                `DELETE FROM assignment_segments WHERE assignment_id = ?`,
              )
              .bind(assignment.id),
          );
        }
        statements.push(
          this.db
            .prepare(
              `UPDATE assignments
                  SET assigned_staff_id = NULL, resolution_type = NULL,
                      resolution_details_json = ?, status = 'unresolved',
                      is_default = 0, conflict_explanation = ?, updated_by = ?,
                      override_acknowledged_at = NULL,
                      override_acknowledged_by = NULL,
                      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?`,
            )
            .bind(
              noteOnlyDetailsJson(assignment.resolution_details_json),
              invalidation,
              actorId,
              assignment.id,
            ),
        );
      }
      const entries = (await this.entriesForPlan(planSeed.plan)).filter(
        (entry) => entry.staff_id === input.staffId,
      );
      const affected = affectedResponsibilities(
        entries.map((entry) => ({
          id: entry.id,
          dayType: entry.day_type,
          startTime: entry.start_time,
          endTime: entry.end_time,
          requiresSub: entry.requires_sub === 1,
        })),
        planSeed.plan.day_type,
        { startTime: input.startTime, endTime: input.endTime },
      );
      const actions = await this.defaultActions(
        input.staffId,
        planSeed.plan.day_type,
      );
      for (const affectedEntry of affected) {
        const source = entries.find(
          (entry) => entry.id === affectedEntry.sourceId,
        );
        if (!source) continue;
        const defaultAction = actions.find(
          (action) =>
            action.start_time < affectedEntry.endTime &&
            affectedEntry.startTime < action.end_time,
        );
        const defaultResolution = defaultAction
          ? await this.evaluateDefault(
              defaultAction,
              planSeed.plan,
              affectedEntry.startTime,
              affectedEntry.endTime,
              input,
            )
          : null;
        const sourceScheduleId = planSeed.plan.special_schedule_id
          ? null
          : source.id;
        const sourceSpecialId = planSeed.plan.special_schedule_id
          ? source.id
          : null;
        const sharedResponsibilityKey = sharedResponsibilityKeyForEntry(
          source,
          planSeed.plan,
        );
        statements.push(
          this.db
            .prepare(
              `INSERT INTO assignments (
                 id, daily_sub_plan_id, absence_id, source_schedule_entry_id,
                 source_special_schedule_entry_id, start_time, end_time,
                 shared_responsibility_key,
                 responsibility_type, description, room_id, default_action_id,
                 assigned_staff_id, resolution_type, resolution_details_json,
                 status, is_default, conflict_explanation, updated_by
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT DO NOTHING`,
            )
            .bind(
              `assignment:${planSeed.plan.id}:${absenceId}:${source.id}`,
              planSeed.plan.id,
              absenceId,
              sourceScheduleId,
              sourceSpecialId,
              affectedEntry.startTime,
              affectedEntry.endTime,
              sharedResponsibilityKey,
              responsibilityType(source.activity_type),
              source.description,
              defaultAction?.room_id ?? source.room_id,
              defaultAction?.id ?? null,
              defaultResolution?.assignedStaffId ?? null,
              defaultResolution?.resolutionType ?? null,
              defaultResolution?.detailsJson ?? null,
              defaultResolution?.status ?? 'unresolved',
              defaultResolution?.isDefault ? 1 : 0,
              defaultResolution?.conflict ?? null,
              actorId,
            ),
        );
      }
    }
    await this.db.batch(statements);
    return { absenceId, dates };
  }

  async candidates(
    assignmentId: string,
    requestedInterval?: {
      readonly startTime: string;
      readonly endTime: string;
    },
  ): Promise<{
    assignmentId: string;
    candidates: CandidatePreview[];
    soloCandidates: SoloCandidate[];
  }> {
    const [assignment, settings] = await Promise.all([
      this.assignmentById(assignmentId),
      this.settings(),
    ]);
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const startTime = requestedInterval?.startTime ?? assignment.start_time;
    const endTime = requestedInterval?.endTime ?? assignment.end_time;
    if (
      startTime >= endTime ||
      startTime < assignment.start_time ||
      endTime > assignment.end_time
    ) {
      throw new HttpError(
        400,
        'invalid_candidate_interval',
        'Candidate interval must have start before end and remain inside the Assignment.',
      );
    }
    const [staff, entries, periodEntries, absences, assignments, burdens] =
      await Promise.all([
        this.db
          .prepare(
            `SELECT id, display_name, role, is_school_sub, standard_period_minutes FROM staff
            WHERE is_active = 1 AND can_sub = 1 AND id <> ?
            ORDER BY display_name, id`,
          )
          .bind(assignment.absent_staff_id)
          .all<StaffRow>(),
        this.entriesForPlan(plan),
        this.periodEntriesForPlan(plan),
        this.absencesForDate(plan.date),
        this.assignmentsForPlan(plan.id),
        this.burdensForWindow(
          plan.date,
          settings.workload_window_days,
          assignment.id,
        ),
      ]);
    const segments = await this.segmentsForAssignments(
      assignments.map((item) => item.id),
    );
    const context: CandidateEvaluationContext = {
      entries,
      absences,
      assignments,
      segments,
    };
    const previews = staff.results.map((person): CandidatePreview => {
      const check = evaluateCandidate(
        plan,
        person,
        startTime,
        endTime,
        assignment.id,
        context,
      );
      const currentBurden = person.is_school_sub
        ? 0
        : burdens.has(person.id)
          ? (burdens.get(person.id) ?? null)
          : 0;
      const planBlocks = entries
        .filter(
          (entry) =>
            entry.staff_id === person.id &&
            entry.activity_type === 'plan' &&
            (entry.day_type === 'ALL' || entry.day_type === plan.day_type),
        )
        .map((entry) => ({
          startTime: entry.start_time,
          endTime: entry.end_time,
        }));
      const normalEntries = periodEntries
        .filter(
          (entry) =>
            entry.staff_id === person.id && entry.source_type === 'normal',
        )
        .map(periodEntryDto);
      const applicableEntries = periodEntries
        .filter((entry) => entry.staff_id === person.id)
        .map(periodEntryDto);
      const standardPeriodMinutes = resolveStandardPeriodMinutes({
        configuredMinutes: person.standard_period_minutes,
        dayType: plan.day_type,
        normalEntries,
        applicableEntries,
      });
      const proposedBurden = person.is_school_sub
        ? 0
        : calculatePlanPeriodsLost(
            planBlocks,
            [
              {
                startTime,
                endTime,
              },
            ],
            standardPeriodMinutes,
          );
      const projectedBurden = projectedPlanPeriodsLost(
        currentBurden,
        proposedBurden,
      );
      const isValidDefault =
        assignment.default_staff_id === person.id &&
        check.sourceType !== 'manual' &&
        check.conflicts.length === 0;
      const isDefaultCandidate = assignment.default_staff_id === person.id;
      const workloadUnknown = currentBurden === null || proposedBurden === null;
      return {
        id: person.id,
        displayName: person.display_name,
        role: normalizeStaffRole(person.role),
        isSchoolSub: person.is_school_sub === 1,
        isDefaultCandidate,
        workloadKnown: !workloadUnknown,
        availability: isValidDefault ? 'default' : check.sourceType,
        availabilitySource: check.source,
        conflicts: check.conflicts,
        warnings: [
          ...check.warnings,
          ...(workloadUnknown
            ? ['Plan-time calculation needs staff configuration.']
            : []),
          ...(projectedBurden !== null &&
          projectedBurden >= settings.workload_warning_threshold
            ? [
                `Projected workload ${projectedBurden.toFixed(2)} reaches the ${settings.workload_warning_threshold.toFixed(2)} threshold.`,
              ]
            : []),
        ],
        currentBurden,
        proposedBurden,
        projectedBurden,
        standardPeriodMinutes,
        standardPeriodSource: standardPeriodMinutes
          ? person.standard_period_minutes
            ? 'configured'
            : 'auto'
          : null,
        threshold: settings.workload_warning_threshold,
        windowDays: settings.workload_window_days,
      };
    });
    const soloCandidates = await this.soloCandidates(
      assignment,
      plan,
      entries,
      absences,
      assignments,
      segments,
    );
    return {
      assignmentId,
      candidates: rankCandidates(previews),
      soloCandidates,
    };
  }

  async soloCoverage(
    assignmentId: string,
    staffId: string,
    assignAnyway: boolean,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    if (!assignment.shared_responsibility_key) {
      throw new HttpError(
        400,
        'solo_not_available',
        'Solo Coverage is available only for shared responsibilities.',
      );
    }
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const [entries, absences, assignments] = await Promise.all([
      this.entriesForPlan(plan),
      this.absencesForDate(plan.date),
      this.assignmentsForPlan(plan.id),
    ]);
    const segments = await this.segmentsForAssignments(
      assignments.map((item) => item.id),
    );
    const candidates = await this.soloCandidates(
      assignment,
      plan,
      entries,
      absences,
      assignments,
      segments,
    );
    const candidate = candidates.find((item) => item.id === staffId);
    if (!candidate)
      throw new HttpError(
        400,
        'invalid_solo_candidate',
        'Choose an eligible Solo Coverage staff member.',
      );
    if (candidate.conflicts.length && !assignAnyway) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        candidate.conflicts.join(' '),
      );
    }
    const siblings = assignments.filter(
      (item) =>
        item.shared_responsibility_key === assignment.shared_responsibility_key,
    );
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    siblings.forEach((sibling, index) => {
      statements.push(
        this.db
          .prepare('DELETE FROM assignment_segments WHERE assignment_id = ?')
          .bind(sibling.id),
      );
      statements.push(
        this.db
          .prepare(
            `UPDATE assignments SET assigned_staff_id = ?, resolution_type = 'solo_coverage',
             resolution_details_json = ?, status = 'assigned', is_default = 0,
             conflict_explanation = NULL, counts_toward_workload = ?,
             override_acknowledged_at = ?, override_acknowledged_by = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
          )
          .bind(
            staffId,
            JSON.stringify({ staffId, soloKind: candidate.kind }),
            candidate.kind === 'replacement' && index === 0 ? 1 : 0,
            candidate.conflicts.length ? now : null,
            candidate.conflicts.length ? actorId : null,
            actorId,
            now,
            sibling.id,
          ),
      );
    });
    await this.db.batch(statements);
    return this.getPlan(plan.date);
  }

  async assign(
    assignmentId: string,
    staffId: string,
    assignAnyway: boolean,
    actorId: string,
  ) {
    const preview = await this.candidates(assignmentId);
    const candidate = preview.candidates.find(
      (person) => person.id === staffId,
    );
    if (!candidate)
      throw new HttpError(
        400,
        'invalid_candidate',
        'Choose an active candidate.',
      );
    if (candidate.conflicts.length > 0 && !assignAnyway) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        candidate.conflicts.join(' '),
      );
    }
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    const noteDetailsJson = noteOnlyDetailsJson(
      assignment.resolution_details_json,
    );
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = ?, resolution_type = ?, resolution_details_json = ?,
                  status = 'assigned', is_default = ?, conflict_explanation = NULL,
                  override_acknowledged_at = ?, override_acknowledged_by = ?,
                  updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          staffId,
          candidate.conflicts.length > 0
            ? 'manual_override'
            : assignment.responsibility_type === 'duty'
              ? 'duty_coverage'
              : 'teacher_cover',
          noteDetailsJson,
          assignment.default_staff_id === staffId ? 1 : 0,
          candidate.conflicts.length > 0 ? now : null,
          candidate.conflicts.length > 0 ? actorId : null,
          actorId,
          now,
          assignmentId,
        ),
    ]);
    return this.getPlan(
      (await this.planById(assignment.daily_sub_plan_id)).date,
    );
  }

  async coverTeacherWithSchoolSub(
    planId: string,
    absentStaffId: string,
    actorId: string,
  ) {
    await this.assertDraft(planId);
    const plan = await this.planById(planId);
    const schoolSubs = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub, standard_period_minutes FROM staff
          WHERE is_active = 1 AND can_sub = 1 AND is_school_sub = 1
          ORDER BY display_name, id`,
      )
      .all<StaffRow>();
    if (schoolSubs.results.length !== 1) {
      throw new HttpError(
        409,
        schoolSubs.results.length === 0
          ? 'school_sub_not_configured'
          : 'multiple_school_subs_configured',
        schoolSubs.results.length === 0
          ? 'Configure one active School Sub before using this action.'
          : 'Configure exactly one active School Sub before using this action.',
      );
    }
    const schoolSub = schoolSubs.results[0]!;
    const [entries, absences, allAssignments] = await Promise.all([
      this.entriesForPlan(plan),
      this.absencesForDate(plan.date),
      this.assignmentsForPlan(plan.id),
    ]);
    const segments = await this.segmentsForAssignments(
      allAssignments.map((assignment) => assignment.id),
    );
    const targets = allAssignments.filter(
      (assignment) => assignment.absent_staff_id === absentStaffId,
    );
    if (targets.length === 0) {
      throw new HttpError(
        404,
        'teacher_assignments_not_found',
        'No Assignments exist for this absent teacher on this Sub Plan.',
      );
    }
    const result = emptyBulkResult();
    const statements: D1PreparedStatement[] = [];
    const workingAssignments = [...allAssignments];
    const now = new Date().toISOString();
    for (const assignment of targets) {
      if (!isSchoolSubBulkEligible(assignment)) {
        result.skipped += 1;
        continue;
      }
      if (
        assignment.assigned_staff_id === schoolSub.id &&
        assignment.status === 'assigned'
      ) {
        result.alreadyAssigned += 1;
        continue;
      }
      const check = evaluateCandidate(
        plan,
        schoolSub,
        assignment.start_time,
        assignment.end_time,
        assignment.id,
        { entries, absences, assignments: workingAssignments, segments },
      );
      if (check.conflicts.length > 0) {
        result.conflicted += 1;
        continue;
      }
      statements.push(
        this.db
          .prepare('DELETE FROM assignment_segments WHERE assignment_id = ?')
          .bind(assignment.id),
        this.db
          .prepare(
            `UPDATE assignments SET assigned_staff_id = ?, resolution_type = ?, resolution_details_json = ?,
             status = 'assigned', is_default = 0, conflict_explanation = NULL,
             override_acknowledged_at = NULL, override_acknowledged_by = NULL,
             updated_by = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(
            schoolSub.id,
            assignment.responsibility_type === 'duty'
              ? 'duty_coverage'
              : 'teacher_cover',
            noteOnlyDetailsJson(assignment.resolution_details_json),
            actorId,
            now,
            assignment.id,
          ),
      );
      const index = workingAssignments.findIndex(
        (item) => item.id === assignment.id,
      );
      workingAssignments[index] = {
        ...assignment,
        assigned_staff_id: schoolSub.id,
        status: 'assigned',
        resolution_type:
          assignment.responsibility_type === 'duty'
            ? 'duty_coverage'
            : 'teacher_cover',
      };
      result.changed += 1;
    }
    if (statements.length) await this.db.batch(statements);
    return { detail: await this.getPlan(plan.date), result };
  }

  async restoreTeacherDefaults(
    planId: string,
    absentStaffId: string,
    actorId: string,
  ) {
    await this.assertDraft(planId);
    const plan = await this.planById(planId);
    const [allAssignments, actions] = await Promise.all([
      this.assignmentsForPlan(plan.id),
      this.defaultActions(absentStaffId, plan.day_type),
    ]);
    const targets = allAssignments.filter(
      (assignment) => assignment.absent_staff_id === absentStaffId,
    );
    if (targets.length === 0) {
      throw new HttpError(
        404,
        'teacher_assignments_not_found',
        'No Assignments exist for this absent teacher on this Sub Plan.',
      );
    }
    const result = emptyBulkResult();
    const statements: D1PreparedStatement[] = [];
    const now = new Date().toISOString();
    for (const assignment of targets) {
      // Solo state belongs to the shared operational duty, so this pass leaves it intact.
      if (assignment.shared_responsibility_key) {
        result.skipped += 1;
        continue;
      }
      const action = actions.find(
        (item) =>
          item.start_time < assignment.end_time &&
          assignment.start_time < item.end_time,
      );
      const resolution = action
        ? await this.evaluateDefault(
            action,
            plan,
            assignment.start_time,
            assignment.end_time,
            {
              staffId: absentStaffId,
              startDate: plan.date,
              endDate: plan.date,
              startTime: null,
              endTime: null,
            },
            assignment.id,
          )
        : null;
      if (!action) result.noDefault += 1;
      else if (resolution?.status === 'unresolved') result.conflicted += 1;
      else result.changed += 1;
      statements.push(
        this.db
          .prepare('DELETE FROM assignment_segments WHERE assignment_id = ?')
          .bind(assignment.id),
        this.db
          .prepare(
            `UPDATE assignments SET default_action_id = ?, assigned_staff_id = ?, resolution_type = ?,
             resolution_details_json = ?, room_id = ?, status = ?, is_default = ?, conflict_explanation = ?,
             counts_toward_workload = 1, override_acknowledged_at = NULL, override_acknowledged_by = NULL,
             updated_by = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(
            action?.id ?? null,
            resolution?.assignedStaffId ?? null,
            resolution?.resolutionType ?? null,
            defaultDetailsWithNote(
              resolution?.detailsJson ?? null,
              assignment.resolution_details_json,
            ),
            action?.room_id ?? assignment.room_id,
            resolution?.status ?? 'unresolved',
            resolution?.isDefault ? 1 : 0,
            resolution?.conflict ?? null,
            actorId,
            now,
            assignment.id,
          ),
      );
    }
    if (statements.length) await this.db.batch(statements);
    return { detail: await this.getPlan(plan.date), result };
  }

  async leaveUncovered(
    assignmentId: string,
    acknowledged: boolean,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    if (assignment.responsibility_type === 'instruction' && !acknowledged) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        'Instructional Assignments require explicit acknowledgement before being left uncovered.',
      );
    }
    const noteDetailsJson = noteOnlyDetailsJson(
      assignment.resolution_details_json,
    );
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = 'intentional_uncovered',
                  resolution_details_json = ?, status = 'intentionally_uncovered',
                  is_default = ?,
                  conflict_explanation = NULL, override_acknowledged_at = ?,
                  override_acknowledged_by = ?, updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          noteDetailsJson,
          assignment.default_action_type === 'leave_uncovered' ? 1 : 0,
          assignment.responsibility_type === 'instruction' ? now : null,
          assignment.responsibility_type === 'instruction' ? actorId : null,
          actorId,
          now,
          assignmentId,
        ),
    ]);
    return this.getPlan(
      (await this.planById(assignment.daily_sub_plan_id)).date,
    );
  }

  async combineClass(
    assignmentId: string,
    receivingScheduleEntryId: string,
    roomId: string | null,
    note: string | null,
    overrideAcknowledged: boolean,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    if (assignment.responsibility_type !== 'instruction') {
      throw new HttpError(
        400,
        'combine_requires_instruction',
        'Only instructional Assignments can be combined with another class.',
      );
    }
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const entries = await this.entriesForPlan(plan);
    const receivingEntry = entries.find(
      (entry) => entry.id === receivingScheduleEntryId,
    );
    if (
      !receivingEntry ||
      (receivingEntry.day_type !== 'ALL' &&
        receivingEntry.day_type !== plan.day_type) ||
      receivingEntry.activity_type !== 'instruction' ||
      receivingEntry.staff_id === assignment.absent_staff_id ||
      receivingEntry.start_time >= assignment.end_time ||
      assignment.start_time >= receivingEntry.end_time
    ) {
      throw new HttpError(
        400,
        'invalid_combine_target',
        'Choose a concurrent instructional responsibility for another active staff member.',
      );
    }
    const receivingStaff = await this.activeStaff(receivingEntry.staff_id);
    const check = await this.candidateCheck(
      plan,
      receivingStaff,
      assignment.start_time,
      assignment.end_time,
      assignmentId,
    );
    const conflicts = check.conflicts.filter(
      (message) => !message.startsWith('Scheduled conflict:'),
    );
    if (conflicts.length > 0 && !overrideAcknowledged) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        conflicts.join(' '),
      );
    }
    const plannedRoomId = await this.resolvePlannedRoomId(
      assignment,
      plan,
      roomId,
    );
    const details = compactDetails({
      receivingScheduleEntryId: receivingEntry.id,
      receivingStaffId: receivingEntry.staff_id,
      receivingStaffName: receivingEntry.staff_name,
      receivingDescription: receivingEntry.description,
      receivingStartTime: receivingEntry.start_time,
      receivingEndTime: receivingEntry.end_time,
      note,
    });
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = 'combine_class',
                  resolution_details_json = ?, room_id = ?, status = 'assigned',
                  is_default = 0, conflict_explanation = NULL,
                  override_acknowledged_at = ?, override_acknowledged_by = ?,
                  updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          JSON.stringify(details),
          plannedRoomId,
          conflicts.length > 0 ? now : null,
          conflicts.length > 0 ? actorId : null,
          actorId,
          now,
          assignmentId,
        ),
    ]);
    return this.getPlan(plan.date);
  }

  async redistributeClass(
    assignmentId: string,
    receivingStaffIds: readonly string[],
    roomId: string | null,
    note: string | null,
    overrideAcknowledged: boolean,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    if (assignment.responsibility_type !== 'instruction') {
      throw new HttpError(
        400,
        'redistribution_requires_instruction',
        'Only instructional Assignments can be redistributed.',
      );
    }
    const uniqueIds = [...new Set(receivingStaffIds)];
    if (uniqueIds.length !== receivingStaffIds.length) {
      throw new HttpError(
        400,
        'duplicate_redistribution_recipient',
        'Choose each redistribution recipient only once.',
      );
    }
    if (uniqueIds.length < 2) {
      throw new HttpError(
        400,
        'redistribution_recipients_required',
        'Choose at least two receiving staff members.',
      );
    }
    if (uniqueIds.includes(assignment.absent_staff_id)) {
      throw new HttpError(
        400,
        'absent_staff_cannot_receive',
        'The absent staff member cannot receive their own class.',
      );
    }
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const recipients: StaffRow[] = [];
    const conflicts: string[] = [];
    for (const staffId of uniqueIds) {
      const recipient = await this.activeStaff(staffId);
      recipients.push(recipient);
      const check = await this.candidateCheck(
        plan,
        recipient,
        assignment.start_time,
        assignment.end_time,
        assignmentId,
      );
      conflicts.push(
        ...check.conflicts.map(
          (message) => `${recipient.display_name}: ${message}`,
        ),
      );
    }
    if (conflicts.length > 0 && !overrideAcknowledged) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        conflicts.join(' '),
      );
    }
    const plannedRoomId = await this.resolvePlannedRoomId(
      assignment,
      plan,
      roomId,
    );
    const details = compactDetails({
      receivingStaffIds: recipients.map((recipient) => recipient.id),
      receivingStaffNames: recipients.map(
        (recipient) => recipient.display_name,
      ),
      allocation: 'equal',
      note,
    });
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = 'redistribution',
                  resolution_details_json = ?, room_id = ?, status = 'assigned',
                  is_default = 0, conflict_explanation = NULL,
                  override_acknowledged_at = ?, override_acknowledged_by = ?,
                  updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          JSON.stringify(details),
          plannedRoomId,
          conflicts.length > 0 ? now : null,
          conflicts.length > 0 ? actorId : null,
          actorId,
          now,
          assignmentId,
        ),
    ]);
    return this.getPlan(plan.date);
  }

  async updateAssignmentDetails(
    assignmentId: string,
    roomId: string | null,
    note: string | null,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const plannedRoomId = await this.resolvePlannedRoomId(
      assignment,
      plan,
      roomId,
    );
    const currentDetails = assignment.resolution_type
      ? detailsRecord(assignment.resolution_details_json)
      : {};
    const details = compactDetails({ ...currentDetails, note });
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE assignments
            SET room_id = ?, resolution_details_json = ?, updated_by = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        plannedRoomId,
        Object.keys(details).length > 0 ? JSON.stringify(details) : null,
        actorId,
        now,
        assignmentId,
      )
      .run();
    return this.getPlan(plan.date);
  }

  async split(
    assignmentId: string,
    segments: readonly SplitSegmentInput[],
    assignAnyway: boolean,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    try {
      validateSplitSegments(
        { startTime: assignment.start_time, endTime: assignment.end_time },
        segments,
      );
    } catch (cause) {
      throw new HttpError(
        400,
        'invalid_split',
        cause instanceof Error ? cause.message : 'Invalid split.',
      );
    }
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const staffRows = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub, standard_period_minutes FROM staff
          WHERE is_active = 1 AND can_sub = 1`,
      )
      .all<StaffRow>();
    const staffById = new Map(staffRows.results.map((row) => [row.id, row]));
    const conflicts: string[] = [];
    for (const segment of segments) {
      if (segment.staffId === assignment.absent_staff_id) {
        throw new HttpError(
          400,
          'invalid_candidate',
          'Absent staff cannot cover their own Assignment.',
        );
      }
      const staff = staffById.get(segment.staffId);
      if (!staff)
        throw new HttpError(
          400,
          'invalid_candidate',
          'A split candidate is not active.',
        );
      const check = await this.candidateCheck(
        plan,
        staff,
        segment.startTime,
        segment.endTime,
        assignmentId,
      );
      conflicts.push(
        ...check.conflicts.map(
          (message) => `${staff.display_name}: ${message}`,
        ),
      );
    }
    if (conflicts.length > 0 && !assignAnyway) {
      throw new HttpError(
        409,
        'override_acknowledgement_required',
        conflicts.join(' '),
      );
    }
    const noteDetailsJson = noteOnlyDetailsJson(
      assignment.resolution_details_json,
    );
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
    ];
    segments.forEach((segment, index) => {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO assignment_segments
               (id, assignment_id, start_time, end_time, staff_id, sequence)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            assignmentId,
            segment.startTime,
            segment.endTime,
            segment.staffId,
            index,
          ),
      );
    });
    statements.push(
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = 'split_coverage',
                  resolution_details_json = ?, status = 'assigned', is_default = 0,
                  conflict_explanation = NULL, override_acknowledged_at = ?,
                  override_acknowledged_by = ?, updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          noteDetailsJson,
          conflicts.length > 0 ? now : null,
          conflicts.length > 0 ? actorId : null,
          actorId,
          now,
          assignmentId,
        ),
    );
    await this.db.batch(statements);
    return this.getPlan(plan.date);
  }

  async regenerateMessage(date: string, actorId: string) {
    const detail = await this.getPlan(date);
    await this.assertDraft(detail.plan.id);
    const settings = await this.settings();
    const assignments = detail.assignments.map((assignment) => ({
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      absentTeacher: assignment.absentStaff.displayName,
      description: assignment.description,
      resolution: resolutionLabel(assignment),
    }));
    const text = renderSubPlanMessage({
      template: settings.message_template,
      schoolName: settings.school_name,
      date,
      dayType: detail.plan.dayType,
      absentTeachers: [
        ...new Set(detail.absences.map((absence) => absence.staffName)),
      ],
      assignments,
    });
    await this.db
      .prepare(
        `INSERT INTO generated_messages
           (id, daily_sub_plan_id, generated_text, edited_text, generated_by)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), detail.plan.id, text, text, actorId)
      .run();
    return this.getPlan(date);
  }

  async editMessage(date: string, editedText: string) {
    const plan = await this.findPlan(date);
    if (!plan)
      throw new HttpError(
        404,
        'plan_not_found',
        'No Sub Plan exists for this date.',
      );
    await this.assertDraft(plan.id);
    const message = await this.latestMessage(plan.id);
    if (!message)
      throw new HttpError(
        409,
        'message_not_generated',
        'Generate the message before editing it.',
      );
    await this.db
      .prepare(`UPDATE generated_messages SET edited_text = ? WHERE id = ?`)
      .bind(editedText, message.id)
      .run();
    return this.getPlan(date);
  }

  async setStatus(
    date: string,
    status: 'draft' | 'finalized',
    actorId: string,
  ) {
    const plan = await this.findPlan(date);
    if (!plan)
      throw new HttpError(
        404,
        'plan_not_found',
        'No Sub Plan exists for this date.',
      );
    const now = new Date().toISOString();
    if (status === 'finalized') {
      const unresolved = await this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM assignments
            WHERE daily_sub_plan_id = ? AND status = 'unresolved'`,
        )
        .bind(plan.id)
        .first<CountRow>();
      if ((unresolved?.count ?? 0) > 0) {
        throw new HttpError(
          409,
          'unresolved_assignments',
          'Resolve all Assignments before finalizing.',
        );
      }
      await this.db
        .prepare(
          `UPDATE daily_sub_plans
              SET status = 'finalized', finalized_at = ?, finalized_by = ?,
                  updated_at = ?, updated_by = ? WHERE id = ?`,
        )
        .bind(now, actorId, now, actorId, plan.id)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE daily_sub_plans
              SET status = 'draft', updated_at = ?, updated_by = ? WHERE id = ?`,
        )
        .bind(now, actorId, plan.id)
        .run();
    }
    return this.getPlan(date);
  }

  private async changeDayType(
    plan: PlanRow,
    dayType: DayType,
    actorId: string,
  ) {
    await this.assertDraft(plan.id);
    const generated = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM assignments
          WHERE daily_sub_plan_id = ?`,
      )
      .bind(plan.id)
      .first<CountRow>();
    if ((generated?.count ?? 0) > 0) {
      throw new HttpError(
        409,
        'day_type_has_assignments',
        'Change the A/B designation before recording absences for this date.',
      );
    }
    await this.db
      .prepare(
        `UPDATE daily_sub_plans SET day_type = ?, updated_by = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .bind(dayType, actorId, plan.id)
      .run();
  }

  private async evaluateDefault(
    action: DefaultActionRow,
    plan: PlanRow,
    startTime: string,
    endTime: string,
    newAbsence: {
      staffId: string;
      startDate: string;
      endDate: string;
      startTime: string | null;
      endTime: string | null;
    },
    excludeAssignmentId: string | null = null,
  ) {
    if (action.action_type === 'move_room') {
      return {
        assignedStaffId: null,
        resolutionType: null,
        detailsJson: action.details_json,
        status: 'unresolved',
        isDefault: false,
        conflict:
          'The Default Sub Plan room was applied, but this Assignment still needs a primary resolution.',
      };
    }
    if (action.action_type === 'leave_uncovered') {
      return {
        assignedStaffId: null,
        resolutionType: 'intentional_uncovered',
        detailsJson: action.details_json,
        status: 'intentionally_uncovered',
        isDefault: true,
        conflict: null,
      };
    }
    if (!action.assigned_staff_id) {
      if (action.action_type === 'manual_unresolved') return null;
      return {
        assignedStaffId: null,
        resolutionType: defaultResolutionType(action.action_type),
        detailsJson: action.details_json,
        status: 'assigned',
        isDefault: true,
        conflict: null,
      };
    }
    const person = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub, standard_period_minutes FROM staff
          WHERE id = ? AND is_active = 1`,
      )
      .bind(action.assigned_staff_id)
      .first<StaffRow>();
    if (!person) {
      return unresolvedDefault(
        'The preferred staff member is no longer active.',
      );
    }
    if (
      newAbsence.staffId === person.id &&
      newAbsence.startDate <= plan.date &&
      plan.date <= newAbsence.endDate &&
      timeRangesOverlap(
        newAbsence.startTime,
        newAbsence.endTime,
        startTime,
        endTime,
      )
    ) {
      return unresolvedDefault(`${person.display_name} is also absent.`);
    }
    const check = await this.candidateCheck(
      plan,
      person,
      startTime,
      endTime,
      excludeAssignmentId,
    );
    if (check.conflicts.length > 0 || check.sourceType === 'manual') {
      const reason =
        check.conflicts[0] ??
        `${person.display_name} is not automatically available for this Assignment.`;
      return unresolvedDefault(reason);
    }
    return {
      assignedStaffId: person.id,
      resolutionType: defaultResolutionType(action.action_type),
      detailsJson: action.details_json,
      status: 'assigned',
      isDefault: true,
      conflict: null,
    };
  }

  private async candidateCheck(
    plan: PlanRow,
    staff: StaffRow,
    startTime: string,
    endTime: string,
    excludeAssignmentId: string | null,
  ): Promise<CandidateCheck> {
    const [entries, absences, assignments] = await Promise.all([
      this.entriesForPlan(plan),
      this.absencesForDate(plan.date),
      this.assignmentsForPlan(plan.id),
    ]);
    const segments = await this.segmentsForAssignments(
      assignments.map((assignment) => assignment.id),
    );
    return evaluateCandidate(
      plan,
      staff,
      startTime,
      endTime,
      excludeAssignmentId,
      {
        entries,
        absences,
        assignments,
        segments,
      },
    );
  }

  private async soloCandidates(
    assignment: AssignmentRow,
    plan: PlanRow,
    entries: readonly EntryRow[],
    absences: readonly AbsenceRow[],
    assignments: readonly AssignmentRow[],
    segments: readonly SegmentRow[],
  ): Promise<SoloCandidate[]> {
    if (!assignment.shared_responsibility_key) return [];
    const sourceEntries = entries.filter(
      (entry) =>
        sharedResponsibilityKeyForEntry(entry, plan) ===
        assignment.shared_responsibility_key,
    );
    const presentScheduled = sourceEntries.filter(
      (entry) =>
        !absences.some(
          (absence) =>
            absence.staff_id === entry.staff_id &&
            timeRangesOverlap(
              absence.start_time,
              absence.end_time,
              assignment.start_time,
              assignment.end_time,
            ),
        ),
    );
    const scheduled = presentScheduled.map((entry) => {
      const conflicts = coverageConflicts(
        entry.staff_id,
        assignment,
        assignments,
        segments,
      );
      return {
        id: entry.staff_id,
        displayName: entry.staff_name,
        kind: 'scheduled' as const,
        conflicts,
      };
    });
    if (scheduled.length > 0) return uniqueSoloCandidates(scheduled);

    const replacementPreview = await this.candidatesWithoutSolo(
      assignment,
      plan,
      entries,
      absences,
      assignments,
      segments,
    );
    return replacementPreview.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      kind: 'replacement' as const,
      conflicts: candidate.conflicts,
    }));
  }

  private async candidatesWithoutSolo(
    assignment: AssignmentRow,
    plan: PlanRow,
    entries: readonly EntryRow[],
    absences: readonly AbsenceRow[],
    assignments: readonly AssignmentRow[],
    segments: readonly SegmentRow[],
  ): Promise<CandidatePreview[]> {
    const staff = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub, standard_period_minutes FROM staff
          WHERE is_active = 1 AND can_sub = 1 AND id <> ? ORDER BY display_name, id`,
      )
      .bind(assignment.absent_staff_id)
      .all<StaffRow>();
    return staff.results.map((person) => {
      const check = evaluateCandidate(
        plan,
        person,
        assignment.start_time,
        assignment.end_time,
        assignment.id,
        { entries, absences, assignments, segments },
      );
      return {
        id: person.id,
        displayName: person.display_name,
        role: normalizeStaffRole(person.role),
        isSchoolSub: person.is_school_sub === 1,
        isDefaultCandidate: false,
        availability: check.sourceType,
        availabilitySource: check.source,
        conflicts: check.conflicts,
        warnings: check.warnings,
        currentBurden: 0,
        proposedBurden: 0,
        projectedBurden: 0,
        standardPeriodMinutes: null,
        standardPeriodSource: null,
        workloadKnown: true,
        threshold: 0,
        windowDays: 0,
      };
    });
  }

  private async activeStaff(staffId: string): Promise<StaffRow> {
    const staff = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub, standard_period_minutes
           FROM staff WHERE id = ? AND is_active = 1`,
      )
      .bind(staffId)
      .first<StaffRow>();
    if (!staff) {
      throw new HttpError(
        400,
        'invalid_recipient',
        'Choose an active receiving staff member.',
      );
    }
    return staff;
  }

  private async resolvePlannedRoomId(
    assignment: AssignmentRow,
    plan: PlanRow,
    requestedRoomId: string | null,
  ): Promise<string | null> {
    if (requestedRoomId) {
      const room = await this.db
        .prepare(`SELECT id FROM rooms WHERE id = ? AND is_active = 1`)
        .bind(requestedRoomId)
        .first<{ id: string }>();
      if (!room) {
        throw new HttpError(400, 'invalid_room', 'Choose an active Room.');
      }
      return room.id;
    }
    const sourceEntryId = plan.special_schedule_id
      ? assignment.source_special_schedule_entry_id
      : assignment.source_schedule_entry_id;
    const sourceEntry = (await this.entriesForPlan(plan)).find(
      (entry) => entry.id === sourceEntryId,
    );
    return sourceEntry?.room_id ?? null;
  }

  private async burdensForWindow(
    date: string,
    windowDays: number,
    excludeAssignmentId: string,
  ): Promise<Map<string, number | null>> {
    const startDate = shiftSchoolDate(date, -(windowDays - 1));
    const coverage = await this.db
      .prepare(
        `SELECT a.assigned_staff_id AS staff_id, p.date, p.day_type,
                p.schedule_version_id, p.special_schedule_id,
                a.start_time, a.end_time, st.standard_period_minutes,
                st.is_school_sub
           FROM assignments a
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff st ON st.id = a.assigned_staff_id
          WHERE a.assigned_staff_id IS NOT NULL AND a.status = 'assigned' AND a.counts_toward_workload = 1
            AND a.id <> ? AND p.date BETWEEN ? AND ?
          UNION ALL
         SELECT s.staff_id, p.date, p.day_type, p.schedule_version_id,
                p.special_schedule_id, s.start_time, s.end_time,
                st.standard_period_minutes, st.is_school_sub
           FROM assignment_segments s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff st ON st.id = s.staff_id
          WHERE a.status = 'assigned' AND a.counts_toward_workload = 1 AND a.id <> ?
            AND p.date BETWEEN ? AND ?`,
      )
      .bind(
        excludeAssignmentId,
        startDate,
        date,
        excludeAssignmentId,
        startDate,
        date,
      )
      .all<WorkloadCoverageRow>();
    if (coverage.results.length === 0) return new Map();

    const normalSourceIds = new Set<string>();
    const specialSourceIds = new Set<string>();
    for (const item of coverage.results) {
      if (item.is_school_sub === 1) continue;
      if (item.schedule_version_id)
        normalSourceIds.add(item.schedule_version_id);
      if (item.special_schedule_id)
        specialSourceIds.add(item.special_schedule_id);
    }
    const planEntries = await this.planEntriesForSources(
      [...normalSourceIds],
      [...specialSourceIds],
    );
    const entriesByCandidateAndSource = new Map<
      string,
      WorkloadPlanEntryRow[]
    >();
    for (const entry of planEntries) {
      const key = `${entry.staff_id}:${entry.source_type}:${entry.source_id}`;
      const list = entriesByCandidateAndSource.get(key) ?? [];
      list.push(entry);
      entriesByCandidateAndSource.set(key, list);
    }

    const coverageGroups = new Map<
      string,
      {
        item: WorkloadCoverageRow;
        coverage: Array<{ startTime: string; endTime: string }>;
      }
    >();
    for (const item of coverage.results) {
      if (item.is_school_sub === 1) continue;
      const key = [
        item.staff_id,
        item.date,
        item.day_type,
        item.schedule_version_id ?? '',
        item.special_schedule_id ?? '',
      ].join(':');
      const group = coverageGroups.get(key) ?? { item, coverage: [] };
      group.coverage.push({
        startTime: item.start_time,
        endTime: item.end_time,
      });
      coverageGroups.set(key, group);
    }

    const burdens = new Map<string, number | null>();
    for (const {
      item,
      coverage: coveredIntervals,
    } of coverageGroups.values()) {
      const sourceType = item.special_schedule_id ? 'special' : 'normal';
      const sourceId = item.special_schedule_id ?? item.schedule_version_id;
      if (!sourceId) continue;
      const sourceEntries =
        entriesByCandidateAndSource.get(
          `${item.staff_id}:${sourceType}:${sourceId}`,
        ) ?? [];
      const blocks = sourceEntries
        .filter(
          (entry) =>
            entry.activity_type === 'plan' &&
            (entry.day_type === 'ALL' || entry.day_type === item.day_type),
        )
        .map((entry) => ({
          startTime: entry.start_time,
          endTime: entry.end_time,
        }));
      const standardPeriodMinutes = resolveStandardPeriodMinutes({
        configuredMinutes: item.standard_period_minutes,
        dayType: item.day_type,
        normalEntries: item.schedule_version_id
          ? (
              entriesByCandidateAndSource.get(
                `${item.staff_id}:normal:${item.schedule_version_id}`,
              ) ?? []
            ).map(periodEntryDto)
          : [],
        applicableEntries: sourceEntries.map(periodEntryDto),
      });
      const burden = calculatePlanPeriodsLost(
        blocks,
        coveredIntervals,
        standardPeriodMinutes,
      );
      const existing = burdens.has(item.staff_id)
        ? (burdens.get(item.staff_id) ?? null)
        : 0;
      burdens.set(
        item.staff_id,
        existing === null || burden === null ? null : round(existing + burden),
      );
    }
    return burdens;
  }

  private async planEntriesForSources(
    normalSourceIds: readonly string[],
    specialSourceIds: readonly string[],
  ): Promise<WorkloadPlanEntryRow[]> {
    const queries: string[] = [];
    const bindings: string[] = [];
    if (normalSourceIds.length > 0) {
      queries.push(
        `SELECT 'normal' AS source_type, schedule_version_id AS source_id,
                staff_id, day_type, start_time, end_time, activity_type
           FROM schedule_entries
          WHERE activity_type IN ('plan', 'instruction')
            AND schedule_version_id IN (${normalSourceIds.map(() => '?').join(',')})`,
      );
      bindings.push(...normalSourceIds);
    }
    if (specialSourceIds.length > 0) {
      queries.push(
        `SELECT 'special' AS source_type, special_schedule_id AS source_id,
                staff_id, day_type, start_time, end_time, activity_type
           FROM special_schedule_entries
          WHERE activity_type IN ('plan', 'instruction')
            AND special_schedule_id IN (${specialSourceIds.map(() => '?').join(',')})`,
      );
      bindings.push(...specialSourceIds);
    }
    if (queries.length === 0) return [];
    const result = await this.db
      .prepare(queries.join(' UNION ALL '))
      .bind(...bindings)
      .all<WorkloadPlanEntryRow>();
    return result.results;
  }

  private async periodEntriesForPlan(
    plan: PlanRow,
  ): Promise<WorkloadPlanEntryRow[]> {
    return this.planEntriesForSources(
      plan.schedule_version_id ? [plan.schedule_version_id] : [],
      plan.special_schedule_id ? [plan.special_schedule_id] : [],
    );
  }

  private async planSeed(
    date: string,
    actorId: string,
  ): Promise<{
    plan: PlanRow;
    insert: D1PreparedStatement | null;
  }> {
    if (!isSchoolDay(date)) {
      throw new HttpError(
        400,
        'weekend_plan_not_allowed',
        'Daily Sub Plans require a weekday.',
      );
    }
    const existing = await this.findPlan(date);
    if (existing) return { plan: existing, insert: null };
    const resolved = await this.resolveSchedule(date);
    const planId = crypto.randomUUID();
    const calendar = await this.calendarForDate(date);
    const fallback = resolved.normal
      ? expectedDayType(date, resolved.normal.effective_from)
      : 'A';
    const dayType = calendarExpectedDayType(calendar, fallback);
    return {
      plan: {
        id: planId,
        date,
        day_type: dayType,
        schedule_version_id: resolved.normal?.id ?? null,
        special_schedule_id: resolved.special?.id ?? null,
        status: 'draft',
        finalized_at: null,
        finalized_by: null,
        schedule_name: resolved.normal?.name ?? null,
        special_schedule_name: resolved.special?.name ?? null,
        effective_from: resolved.normal?.effective_from ?? null,
        calendar_expected_day_type: calendar?.expectedDayType ?? null,
        calendar_is_school_day: calendar ? Number(calendar.isSchoolDay) : null,
        calendar_is_blackout_day: calendar
          ? Number(calendar.isBlackoutDay)
          : null,
        calendar_expects_special_schedule: calendar
          ? Number(calendar.expectsSpecialSchedule)
          : null,
        calendar_label: calendar?.label ?? null,
      },
      insert: this.db
        .prepare(
          `INSERT INTO daily_sub_plans (
             id, date, day_type, schedule_version_id, special_schedule_id,
             status, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
        )
        .bind(
          planId,
          date,
          dayType,
          resolved.normal?.id ?? null,
          resolved.special?.id ?? null,
          actorId,
          actorId,
        ),
    };
  }

  private async resolveSchedule(date: string) {
    const [special, normal] = await Promise.all([
      this.db
        .prepare(
          `SELECT id, name FROM special_schedules WHERE date = ? AND status = 'active' LIMIT 1`,
        )
        .bind(date)
        .first<SpecialScheduleRow>(),
      this.db
        .prepare(
          `SELECT id, name, effective_from FROM schedule_versions
            WHERE status = 'active' AND effective_from <= ?
              AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC LIMIT 2`,
        )
        .bind(date, date)
        .all<ScheduleResolutionRow>(),
    ]);
    if (normal.results.length === 0) {
      if (special) return { normal: null, special };
      throw new HttpError(
        409,
        'no_schedule_for_date',
        'No active Special Schedule or normal Schedule Version is configured for this date.',
      );
    }
    if (normal.results.length > 1) {
      throw new HttpError(
        409,
        'ambiguous_schedule',
        'Multiple active Schedule Versions apply to this date.',
      );
    }
    return { normal: normal.results[0]!, special };
  }

  private async calendarForDate(date: string): Promise<{
    expectedDayType: DayType | null;
    isSchoolDay: boolean;
    isBlackoutDay: boolean;
    expectsSpecialSchedule: boolean;
    label: string | null;
  } | null> {
    const row = await this.db
      .prepare(
        `SELECT expected_day_type, is_school_day, is_blackout_day,
              expects_special_schedule, label
         FROM school_calendar_dates WHERE date = ?`,
      )
      .bind(date)
      .first<{
        expected_day_type: DayType | null;
        is_school_day: number;
        is_blackout_day: number;
        expects_special_schedule: number;
        label: string | null;
      }>();
    return row
      ? {
          expectedDayType: row.expected_day_type,
          isSchoolDay: row.is_school_day === 1,
          isBlackoutDay: row.is_blackout_day === 1,
          expectsSpecialSchedule: row.expects_special_schedule === 1,
          label: row.label,
        }
      : null;
  }

  private async findPlan(date: string): Promise<PlanRow | null> {
    return this.db
      .prepare(
        `SELECT p.id, p.date, p.day_type, p.schedule_version_id,
                p.special_schedule_id, p.status, p.finalized_at, p.finalized_by,
                sv.name AS schedule_name, ss.name AS special_schedule_name,
                sv.effective_from,
                c.expected_day_type AS calendar_expected_day_type,
                c.is_school_day AS calendar_is_school_day,
                c.is_blackout_day AS calendar_is_blackout_day,
                c.expects_special_schedule AS calendar_expects_special_schedule,
                c.label AS calendar_label
           FROM daily_sub_plans p
      LEFT JOIN schedule_versions sv ON sv.id = p.schedule_version_id
      LEFT JOIN special_schedules ss ON ss.id = p.special_schedule_id
      LEFT JOIN school_calendar_dates c ON c.date = p.date
          WHERE p.date = ?`,
      )
      .bind(date)
      .first<PlanRow>();
  }

  private async planById(id: string): Promise<PlanRow> {
    const row = await this.db
      .prepare(
        `SELECT p.id, p.date, p.day_type, p.schedule_version_id,
                p.special_schedule_id, p.status, p.finalized_at, p.finalized_by,
                sv.name AS schedule_name, ss.name AS special_schedule_name,
                sv.effective_from,
                c.expected_day_type AS calendar_expected_day_type,
                c.is_school_day AS calendar_is_school_day,
                c.is_blackout_day AS calendar_is_blackout_day,
                c.expects_special_schedule AS calendar_expects_special_schedule,
                c.label AS calendar_label
           FROM daily_sub_plans p
      LEFT JOIN schedule_versions sv ON sv.id = p.schedule_version_id
      LEFT JOIN special_schedules ss ON ss.id = p.special_schedule_id
      LEFT JOIN school_calendar_dates c ON c.date = p.date
          WHERE p.id = ?`,
      )
      .bind(id)
      .first<PlanRow>();
    if (!row) throw new HttpError(404, 'plan_not_found', 'Sub Plan not found.');
    assertPlanSource(row);
    return row;
  }

  private async entriesForPlan(plan: PlanRow): Promise<EntryRow[]> {
    assertPlanSource(plan);
    const table = plan.special_schedule_id
      ? 'special_schedule_entries'
      : 'schedule_entries';
    const foreignKey = plan.special_schedule_id
      ? 'special_schedule_id'
      : 'schedule_version_id';
    const sourceId = plan.special_schedule_id ?? plan.schedule_version_id;
    if (!sourceId) {
      throw new HttpError(
        500,
        'invalid_schedule_source',
        'The Sub Plan has no pinned schedule source.',
      );
    }
    const result = await this.db
      .prepare(
        `SELECT e.id, e.staff_id, s.display_name AS staff_name, e.day_type,
                e.start_time, e.end_time, e.activity_type, e.category,
                e.description, e.room_id, r.name AS room_name, e.requires_sub
           FROM ${table} e
           JOIN staff s ON s.id = e.staff_id
      LEFT JOIN rooms r ON r.id = e.room_id
          WHERE e.${foreignKey} = ?
          ORDER BY s.display_name, e.start_time, e.end_time`,
      )
      .bind(sourceId)
      .all<EntryRow>();
    return result.results;
  }

  private async absencesForDate(date: string): Promise<AbsenceRow[]> {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.staff_id, s.display_name AS staff_name, a.start_date,
                a.end_date, a.start_time, a.end_time
           FROM absences a JOIN staff s ON s.id = a.staff_id
          WHERE a.start_date <= ? AND a.end_date >= ?
          ORDER BY s.display_name, a.start_time`,
      )
      .bind(date, date)
      .all<AbsenceRow>();
    return result.results;
  }

  private async defaultActions(
    staffId: string,
    dayType: DayType,
  ): Promise<DefaultActionRow[]> {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.action_type, a.start_time, a.end_time,
                a.assigned_staff_id, s.display_name AS assigned_staff_name,
                a.room_id, r.name AS room_name, a.details_json, a.sequence
           FROM default_sub_plans p
           JOIN default_sub_plan_actions a ON a.default_sub_plan_id = p.id
      LEFT JOIN staff s ON s.id = a.assigned_staff_id
      LEFT JOIN rooms r ON r.id = a.room_id
          WHERE p.absent_staff_id = ? AND p.status = 'active'
            AND (p.day_type IS NULL OR p.day_type = ?)
          ORDER BY CASE WHEN p.day_type = ? THEN 0 ELSE 1 END,
                   p.version DESC, a.sequence`,
      )
      .bind(staffId, dayType, dayType)
      .all<DefaultActionRow>();
    return result.results;
  }

  private async assignmentsForPlan(planId: string): Promise<AssignmentRow[]> {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.daily_sub_plan_id, a.absence_id, a.shared_responsibility_key,
                a.counts_toward_workload,
                a.source_schedule_entry_id, a.source_special_schedule_entry_id,
                a.start_time, a.end_time,
                a.responsibility_type, a.description, a.room_id, r.name AS room_name,
                a.default_action_id, da.action_type AS default_action_type,
                da.assigned_staff_id AS default_staff_id,
                ds.display_name AS default_staff_name,
                da.details_json AS default_details_json,
                a.assigned_staff_id, assigned.display_name AS assigned_staff_name,
                assigned.is_school_sub AS assigned_is_school_sub,
                a.resolution_type, a.resolution_details_json, a.status, a.is_default,
                a.conflict_explanation, absent.id AS absent_staff_id,
                absent.display_name AS absent_staff_name
           FROM assignments a
           JOIN absences ab ON ab.id = a.absence_id
           JOIN staff absent ON absent.id = ab.staff_id
      LEFT JOIN rooms r ON r.id = a.room_id
      LEFT JOIN staff assigned ON assigned.id = a.assigned_staff_id
      LEFT JOIN default_sub_plan_actions da ON da.id = a.default_action_id
      LEFT JOIN staff ds ON ds.id = da.assigned_staff_id
          WHERE a.daily_sub_plan_id = ?
          ORDER BY a.start_time, absent.display_name, a.description`,
      )
      .bind(planId)
      .all<AssignmentRow>();
    return result.results;
  }

  private async assignmentById(id: string): Promise<AssignmentRow> {
    const result = await this.db
      .prepare(
        `SELECT a.id, a.daily_sub_plan_id, a.absence_id, a.shared_responsibility_key,
                a.counts_toward_workload,
                a.source_schedule_entry_id, a.source_special_schedule_entry_id,
                a.start_time, a.end_time,
                a.responsibility_type, a.description, a.room_id, r.name AS room_name,
                a.default_action_id, da.action_type AS default_action_type,
                da.assigned_staff_id AS default_staff_id,
                ds.display_name AS default_staff_name,
                da.details_json AS default_details_json,
                a.assigned_staff_id, assigned.display_name AS assigned_staff_name,
                assigned.is_school_sub AS assigned_is_school_sub,
                a.resolution_type, a.resolution_details_json, a.status, a.is_default,
                a.conflict_explanation, absent.id AS absent_staff_id,
                absent.display_name AS absent_staff_name
           FROM assignments a
           JOIN absences ab ON ab.id = a.absence_id
           JOIN staff absent ON absent.id = ab.staff_id
      LEFT JOIN rooms r ON r.id = a.room_id
      LEFT JOIN staff assigned ON assigned.id = a.assigned_staff_id
      LEFT JOIN default_sub_plan_actions da ON da.id = a.default_action_id
      LEFT JOIN staff ds ON ds.id = da.assigned_staff_id
          WHERE a.id = ?`,
      )
      .bind(id)
      .first<AssignmentRow>();
    if (!result)
      throw new HttpError(404, 'assignment_not_found', 'Assignment not found.');
    return result;
  }

  private async segmentsForAssignments(
    ids: readonly string[],
  ): Promise<SegmentRow[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db
      .prepare(
        `SELECT s.id, s.assignment_id, s.start_time, s.end_time, s.staff_id,
                st.display_name AS staff_name,
                st.is_school_sub AS staff_is_school_sub, s.sequence
           FROM assignment_segments s JOIN staff st ON st.id = s.staff_id
          WHERE s.assignment_id IN (${placeholders})
          ORDER BY s.assignment_id, s.sequence`,
      )
      .bind(...ids)
      .all<SegmentRow>();
    return result.results;
  }

  private async settings(): Promise<SettingsRow> {
    const row = await this.db
      .prepare(
        `SELECT school_name, workload_warning_threshold, workload_window_days,
                split_snap_minutes, message_template
           FROM application_settings WHERE id = 'school'`,
      )
      .first<SettingsRow>();
    if (!row) throw new Error('Application settings have not been seeded.');
    return row;
  }

  private async latestMessage(planId: string): Promise<MessageRow | null> {
    return this.db
      .prepare(
        `SELECT id, generated_text, edited_text, generated_at
           FROM generated_messages WHERE daily_sub_plan_id = ?
          ORDER BY generated_at DESC, id DESC LIMIT 1`,
      )
      .bind(planId)
      .first<MessageRow>();
  }

  private async assertDraft(planId: string): Promise<void> {
    const row = await this.db
      .prepare(`SELECT status FROM daily_sub_plans WHERE id = ?`)
      .bind(planId)
      .first<{ status: string }>();
    if (row?.status !== 'draft') {
      throw new HttpError(
        409,
        'plan_finalized',
        'Reopen the finalized Sub Plan before editing it.',
      );
    }
  }
}

function evaluateCandidate(
  plan: PlanRow,
  staff: StaffRow,
  startTime: string,
  endTime: string,
  excludeAssignmentId: string | null,
  context: CandidateEvaluationContext,
): CandidateCheck {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const addConflict = (message: string) => {
    if (!conflicts.includes(message)) conflicts.push(message);
  };

  if (
    context.absences.some(
      (absence) =>
        absence.staff_id === staff.id &&
        timeRangesOverlap(
          absence.start_time,
          absence.end_time,
          startTime,
          endTime,
        ),
    )
  ) {
    addConflict(`${staff.display_name} is absent during this Assignment.`);
  }

  for (const assignment of context.assignments) {
    if (
      assignment.id !== excludeAssignmentId &&
      assignment.status === 'assigned' &&
      assignment.assigned_staff_id === staff.id &&
      assignment.start_time < endTime &&
      startTime < assignment.end_time
    ) {
      addConflict(
        `Overlapping sub coverage: ${assignment.description}, ${assignment.start_time}\u2013${assignment.end_time}.`,
      );
    }
  }
  const assignmentsById = new Map(
    context.assignments.map((assignment) => [assignment.id, assignment]),
  );
  for (const segment of context.segments) {
    if (
      segment.assignment_id !== excludeAssignmentId &&
      segment.staff_id === staff.id &&
      segment.start_time < endTime &&
      startTime < segment.end_time
    ) {
      const parent = assignmentsById.get(segment.assignment_id);
      addConflict(
        `Overlapping split coverage: ${parent?.description ?? 'another Assignment'}, ${segment.start_time}\u2013${segment.end_time}.`,
      );
    }
  }

  const applicableEntries = context.entries.filter(
    (entry) =>
      entry.staff_id === staff.id &&
      (entry.day_type === 'ALL' || entry.day_type === plan.day_type),
  );
  if (staff.is_school_sub === 1) {
    return {
      source: 'School Sub',
      sourceType: 'school_sub',
      conflicts,
      warnings,
    };
  }
  const scheduleAvailability = classifyScheduleAvailability(
    applicableEntries.map(availabilityEntryDto),
    { startTime, endTime },
  );
  for (const entry of scheduleAvailability.conflictingEntries) {
    addConflict(
      `Scheduled conflict: ${entry.description}, ${entry.startTime}\u2013${entry.endTime}.`,
    );
  }
  if (scheduleAvailability.availability === 'plan') {
    return { source: 'Plan Period', sourceType: 'plan', conflicts, warnings };
  }
  if (scheduleAvailability.availability === 'admin') {
    return { source: 'Admin', sourceType: 'admin', conflicts, warnings };
  }
  if (scheduleAvailability.availability === 'open') {
    return { source: 'Available', sourceType: 'open', conflicts, warnings };
  }
  return { source: 'Manual', sourceType: 'manual', conflicts, warnings };
}

function resolutionSource(
  assignment: AssignmentRow,
  schedule: readonly EntryRow[],
  dayType: DayType,
):
  | 'School Sub'
  | 'PLAN'
  | 'Admin'
  | 'Available'
  | 'Manual'
  | 'Override'
  | 'Scheduled'
  | null {
  if (!assignment.assigned_staff_id) return null;
  if (
    assignment.resolution_type === 'solo_coverage' &&
    detailsRecord(assignment.resolution_details_json).soloKind === 'scheduled'
  ) {
    return 'Scheduled';
  }
  if (assignment.resolution_type === 'manual_override') return 'Override';
  if (assignment.assigned_is_school_sub === 1) return 'School Sub';
  const applicableEntries = schedule.filter(
    (entry) =>
      entry.staff_id === assignment.assigned_staff_id &&
      (entry.day_type === 'ALL' || entry.day_type === dayType),
  );
  const availability = classifyScheduleAvailability(
    applicableEntries.map(availabilityEntryDto),
    {
      startTime: assignment.start_time,
      endTime: assignment.end_time,
    },
  );
  if (availability.availability === 'plan') return 'PLAN';
  if (availability.availability === 'admin') return 'Admin';
  if (availability.availability === 'open') return 'Available';
  return 'Manual';
}

function responsibilityType(
  activityType: string,
): 'instruction' | 'duty' | 'after_school' | 'other' {
  if (activityType === 'instruction') return 'instruction';
  if (activityType === 'duty' || activityType === 'lunch') return 'duty';
  if (activityType === 'after_school') return 'after_school';
  return 'other';
}

function sharedResponsibilityKeyForEntry(
  entry: Pick<
    EntryRow,
    | 'start_time'
    | 'end_time'
    | 'activity_type'
    | 'category'
    | 'description'
    | 'room_id'
    | 'day_type'
  >,
  plan: Pick<PlanRow, 'schedule_version_id' | 'special_schedule_id'>,
): string | null {
  if (!['duty', 'lunch', 'after_school', 'other'].includes(entry.activity_type))
    return null;
  return [
    plan.special_schedule_id ? 'special' : 'normal',
    plan.special_schedule_id ?? plan.schedule_version_id ?? '',
    entry.day_type,
    entry.start_time,
    entry.end_time,
    entry.activity_type,
    entry.category,
    entry.description.trim().toLocaleLowerCase('en-US'),
    entry.room_id ?? '',
  ].join('|');
}

function coverageConflicts(
  staffId: string,
  assignment: AssignmentRow,
  assignments: readonly AssignmentRow[],
  segments: readonly SegmentRow[],
): string[] {
  const conflicts: string[] = [];
  for (const item of assignments) {
    if (
      item.id !== assignment.id &&
      item.shared_responsibility_key !== assignment.shared_responsibility_key &&
      item.status === 'assigned' &&
      item.assigned_staff_id === staffId &&
      item.start_time < assignment.end_time &&
      assignment.start_time < item.end_time
    ) {
      conflicts.push(
        `Overlapping sub coverage: ${item.description}, ${item.start_time}–${item.end_time}.`,
      );
    }
  }
  for (const segment of segments) {
    const parent = assignments.find(
      (item) => item.id === segment.assignment_id,
    );
    if (
      segment.staff_id === staffId &&
      parent?.shared_responsibility_key !==
        assignment.shared_responsibility_key &&
      segment.start_time < assignment.end_time &&
      assignment.start_time < segment.end_time
    ) {
      conflicts.push(
        `Overlapping split coverage: ${parent?.description ?? 'another Assignment'}, ${segment.start_time}–${segment.end_time}.`,
      );
    }
  }
  return conflicts;
}

function uniqueSoloCandidates(
  candidates: readonly SoloCandidate[],
): SoloCandidate[] {
  return [
    ...new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];
}

function defaultResolutionType(actionType: string): string | null {
  const values: Record<string, string> = {
    teacher_covers: 'teacher_cover',
    redistribute_class: 'redistribution',
    switch_groups: 'switch_groups',
    combine_class: 'combine_class',
    cover_duty: 'duty_coverage',
  };
  return values[actionType] ?? null;
}

interface BulkOperationResult {
  changed: number;
  alreadyAssigned: number;
  skipped: number;
  conflicted: number;
  noDefault: number;
}

function emptyBulkResult(): BulkOperationResult {
  return {
    changed: 0,
    alreadyAssigned: 0,
    skipped: 0,
    conflicted: 0,
    noDefault: 0,
  };
}

function isSchoolSubBulkEligible(assignment: AssignmentRow): boolean {
  if (assignment.shared_responsibility_key) return false;
  if (
    assignment.responsibility_type !== 'instruction' &&
    assignment.responsibility_type !== 'duty'
  )
    return false;
  return ![
    'combine_class',
    'redistribution',
    'intentional_uncovered',
    'solo_coverage',
    'split_coverage',
  ].includes(assignment.resolution_type ?? '');
}

function unresolvedDefault(conflict: string) {
  return {
    assignedStaffId: null,
    resolutionType: null,
    detailsJson: null,
    status: 'unresolved',
    isDefault: false,
    conflict,
  };
}

function timeRangesOverlap(
  absenceStart: string | null,
  absenceEnd: string | null,
  startTime: string,
  endTime: string,
): boolean {
  if (!absenceStart || !absenceEnd) return true;
  return absenceStart < endTime && startTime < absenceEnd;
}

function resolutionInvalidation(
  assignment: AssignmentRow,
  segments: readonly SegmentRow[],
  absentStaff: { readonly id: string; readonly display_name: string },
  absenceStart: string | null,
  absenceEnd: string | null,
): string | null {
  if (
    assignment.status !== 'assigned' ||
    !timeRangesOverlap(
      absenceStart,
      absenceEnd,
      assignment.start_time,
      assignment.end_time,
    )
  ) {
    return null;
  }
  if (assignment.assigned_staff_id === absentStaff.id) {
    return `${absentStaff.display_name} is also absent.`;
  }
  if (
    assignment.resolution_type === 'split_coverage' &&
    segments.some(
      (segment) =>
        segment.assignment_id === assignment.id &&
        segment.staff_id === absentStaff.id &&
        timeRangesOverlap(
          absenceStart,
          absenceEnd,
          segment.start_time,
          segment.end_time,
        ),
    )
  ) {
    return `${absentStaff.display_name}, who was providing split coverage, is also absent.`;
  }
  const details = detailsRecord(assignment.resolution_details_json);
  const receivingStaffId = details.receivingStaffId;
  const receivingStaffIds = details.receivingStaffIds;
  const includesAbsentRecipient =
    receivingStaffId === absentStaff.id ||
    (Array.isArray(receivingStaffIds) &&
      receivingStaffIds.includes(absentStaff.id));
  if (!includesAbsentRecipient) return null;
  if (assignment.resolution_type === 'combine_class') {
    return `${absentStaff.display_name}, who was receiving the combined class, is also absent.`;
  }
  if (assignment.resolution_type === 'redistribution') {
    return `${absentStaff.display_name}, who was receiving part of the redistributed class, is also absent.`;
  }
  return `${absentStaff.display_name}, who was part of the current resolution, is also absent.`;
}

function assertPlanSource(plan: PlanRow): void {
  if (plan.schedule_version_id === null && plan.special_schedule_id === null) {
    throw new HttpError(
      500,
      'invalid_schedule_source',
      'The Sub Plan must pin a normal Schedule Version, a Special Schedule, or both.',
    );
  }
}

function absenceWarning(
  absence: AbsenceRow,
  assignments: readonly AssignmentRow[],
  schedule: readonly EntryRow[],
  dayType: DayType,
): string | null {
  if (assignments.some((assignment) => assignment.absence_id === absence.id))
    return null;
  const staffEntries = schedule.filter(
    (entry) => entry.staff_id === absence.staff_id,
  );
  if (staffEntries.length === 0) {
    return `${absence.staff_name} was added as absent, but no schedule entries were found for this staff member on the pinned schedule.`;
  }
  const applicableEntries = staffEntries.filter(
    (entry) => entry.day_type === 'ALL' || entry.day_type === dayType,
  );
  if (applicableEntries.length === 0) {
    return `${absence.staff_name} was added as absent, but no applicable ${dayType}-day schedule entries were found for this date.`;
  }
  if (absence.start_time && absence.end_time) {
    return `${absence.staff_name} was added as absent, but no scheduled responsibilities requiring a Sub overlap the recorded absence time.`;
  }
  return `${absence.staff_name} was added as absent, but no scheduled responsibilities requiring a Sub were found for this date.`;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function detailsRecord(value: string | null): Record<string, unknown> {
  const parsed = parseJson(value);
  return typeof parsed === 'object' && parsed && !Array.isArray(parsed)
    ? { ...parsed }
    : {};
}

function compactDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  );
}

function noteOnlyDetailsJson(value: string | null): string | null {
  const note = detailsRecord(value).note;
  return typeof note === 'string' && note.trim()
    ? JSON.stringify({ note: note.trim() })
    : null;
}

function defaultDetailsWithNote(
  defaultDetailsJson: string | null,
  previousDetailsJson: string | null,
): string | null {
  const note = detailsRecord(previousDetailsJson).note;
  const details = detailsRecord(defaultDetailsJson);
  if (typeof note === 'string' && note.trim()) details.note = note.trim();
  const compacted = compactDetails(details);
  return Object.keys(compacted).length ? JSON.stringify(compacted) : null;
}

function periodEntryDto(entry: WorkloadPlanEntryRow) {
  return {
    dayType: entry.day_type,
    startTime: entry.start_time,
    endTime: entry.end_time,
    activityType: entry.activity_type,
  };
}

function availabilityEntryDto(entry: EntryRow) {
  return {
    startTime: entry.start_time,
    endTime: entry.end_time,
    activityType: entry.activity_type,
    description: entry.description,
  };
}

function legacyResolutionLabel(assignment: {
  readonly assignedStaff: { displayName: string } | null;
  readonly status: string;
  readonly resolutionType: string | null;
  readonly segments: readonly {
    startTime: string;
    endTime: string;
    staffName: string;
  }[];
  readonly resolutionDetails: unknown;
  readonly roomId: string | null;
  readonly room: string | null;
  readonly scheduledRoomId: string | null;
}): string {
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (assignment.segments.length > 0) {
    return assignment.segments
      .map(
        (segment) =>
          `${segment.startTime}–${segment.endTime} ${segment.staffName}`,
      )
      .join('; ');
  }
  if (assignment.assignedStaff) return assignment.assignedStaff.displayName;
  if (assignment.resolutionType) {
    const details = assignment.resolutionDetails;
    const detailText =
      typeof details === 'object' && details
        ? ` — ${JSON.stringify(details)}`
        : '';
    return `${assignment.resolutionType.replaceAll('_', ' ')}${detailText}`;
  }
  return 'Unresolved';
}

function resolutionLabel(
  assignment: Parameters<typeof legacyResolutionLabel>[0],
): string {
  const details = unknownRecord(assignment.resolutionDetails);
  const note = stringDetail(details, 'note');
  const withNote = (label: string) => (note ? `${label} Note: ${note}` : label);
  const room = plannedMessageRoom(assignment);
  if (assignment.resolutionType === 'combine_class') {
    const target = [
      stringDetail(details, 'receivingStaffName'),
      stringDetail(details, 'receivingDescription'),
    ]
      .filter(Boolean)
      .join(' — ');
    return withNote(
      `Combined${target ? ` with ${target}` : ' Class'}${room ? ` in ${room}` : ''}.`,
    );
  }
  if (assignment.resolutionType === 'redistribution') {
    const recipients = formatNameList(
      stringArrayDetail(details, 'receivingStaffNames'),
    );
    return withNote(
      `Redistributed${recipients ? ` to ${recipients}` : ''}${room ? ` in ${room}` : ''}.`,
    );
  }
  if (
    assignment.resolutionType === 'solo_coverage' &&
    assignment.assignedStaff
  ) {
    return withNote(
      `${assignment.assignedStaff.displayName} solo${room ? ` in ${room}` : ''}.`,
    );
  }
  if (assignment.assignedStaff) {
    return withNote(
      `${assignment.assignedStaff.displayName}${room ? ` in ${room}` : ''}.`,
    );
  }
  return withNote(legacyResolutionLabel(assignment));
}

function unknownRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringDetail(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayDetail(
  details: Record<string, unknown>,
  key: string,
): string[] {
  const value = details[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatNameList(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function formatMessageRoom(room: string | null): string {
  if (!room) return '';
  return /^room\b/i.test(room) ? room : `Room ${room}`;
}

function plannedMessageRoom(
  assignment: Pick<
    Parameters<typeof legacyResolutionLabel>[0],
    'roomId' | 'room' | 'scheduledRoomId'
  >,
): string {
  if (assignment.roomId === assignment.scheduledRoomId) return '';
  return formatMessageRoom(assignment.room);
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
