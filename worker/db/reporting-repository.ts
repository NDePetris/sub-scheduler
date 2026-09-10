import { schoolDateInTimezone } from '../../src/domain/calendar';
import {
  projectTeacherPerformance,
  projectTeacherPerformanceDetail,
  type ReportingAbsence,
  type ReportingCalendarDate,
  type ReportingCoverageFact,
  type ReportingCoverageInterval,
  type ReportingScheduleEntry,
  type ReportingStaff,
} from '../../src/domain/reporting';
import { HttpError } from '../http';

interface SettingsRow {
  school_timezone: string;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  is_active: number;
  is_school_sub: number;
  standard_period_minutes: number | null;
}

interface CalendarRow {
  date: string;
  is_school_day: number;
  is_blackout_day: number;
  label: string | null;
}

interface AbsenceRow {
  staff_id: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
}

interface CoverageRow {
  staff_id: string;
  date: string;
  start_time: string;
  end_time: string;
}

interface CoverageFactRow extends CoverageRow {
  assignment_id: string;
  segment_id: string | null;
  day_type: 'A' | 'B';
  schedule_version_id: string | null;
  special_schedule_id: string | null;
  responsibility_type: string;
  description: string;
  absent_staff_id: string;
  absent_staff_name: string;
  resolution_type: string | null;
}

interface ScheduleEntryRow {
  source_type: 'normal' | 'special';
  source_id: string;
  staff_id: string;
  day_type: 'A' | 'B' | 'ALL';
  start_time: string;
  end_time: string;
  activity_type: string;
}

export class ReportingRepository {
  constructor(private readonly db: D1Database) {}

  async teacherPerformance(
    startDate: string,
    endDate: string,
    now = new Date(),
  ) {
    const settings = await this.db
      .prepare(
        `SELECT school_timezone FROM application_settings WHERE id = 'school'`,
      )
      .first<SettingsRow>();
    const today = schoolDateInTimezone(now, settings?.school_timezone ?? 'UTC');
    const [staff, calendarDates, absences, coverage] = await Promise.all([
      this.db
        .prepare(
          `SELECT id, display_name, role, is_active, is_school_sub, standard_period_minutes FROM staff`,
        )
        .all<StaffRow>(),
      this.db
        .prepare(
          `SELECT date, is_school_day, is_blackout_day, label
             FROM school_calendar_dates
            WHERE date BETWEEN ? AND ?`,
        )
        .bind(startDate, endDate)
        .all<CalendarRow>(),
      this.db
        .prepare(
          `SELECT staff_id, start_date, end_date, start_time, end_time
             FROM absences
            WHERE start_date <= ? AND end_date >= ?`,
        )
        .bind(endDate, startDate)
        .all<AbsenceRow>(),
      this.coverageIntervals(startDate, endDate),
    ]);
    const projection = projectTeacherPerformance({
      startDate,
      endDate,
      staff: staff.results.map(reportingStaff),
      calendarDates: calendarDates.results.map(reportingCalendarDate),
      absences: absences.results.map(reportingAbsence),
      coverage,
    });
    return {
      range: {
        startDate,
        endDate,
        today,
        includesFutureDates: endDate > today,
      },
      ...projection,
    };
  }

