interface SettingsRow {
  school_name: string;
  school_logo_url: string | null;
  school_timezone: string;
}

interface CountRow {
  count: number;
}

interface ActiveScheduleRow {
  id: string;
  name: string;
  effective_from: string;
  entry_count: number;
}

interface StaffRow {
  id: string;
  display_name: string;
  role: string;
  is_school_sub: number;
}

interface DayTypeCountRow {
  a_count: number;
  b_count: number;
  shared_count: number;
}

interface RoomRow {
  id: string;
  name: string;
}

export interface StaffSummary {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly isSchoolSub: boolean;
}

export class ApplicationRepository {
  constructor(private readonly db: D1Database) {}

  async checkConnection(): Promise<void> {
    await this.db.prepare('SELECT 1').first();
  }

  async getBootstrapSummary() {
    const settings = await this.db
      .prepare(
        `SELECT school_name, school_logo_url, school_timezone
           FROM application_settings
          WHERE id = 'school'`,
      )
      .first<SettingsRow>();

    if (!settings)
      throw new Error('Application settings have not been seeded.');

    const [staffCount, roomCount, schedule, schoolSub] = await Promise.all([
      this.db
        .prepare('SELECT COUNT(*) AS count FROM staff WHERE is_active = 1')
        .first<CountRow>(),
      this.db
        .prepare('SELECT COUNT(*) AS count FROM rooms WHERE is_active = 1')
        .first<CountRow>(),
      this.db
        .prepare(
          `SELECT sv.id, sv.name, sv.effective_from, COUNT(se.id) AS entry_count
             FROM schedule_versions sv
        LEFT JOIN schedule_entries se ON se.schedule_version_id = sv.id
            WHERE sv.status = 'active'
         GROUP BY sv.id, sv.name, sv.effective_from
         ORDER BY sv.effective_from DESC
            LIMIT 1`,
        )
        .first<ActiveScheduleRow>(),
      this.db
        .prepare(
          `SELECT id, display_name, role, is_school_sub
             FROM staff
            WHERE is_active = 1 AND is_school_sub = 1
            LIMIT 1`,
        )
        .first<StaffRow>(),
    ]);

    const dayTypeCounts = schedule
      ? await this.db
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN day_type = 'A' THEN 1 ELSE 0 END), 0) AS a_count,
               COALESCE(SUM(CASE WHEN day_type = 'B' THEN 1 ELSE 0 END), 0) AS b_count,
               COALESCE(SUM(CASE WHEN day_type = 'ALL' THEN 1 ELSE 0 END), 0) AS shared_count
               FROM schedule_entries
              WHERE schedule_version_id = ?`,
          )
          .bind(schedule.id)
          .first<DayTypeCountRow>()
      : null;

    return {
      school: {
        name: settings.school_name,
        logoUrl: settings.school_logo_url,
        timezone: settings.school_timezone,
      },
      summary: {
        activeStaff: staffCount?.count ?? 0,
        activeRooms: roomCount?.count ?? 0,
        activeSchedule: schedule
          ? {
              id: schedule.id,
              name: schedule.name,
              effectiveFrom: schedule.effective_from,
              entryCount: schedule.entry_count,
            }
          : null,
        schoolSub: schoolSub ? toStaffSummary(schoolSub) : null,
        dayTypeCounts: {
          A: dayTypeCounts?.a_count ?? 0,
          B: dayTypeCounts?.b_count ?? 0,
          shared: dayTypeCounts?.shared_count ?? 0,
        },
      },
    };
  }

  async listActiveStaff(): Promise<StaffSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT id, display_name, role, is_school_sub
           FROM staff
          WHERE is_active = 1
          ORDER BY is_school_sub DESC, display_name, id`,
      )
      .all<StaffRow>();

    return result.results.map(toStaffSummary);
  }

  async listActiveRooms() {
    const result = await this.db
      .prepare(
        `SELECT id, name FROM rooms WHERE is_active = 1 ORDER BY name, id`,
      )
      .all<RoomRow>();
    return result.results.map((row) => ({ id: row.id, name: row.name }));
  }
}

function toStaffSummary(row: StaffRow): StaffSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    isSchoolSub: row.is_school_sub === 1,
  };
}
