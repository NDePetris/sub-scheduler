import {
  affectedResponsibilities,
  calculatePlanPeriodsLost,
  enumerateWeekdaySchoolDates,
  expectedDayType,
  projectedPlanPeriodsLost,
  rankCandidates,
  renderSubPlanMessage,
  shiftSchoolDate,
  validateSplitSegments,
  type CandidateAvailability,
  type SplitSegmentInput,
} from '../../src/domain/planning';
import { HttpError } from '../http';

type DayType = 'A' | 'B';

interface PlanRow {
  id: string;
  date: string;
  day_type: DayType;
  schedule_version_id: string;
  special_schedule_id: string | null;
  status: 'draft' | 'finalized';
  finalized_at: string | null;
  finalized_by: string | null;
  schedule_name: string;
  special_schedule_name: string | null;
  effective_from: string;
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
  sequence: number;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  is_school_sub: number;
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

interface CoverageRow {
  daily_sub_plan_id: string;
  start_time: string;
  end_time: string;
}

interface CountRow {
  count: number;
}

interface CandidateCheck {
  readonly source: 'School Sub' | 'Plan Period' | 'Admin' | 'Manual';
  readonly sourceType: Exclude<CandidateAvailability, 'default'>;
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
}

interface CandidatePreview {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isSchoolSub: boolean;
  readonly availability: CandidateAvailability;
  readonly availabilitySource: string;
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly currentBurden: number;
  readonly proposedBurden: number;
  readonly projectedBurden: number;
  readonly threshold: number;
  readonly windowDays: number;
}

export class PlanningRepository {
  constructor(private readonly db: D1Database) {}