  async teacherPerformanceDetail(
    staffId: string,
    startDate: string,
    endDate: string,
    now = new Date(),
  ) {
    const staff = await this.db
      .prepare(
        `SELECT id, display_name, role, is_active, is_school_sub, standard_period_minutes
           FROM staff WHERE id = ?`,
      )
      .bind(staffId)
      .first<StaffRow>();
    if (!staff)
      throw new HttpError(
        404,
        'staff_not_found',
        'The requested staff member was not found.',
      );
    const teacher = reportingStaff(staff);
    if (!isTeacher(teacher)) {
      throw new HttpError(
        400,
        'not_teacher',
        'Teacher performance reporting is available only for Teachers.',
      );
    }
    if (teacher.isSchoolSub) {
      throw new HttpError(
        400,
        'school_sub_not_reportable',
        'The designated School Sub does not have teacher performance reporting.',
      );
    }
    const settings = await this.db
      .prepare(
        `SELECT school_timezone FROM application_settings WHERE id = 'school'`,
      )
      .first<SettingsRow>();
    const [calendarDates, absences, coverage] = await Promise.all([
      this.db
        .prepare(
          `SELECT date, is_school_day, is_blackout_day, label
             FROM school_calendar_dates WHERE date BETWEEN ? AND ?`,
        )
        .bind(startDate, endDate)
        .all<CalendarRow>(),
      this.db
        .prepare(
          `SELECT staff_id, start_date, end_date, start_time, end_time
             FROM absences WHERE staff_id = ? AND start_date <= ? AND end_date >= ?`,
        )
        .bind(staffId, endDate, startDate)
        .all<AbsenceRow>(),
      this.coverageFacts(staffId, startDate, endDate),
    ]);
    const normalSourceIds = [
      ...new Set(
        coverage.flatMap((fact) =>
          fact.scheduleVersionId ? [fact.scheduleVersionId] : [],
        ),
      ),
    ];
    const specialSourceIds = [
      ...new Set(
        coverage.flatMap((fact) =>
          fact.specialScheduleId ? [fact.specialScheduleId] : [],
        ),
      ),
    ];
    const scheduleEntries = await this.scheduleEntries(
      staffId,
      normalSourceIds,
      specialSourceIds,
    );
    const projection = projectTeacherPerformanceDetail({
      startDate,
      endDate,
      teacher,
      calendarDates: calendarDates.results.map(reportingCalendarDate),
      absences: absences.results.map(reportingAbsence),
      coverage,
      scheduleEntries,
    });
    const today = schoolDateInTimezone(now, settings?.school_timezone ?? 'UTC');
    return {
      range: {
        startDate,
        endDate,
        today,
        includesFutureDates: endDate > today,
      },
      ...projection,
    };
  }

  private async coverageIntervals(startDate: string, endDate: string) {
    const result = await this.db
      .prepare(
        `SELECT a.assigned_staff_id AS staff_id, p.date, a.start_time, a.end_time
           FROM assignments a
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff receiver ON receiver.id = a.assigned_staff_id
          WHERE p.status = 'finalized' AND p.date BETWEEN ? AND ?
            AND a.status = 'assigned' AND a.counts_toward_workload = 1
            AND a.assigned_staff_id IS NOT NULL AND receiver.is_school_sub = 0
            AND NOT EXISTS (
              SELECT 1 FROM assignment_segments segment
               WHERE segment.assignment_id = a.id
            )
          UNION ALL
         SELECT segment.staff_id, p.date, segment.start_time, segment.end_time
           FROM assignment_segments segment
           JOIN assignments a ON a.id = segment.assignment_id
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff receiver ON receiver.id = segment.staff_id
          WHERE p.status = 'finalized' AND p.date BETWEEN ? AND ?
            AND a.status = 'assigned' AND a.counts_toward_workload = 1
            AND receiver.is_school_sub = 0`,
      )
      .bind(startDate, endDate, startDate, endDate)
      .all<CoverageRow>();
    return result.results.map(reportingCoverageInterval);
  }

