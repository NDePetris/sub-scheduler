import {
  calendarConfigurationErrors,
  parseSchoolDate,
  type CalendarDateConfiguration,
  type CalendarDateConfigurationInput,
} from '../../src/domain/calendar';
import { HttpError } from '../http';

export type CalendarDateInput = CalendarDateConfigurationInput;

interface CalendarRow {
  date: string;
  expected_day_type: 'A' | 'B' | null;
  is_school_day: number;
  is_blackout_day: number;
  expects_special_schedule: number;
  label: string | null;
  source_type: string;
  imported_by: string | null;
  imported_at: string;
  updated_by: string | null;
  updated_at: string | null;
  special_schedule_id: string | null;
  special_schedule_name: string | null;
  special_schedule_status: 'draft' | 'active' | 'retired' | null;
}

export class CalendarRepository {
  constructor(private readonly db: D1Database) {}

  async listRange(
    start: string,
    end: string,
  ): Promise<CalendarDateConfiguration[]> {
    const result = await this.db
      .prepare(
        `SELECT c.*, ss.id AS special_schedule_id, ss.name AS special_schedule_name,
                ss.status AS special_schedule_status
           FROM school_calendar_dates c
      LEFT JOIN special_schedules ss ON ss.date = c.date
          WHERE c.date >= ? AND c.date <= ?
          ORDER BY c.date`,
      )
      .bind(start, end)
      .all<CalendarRow>();
    return result.results.map(calendarDto);
  }

  /** Compatibility read for the legacy bulk calendar endpoint. */
  async list(start?: string, end?: string) {
    if (start && end) return this.listRange(start, end);
    const result = await this.db
      .prepare(
        `SELECT c.*, ss.id AS special_schedule_id, ss.name AS special_schedule_name,
                ss.status AS special_schedule_status
           FROM school_calendar_dates c
      LEFT JOIN special_schedules ss ON ss.date = c.date
          ORDER BY c.date`,
      )
      .all<CalendarRow>();
    return result.results.map(calendarDto);
  }

  async upsertDate(
    record: CalendarDateInput,
    actorId: string,
  ): Promise<CalendarDateConfiguration> {
    validateCalendarDate(record);
    await this.db
      .prepare(
        `INSERT INTO school_calendar_dates (
           date, expected_day_type, is_school_day, is_blackout_day,
           expects_special_schedule, label, source_type, imported_by,
           updated_by, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'manual_admin', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(date) DO UPDATE SET
           expected_day_type = excluded.expected_day_type,
           is_school_day = excluded.is_school_day,
           is_blackout_day = excluded.is_blackout_day,
           expects_special_schedule = excluded.expects_special_schedule,
           label = excluded.label,
           source_type = excluded.source_type,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`,
      )
      .bind(
        record.date,
        record.expectedDayType,
        Number(record.isSchoolDay),
        Number(record.isBlackoutDay),
        Number(record.expectsSpecialSchedule),
        cleanedLabel(record.label),
        actorId,
        actorId,
      )
      .run();
    const saved = await this.listRange(record.date, record.date);
    return saved[0]!;
  }

  async deleteDate(date: string): Promise<void> {
    parseSchoolDate(date);
    await this.db
      .prepare(`DELETE FROM school_calendar_dates WHERE date = ?`)
      .bind(date)
      .run();
  }

  async replace(records: readonly CalendarDateInput[], actorId: string) {
    const dates = new Set<string>();
    for (const record of records) {
      parseSchoolDate(record.date);
      if (dates.has(record.date)) {
        throw new HttpError(
          400,
          'duplicate_calendar_date',
          `Calendar import contains ${record.date} more than once.`,
        );
      }
      dates.add(record.date);
      validateCalendarDate(record);
    }
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`DELETE FROM school_calendar_dates`),
    ];
    for (const record of records) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO school_calendar_dates (date, expected_day_type, is_school_day, is_blackout_day, expects_special_schedule, label, source_type, imported_by)
         VALUES (?, ?, ?, ?, ?, ?, 'manual_import', ?)`,
          )
          .bind(
            record.date,
            record.expectedDayType,
            Number(record.isSchoolDay),
            Number(record.isBlackoutDay),
            Number(record.expectsSpecialSchedule),
            record.label?.trim() || null,
            actorId,
          ),
      );
    }
    await this.db.batch(statements);
    return this.list();
  }
}

function validateCalendarDate(record: CalendarDateInput): void {
  parseSchoolDate(record.date);
  const errors = calendarConfigurationErrors(record);
  if (errors.length > 0) {
    throw new HttpError(400, 'invalid_calendar_configuration', errors[0]!);
  }
}

function cleanedLabel(label: string | null): string | null {
  return label?.trim() || null;
}

function calendarDto(row: CalendarRow): CalendarDateConfiguration {
  return {
    date: row.date,
    expectedDayType: row.expected_day_type,
    isSchoolDay: row.is_school_day === 1,
    isBlackoutDay: row.is_blackout_day === 1,
    expectsSpecialSchedule: row.expects_special_schedule === 1,
    label: row.label,
    sourceType: row.source_type,
    updatedAt: row.updated_at ?? row.imported_at,
    updatedBy: row.updated_by ?? row.imported_by,
    specialSchedule: row.special_schedule_id
      ? {
          id: row.special_schedule_id,
          name: row.special_schedule_name ?? '',
          status: row.special_schedule_status ?? 'draft',
        }
      : null,
    specialScheduleExpectedWarning:
      row.expects_special_schedule === 1 &&
      row.special_schedule_status !== 'active',
  };
}