  async ensurePlan(
    date: string,
    requestedDayType: DayType | undefined,
    actorId: string,
  ) {
    const existing = await this.findPlan(date);
    if (existing) {
      if (requestedDayType && requestedDayType !== existing.day_type) {
        await this.changeDayType(existing, requestedDayType, actorId);
      }
      return this.getPlan(date);
    }

    const resolved = await this.resolveSchedule(date);
    const dayType =
      requestedDayType ?? expectedDayType(date, resolved.normal.effective_from);
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
        resolved.normal.id,
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
    const assignmentDtos = assignments.map((assignment) => ({
      id: assignment.id,
      startTime: assignment.start_time,
      endTime: assignment.end_time,
      responsibilityType: assignment.responsibility_type,
      description: assignment.description,
      room: assignment.room_name,
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
    }));
    const assigned = assignmentDtos.filter(
      (assignment) => assignment.status !== 'unresolved',
    ).length;
    const assignedStaffIds = new Set([
      ...assignmentDtos.flatMap((assignment) =>
        assignment.assignedStaff ? [assignment.assignedStaff.id] : [],
      ),
      ...assignmentDtos.flatMap((assignment) =>
        assignment.segments.map((segment) => segment.staffId),
      ),
    ]);
    let workloadWarnings = 0;
    for (const staffId of assignedStaffIds) {
      const person = await this.db
        .prepare(`SELECT is_school_sub FROM staff WHERE id = ?`)
        .bind(staffId)
        .first<{ is_school_sub: number }>();
      if (
        person?.is_school_sub !== 1 &&
        (await this.currentBurden(
          staffId,
          plan.date,
          settings.workload_window_days,
          '',
        )) >= settings.workload_warning_threshold
      ) {
        workloadWarnings += 1;
      }
    }
    return {
      plan: {
        id: plan.id,
        date: plan.date,
        dayType: plan.day_type,
        expectedDayType: expectedDayType(plan.date, plan.effective_from),
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
      statements.push(
        this.db
          .prepare(
            `UPDATE assignments
                SET assigned_staff_id = NULL, resolution_type = NULL,
                    resolution_details_json = NULL, status = 'unresolved',
                    is_default = 0, conflict_explanation = ?, updated_by = ?,
                    override_acknowledged_at = NULL,
                    override_acknowledged_by = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE daily_sub_plan_id = ? AND status = 'assigned'
                AND assigned_staff_id = ?
                AND (? IS NULL OR (start_time < ? AND ? < end_time))`,
          )
          .bind(
            `${staff.display_name} is also absent.`,
            actorId,
            planSeed.plan.id,
            staff.id,
            input.startTime,
            input.endTime,
            input.startTime,
          ),
        this.db
          .prepare(
            `UPDATE assignments
                SET assigned_staff_id = NULL, resolution_type = NULL,
                    resolution_details_json = NULL, status = 'unresolved',
                    is_default = 0, conflict_explanation = ?, updated_by = ?,
                    override_acknowledged_at = NULL,
                    override_acknowledged_by = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              WHERE daily_sub_plan_id = ? AND status = 'assigned'
                AND resolution_type = 'split_coverage'
                AND EXISTS (
                  SELECT 1 FROM assignment_segments invalid_segment
                   WHERE invalid_segment.assignment_id = assignments.id
                     AND invalid_segment.staff_id = ?
                     AND (? IS NULL OR (
                       invalid_segment.start_time < ?
                       AND ? < invalid_segment.end_time
                     ))
                )`,
          )
          .bind(
            `${staff.display_name}, who was providing split coverage, is also absent.`,
            actorId,
            planSeed.plan.id,
            staff.id,
            input.startTime,
            input.endTime,
            input.startTime,
          ),
        this.db
          .prepare(
            `DELETE FROM assignment_segments
              WHERE assignment_id IN (
                SELECT invalid_segment.assignment_id
                  FROM assignment_segments invalid_segment
                  JOIN assignments parent
                    ON parent.id = invalid_segment.assignment_id
                 WHERE parent.daily_sub_plan_id = ?
                   AND invalid_segment.staff_id = ?
                   AND (? IS NULL OR (
                     invalid_segment.start_time < ?
                     AND ? < invalid_segment.end_time
                   ))
              )`,
          )
          .bind(
            planSeed.plan.id,
            staff.id,
            input.startTime,
            input.endTime,
            input.startTime,
          ),
      );
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
        statements.push(
          this.db
            .prepare(
              `INSERT INTO assignments (
                 id, daily_sub_plan_id, absence_id, source_schedule_entry_id,
                 source_special_schedule_entry_id, start_time, end_time,
                 responsibility_type, description, room_id, default_action_id,
                 assigned_staff_id, resolution_type, resolution_details_json,
                 status, is_default, conflict_explanation, updated_by
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              responsibilityType(source.activity_type),
              source.description,
              source.room_id,
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
  ): Promise<{ assignmentId: string; candidates: CandidatePreview[] }> {
    const assignment = await this.assignmentById(assignmentId);
    const plan = await this.planById(assignment.daily_sub_plan_id);
    const settings = await this.settings();
    const staff = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub FROM staff
          WHERE is_active = 1 AND can_sub = 1 AND id <> ?
          ORDER BY display_name, id`,
      )
      .bind(assignment.absent_staff_id)
      .all<StaffRow>();
    const previews: CandidatePreview[] = [];
    for (const person of staff.results) {
      const check = await this.candidateCheck(
        plan,
        person,
        assignment.start_time,
        assignment.end_time,
        assignment.id,
      );
      const currentBurden = person.is_school_sub
        ? 0
        : await this.currentBurden(
            person.id,
            plan.date,
            settings.workload_window_days,
            assignment.id,
          );
      const proposedBurden = person.is_school_sub
        ? 0
        : calculatePlanPeriodsLost(
            (await this.entriesForPlan(plan))
              .filter(
                (entry) =>
                  entry.staff_id === person.id &&
                  entry.activity_type === 'plan' &&
                  (entry.day_type === 'ALL' ||
                    entry.day_type === plan.day_type),
              )
              .map((entry) => ({
                startTime: entry.start_time,
                endTime: entry.end_time,
              })),
            [
              {
                startTime: assignment.start_time,
                endTime: assignment.end_time,
              },
            ],
          );
      const projectedBurden = projectedPlanPeriodsLost(
        currentBurden,
        proposedBurden,
      );
      const isValidDefault =
        assignment.default_staff_id === person.id &&
        check.conflicts.length === 0;
      previews.push({
        id: person.id,
        displayName: person.display_name,
        role: person.role,
        isSchoolSub: person.is_school_sub === 1,
        availability: isValidDefault ? 'default' : check.sourceType,
        availabilitySource: check.source,
        conflicts: check.conflicts,
        warnings: [
          ...check.warnings,
          ...(projectedBurden >= settings.workload_warning_threshold
            ? [
                `Projected workload ${projectedBurden.toFixed(2)} reaches the ${settings.workload_warning_threshold.toFixed(2)} threshold.`,
              ]
            : []),
        ],
        currentBurden,
        proposedBurden,
        projectedBurden,
        threshold: settings.workload_warning_threshold,
        windowDays: settings.workload_window_days,
      });
    }
    return {
      assignmentId,
      candidates: rankCandidates(previews),
    };
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
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = ?, resolution_type = ?, resolution_details_json = NULL,
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
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = 'intentional_uncovered',
                  resolution_details_json = NULL, status = 'intentionally_uncovered',
                  is_default = ?,
                  conflict_explanation = NULL, override_acknowledged_at = ?,
                  override_acknowledged_by = ?, updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
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

  async structuredResolution(
    assignmentId: string,
    resolutionType:
      | 'redistribution'
      | 'switch_groups'
      | 'combine_class'
      | 'move_room'
      | 'manual_override',
    details: Record<string, unknown>,
    actorId: string,
  ) {
    const assignment = await this.assignmentById(assignmentId);
    await this.assertDraft(assignment.daily_sub_plan_id);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM assignment_segments WHERE assignment_id = ?`)
        .bind(assignmentId),
      this.db
        .prepare(
          `UPDATE assignments
              SET assigned_staff_id = NULL, resolution_type = ?, resolution_details_json = ?,
                  status = 'assigned', is_default = 0, conflict_explanation = NULL,
                  override_acknowledged_at = NULL, override_acknowledged_by = NULL,
                  updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          resolutionType,
          JSON.stringify(details),
          actorId,
          now,
          assignmentId,
        ),
    ]);
    return this.getPlan(
      (await this.planById(assignment.daily_sub_plan_id)).date,
    );
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
        `SELECT id, display_name, role, is_school_sub FROM staff
          WHERE is_active = 1 AND can_sub = 1`,
      )
      .all<StaffRow>();
    const staffById = new Map(staffRows.results.map((row) => [row.id, row]));
    const conflicts: string[] = [];
    for (const segment of segments) {
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
                  resolution_details_json = NULL, status = 'assigned', is_default = 0,
                  conflict_explanation = NULL, override_acknowledged_at = ?,
                  override_acknowledged_by = ?, updated_by = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
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
  ) {
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
        `SELECT id, display_name, role, is_school_sub FROM staff
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
      null,
    );
    if (check.conflicts.length > 0 || check.sourceType === 'manual') {
      const reason =
        check.conflicts[0] ??
        `${person.display_name} has no PLAN/Admin availability.`;
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
    const conflicts: string[] = [];
    const warnings: string[] = [];
    const absence = await this.db
      .prepare(
        `SELECT id, start_time, end_time FROM absences
          WHERE staff_id = ? AND start_date <= ? AND end_date >= ?`,
      )
      .bind(staff.id, plan.date, plan.date)
      .all<{
        id: string;
        start_time: string | null;
        end_time: string | null;
      }>();
    if (
      absence.results.some((item) =>
        timeRangesOverlap(item.start_time, item.end_time, startTime, endTime),
      )
    ) {
      conflicts.push('This staff member is absent during the Assignment.');
    }

    const directConflict = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM assignments a
          WHERE a.daily_sub_plan_id = ? AND a.assigned_staff_id = ?
            AND a.status = 'assigned' AND a.id <> COALESCE(?, '')
            AND a.start_time < ? AND ? < a.end_time`,
      )
      .bind(plan.id, staff.id, excludeAssignmentId, endTime, startTime)
      .first<CountRow>();
    const segmentConflict = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM assignment_segments s
           JOIN assignments a ON a.id = s.assignment_id
          WHERE a.daily_sub_plan_id = ? AND s.staff_id = ?
            AND a.id <> COALESCE(?, '')
            AND s.start_time < ? AND ? < s.end_time`,
      )
      .bind(plan.id, staff.id, excludeAssignmentId, endTime, startTime)
      .first<CountRow>();
    if ((directConflict?.count ?? 0) > 0 || (segmentConflict?.count ?? 0) > 0) {
      conflicts.push('This staff member already has overlapping sub coverage.');
    }

    const entries = (await this.entriesForPlan(plan)).filter(
      (entry) =>
        entry.staff_id === staff.id &&
        (entry.day_type === 'ALL' || entry.day_type === plan.day_type) &&
        entry.start_time < endTime &&
        startTime < entry.end_time,
    );
    if (staff.is_school_sub === 1) {
      const configuredAvailability = coversInterval(
        entries.filter((entry) => entry.activity_type === 'other'),
        startTime,
        endTime,
      );
      if (configuredAvailability) {
        return {
          source: 'School Sub',
          sourceType: 'school_sub',
          conflicts,
          warnings,
        };
      }
      warnings.push(
        'No configured School Sub availability covers the full Assignment.',
      );
      return { source: 'Manual', sourceType: 'manual', conflicts, warnings };
    }
    const blocking = entries.filter(
      (entry) =>
        entry.activity_type !== 'plan' && entry.activity_type !== 'admin',
    );
    if (blocking.length > 0) {
      conflicts.push(
        `Scheduled conflict: ${blocking.map((entry) => entry.description).join(', ')}.`,
      );
    }
    const planCoverage = coversInterval(
      entries.filter((entry) => entry.activity_type === 'plan'),
      startTime,
      endTime,
    );
    if (planCoverage)
      return { source: 'Plan Period', sourceType: 'plan', conflicts, warnings };
    const adminCoverage = coversInterval(
      entries.filter((entry) => entry.activity_type === 'admin'),
      startTime,
      endTime,
    );
    if (adminCoverage)
      return { source: 'Admin', sourceType: 'admin', conflicts, warnings };
    warnings.push(
      'No automatic PLAN/Admin availability covers the full Assignment.',
    );
    return { source: 'Manual', sourceType: 'manual', conflicts, warnings };
  }

  private async currentBurden(
    staffId: string,
    date: string,
    windowDays: number,
    excludeAssignmentId: string,
  ): Promise<number> {
    const startDate = shiftSchoolDate(date, -(windowDays - 1));
    const coverage = await this.db
      .prepare(
        `SELECT a.daily_sub_plan_id, a.start_time, a.end_time
           FROM assignments a
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
          WHERE a.assigned_staff_id = ? AND a.status = 'assigned'
            AND a.id <> ? AND p.date BETWEEN ? AND ?
          UNION ALL
         SELECT a.daily_sub_plan_id, s.start_time, s.end_time
           FROM assignment_segments s
           JOIN assignments a ON a.id = s.assignment_id
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
          WHERE s.staff_id = ? AND a.id <> ? AND p.date BETWEEN ? AND ?`,
      )
      .bind(
        staffId,
        excludeAssignmentId,
        startDate,
        date,
        staffId,
        excludeAssignmentId,
        startDate,
        date,
      )
      .all<CoverageRow>();
    let total = 0;
    for (const item of coverage.results) {
      const plan = await this.planById(item.daily_sub_plan_id);
      const blocks = (await this.entriesForPlan(plan))
        .filter(
          (entry) =>
            entry.staff_id === staffId &&
            entry.activity_type === 'plan' &&
            (entry.day_type === 'ALL' || entry.day_type === plan.day_type),
        )
        .map((entry) => ({
          startTime: entry.start_time,
          endTime: entry.end_time,
        }));
      total += calculatePlanPeriodsLost(blocks, [
        { startTime: item.start_time, endTime: item.end_time },
      ]);
    }
    return round(total);
  }

  private async planSeed(
    date: string,
    actorId: string,
  ): Promise<{
    plan: PlanRow;
    insert: D1PreparedStatement | null;
  }> {
    const existing = await this.findPlan(date);
    if (existing) return { plan: existing, insert: null };
    const resolved = await this.resolveSchedule(date);
    const planId = crypto.randomUUID();
    const dayType = expectedDayType(date, resolved.normal.effective_from);
    return {
      plan: {
        id: planId,
        date,
        day_type: dayType,
        schedule_version_id: resolved.normal.id,
        special_schedule_id: resolved.special?.id ?? null,
        status: 'draft',
        finalized_at: null,
        finalized_by: null,
        schedule_name: resolved.normal.name,
        special_schedule_name: resolved.special?.name ?? null,
        effective_from: resolved.normal.effective_from,
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
          resolved.normal.id,
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
      throw new HttpError(
        409,
        'schedule_not_found',
        'No active normal Schedule Version applies to this date.',
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

  private async findPlan(date: string): Promise<PlanRow | null> {
    return this.db
      .prepare(
        `SELECT p.id, p.date, p.day_type, p.schedule_version_id,
                p.special_schedule_id, p.status, p.finalized_at, p.finalized_by,
                sv.name AS schedule_name, ss.name AS special_schedule_name,
                sv.effective_from
           FROM daily_sub_plans p
           JOIN schedule_versions sv ON sv.id = p.schedule_version_id
      LEFT JOIN special_schedules ss ON ss.id = p.special_schedule_id
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
                sv.effective_from
           FROM daily_sub_plans p
           JOIN schedule_versions sv ON sv.id = p.schedule_version_id
      LEFT JOIN special_schedules ss ON ss.id = p.special_schedule_id
          WHERE p.id = ?`,
      )
      .bind(id)
      .first<PlanRow>();
    if (!row) throw new HttpError(404, 'plan_not_found', 'Sub Plan not found.');
    return row;
  }

  private async entriesForPlan(plan: PlanRow): Promise<EntryRow[]> {
    const table = plan.special_schedule_id
      ? 'special_schedule_entries'
      : 'schedule_entries';
    const foreignKey = plan.special_schedule_id
      ? 'special_schedule_id'
      : 'schedule_version_id';
    const sourceId = plan.special_schedule_id ?? plan.schedule_version_id;
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
        `SELECT a.id, a.daily_sub_plan_id, a.absence_id, a.start_time, a.end_time,
                a.responsibility_type, a.description, a.room_id, r.name AS room_name,
                a.default_action_id, da.action_type AS default_action_type,
                da.assigned_staff_id AS default_staff_id,
                ds.display_name AS default_staff_name,
                da.details_json AS default_details_json,
                a.assigned_staff_id, assigned.display_name AS assigned_staff_name,
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
        `SELECT a.id, a.daily_sub_plan_id, a.absence_id, a.start_time, a.end_time,
                a.responsibility_type, a.description, a.room_id, r.name AS room_name,
                a.default_action_id, da.action_type AS default_action_type,
                da.assigned_staff_id AS default_staff_id,
                ds.display_name AS default_staff_name,
                da.details_json AS default_details_json,
                a.assigned_staff_id, assigned.display_name AS assigned_staff_name,
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
                st.display_name AS staff_name, s.sequence
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

function responsibilityType(
  activityType: string,
): 'instruction' | 'duty' | 'after_school' | 'other' {
  if (activityType === 'instruction') return 'instruction';
  if (activityType === 'duty' || activityType === 'lunch') return 'duty';
  if (activityType === 'after_school') return 'after_school';
  return 'other';
}

function defaultResolutionType(actionType: string): string | null {
  const values: Record<string, string> = {
    teacher_covers: 'teacher_cover',
    redistribute_class: 'redistribution',
    switch_groups: 'switch_groups',
    combine_class: 'combine_class',
    move_room: 'move_room',
    cover_duty: 'duty_coverage',
  };
  return values[actionType] ?? null;
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

function coversInterval(
  entries: readonly Pick<EntryRow, 'start_time' | 'end_time'>[],
  startTime: string,
  endTime: string,
): boolean {
  const ordered = [...entries].sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
  let cursor = startTime;
  for (const entry of ordered) {
    if (entry.end_time <= cursor || entry.start_time > cursor) continue;
    cursor = entry.end_time > cursor ? entry.end_time : cursor;
    if (cursor >= endTime) return true;
  }
  return false;
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

function resolutionLabel(assignment: {
  readonly assignedStaff: { displayName: string } | null;
  readonly status: string;
  readonly resolutionType: string | null;
  readonly segments: readonly {
    startTime: string;
    endTime: string;
    staffName: string;
  }[];
  readonly resolutionDetails: unknown;
}): string {
  if (assignment.status === 'intentionally_uncovered')
    return 'Intentionally Uncovered';
  if (assignment.segments.length > 0) {
    return assignment.segments
      .map(
        (segment) =>
          `${segment.staffName} ${segment.startTime}–${segment.endTime}`,
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

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