  private async coverageFacts(
    staffId: string,
    startDate: string,
    endDate: string,
  ) {
    const result = await this.db
      .prepare(
        `SELECT a.assigned_staff_id AS staff_id, p.date, a.start_time, a.end_time,
                a.id AS assignment_id, NULL AS segment_id, p.day_type,
                p.schedule_version_id, p.special_schedule_id, a.responsibility_type,
                a.description, absent.id AS absent_staff_id,
                absent.display_name AS absent_staff_name, a.resolution_type
           FROM assignments a
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff receiver ON receiver.id = a.assigned_staff_id
           JOIN absences absence ON absence.id = a.absence_id
           JOIN staff absent ON absent.id = absence.staff_id
          WHERE p.status = 'finalized' AND p.date BETWEEN ? AND ?
            AND a.status = 'assigned' AND a.counts_toward_workload = 1
            AND a.assigned_staff_id = ? AND receiver.is_school_sub = 0
            AND NOT EXISTS (SELECT 1 FROM assignment_segments segment WHERE segment.assignment_id = a.id)
          UNION ALL
         SELECT segment.staff_id, p.date, segment.start_time, segment.end_time,
                a.id, segment.id, p.day_type, p.schedule_version_id,
                p.special_schedule_id, a.responsibility_type, a.description,
                absent.id, absent.display_name, a.resolution_type
           FROM assignment_segments segment
           JOIN assignments a ON a.id = segment.assignment_id
           JOIN daily_sub_plans p ON p.id = a.daily_sub_plan_id
           JOIN staff receiver ON receiver.id = segment.staff_id
           JOIN absences absence ON absence.id = a.absence_id
           JOIN staff absent ON absent.id = absence.staff_id
          WHERE p.status = 'finalized' AND p.date BETWEEN ? AND ?
            AND a.status = 'assigned' AND a.counts_toward_workload = 1
            AND segment.staff_id = ? AND receiver.is_school_sub = 0`,
      )
      .bind(startDate, endDate, staffId, startDate, endDate, staffId)
      .all<CoverageFactRow>();
    return result.results.map(reportingCoverageFact);
  }

  private async scheduleEntries(
    staffId: string,
    normalSourceIds: readonly string[],
    specialSourceIds: readonly string[],
  ): Promise<ReportingScheduleEntry[]> {
    const queries: string[] = [];
    const bindings: string[] = [];
    if (normalSourceIds.length > 0) {
      queries.push(
        `SELECT 'normal' AS source_type, schedule_version_id AS source_id,
                staff_id, day_type, start_time, end_time, activity_type
           FROM schedule_entries WHERE staff_id = ? AND schedule_version_id IN (${normalSourceIds.map(() => '?').join(',')})`,
      );
      bindings.push(staffId, ...normalSourceIds);
    }
    if (specialSourceIds.length > 0) {
      queries.push(
        `SELECT 'special' AS source_type, special_schedule_id AS source_id,
                staff_id, day_type, start_time, end_time, activity_type
           FROM special_schedule_entries WHERE staff_id = ? AND special_schedule_id IN (${specialSourceIds.map(() => '?').join(',')})`,
      );
      bindings.push(staffId, ...specialSourceIds);
    }
    if (queries.length === 0) return [];
    const result = await this.db
      .prepare(queries.join(' UNION ALL '))
      .bind(...bindings)
      .all<ScheduleEntryRow>();
    return result.results.map(reportingScheduleEntry);
  }
}

function reportingStaff(row: StaffRow): ReportingStaff {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active === 1,
    isSchoolSub: row.is_school_sub === 1,
    standardPeriodMinutes: row.standard_period_minutes,
  };
}

function reportingCalendarDate(row: CalendarRow): ReportingCalendarDate {
  return {
    date: row.date,
    isSchoolDay: row.is_school_day === 1,
    isBlackoutDay: row.is_blackout_day === 1,
    label: row.label,
  };
}

function reportingCoverageFact(row: CoverageFactRow): ReportingCoverageFact {
  return {
    ...reportingCoverageInterval(row),
    assignmentId: row.assignment_id,
    segmentId: row.segment_id,
    dayType: row.day_type,
    scheduleVersionId: row.schedule_version_id,
    specialScheduleId: row.special_schedule_id,
    responsibilityType: row.responsibility_type,
    description: row.description,
    absentStaffId: row.absent_staff_id,
    absentStaffName: row.absent_staff_name,
    resolutionType: row.resolution_type,
  };
}

function reportingScheduleEntry(row: ScheduleEntryRow): ReportingScheduleEntry {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    staffId: row.staff_id,
    dayType: row.day_type,
    startTime: row.start_time,
    endTime: row.end_time,
    activityType: row.activity_type,
  };
}

function isTeacher(staff: ReportingStaff): boolean {
  return staff.role.trim().toLocaleLowerCase('en-US') === 'teacher';
}

function reportingAbsence(row: AbsenceRow): ReportingAbsence {
  return {
    staffId: row.staff_id,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function reportingCoverageInterval(
  row: CoverageRow,
): ReportingCoverageInterval {
  return {
    staffId: row.staff_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}
