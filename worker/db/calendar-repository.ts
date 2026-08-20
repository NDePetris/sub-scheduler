import { parseSchoolDate } from '../../src/domain/calendar';
import { HttpError } from '../http';

export interface CalendarDateInput {
  readonly date: string;
  readonly expectedDayType: 'A' | 'B' | null;
  readonly isSchoolDay: boolean;
  readonly isBlackoutDay: boolean;
  readonly expectsSpecialSchedule: boolean;
  readonly label: string | null;
}

interface CalendarRow {
  date: string;
  expected_day_type: 'A' | 'B' | null;
  is_school_day: number;
  is_blackout_day: number;
  expects_special_schedule: number;
  label: string | null;
}

export class CalendarRepository {
  constructor(private readonly db: D1Database) {}

  async list(start?: string, end?: string) {
    const result =
      start && end
        ? await this.db
            .prepare(
              `SELECT * FROM school_calendar_dates WHERE date >= ? AND date <= ? ORDER BY date`,
            )
            .bind(start, end)
            .all<CalendarRow>()
        : await this.db
            .prepare(`SELECT * FROM school_calendar_dates ORDER BY date`)
            .all<CalendarRow>();
    return result.results.map(calendarDto);
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
      if (!record.isSchoolDay && record.expectedDayType) {
        throw new HttpError(
          400,
          'non_school_day_type',
          'A non-school date cannot have an expected A/B designation.',
        );
      }
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

function calendarDto(row: CalendarRow): CalendarDateInput {
  return {
    date: row.date,
    expectedDayType: row.expected_day_type,
    isSchoolDay: row.is_school_day === 1,
    isBlackoutDay: row.is_blackout_day === 1,
    expectsSpecialSchedule: row.expects_special_schedule === 1,
    label: row.label,
  };
}
