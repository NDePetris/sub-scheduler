import { schoolDateInTimezone } from '../../src/domain/calendar';
import {
  projectTeacherPerformance,
  type ReportingAbsence,
  type ReportingCalendarDate,
  type ReportingCoverageInterval,
  type ReportingStaff,
} from '../../src/domain/reporting';

interface SettingsRow {
  school_timezone: string;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  is_active: number;
  is_school_sub: number;
}

interface CalendarRow {
  date: string;
  is_school_day: number;
  is_blackout_day: number;
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
          `SELECT id, display_name, role, is_active, is_school_sub FROM staff`,
        )
        .all<StaffRow>(),
      this.db
        .prepare(
          `SELECT date, is_school_day, is_blackout_day
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
}

function reportingStaff(row: StaffRow): ReportingStaff {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active === 1,
    isSchoolSub: row.is_school_sub === 1,
  };
}

function reportingCalendarDate(row: CalendarRow): ReportingCalendarDate {
  return {
    date: row.date,
    isSchoolDay: row.is_school_day === 1,
    isBlackoutDay: row.is_blackout_day === 1,
  };
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
