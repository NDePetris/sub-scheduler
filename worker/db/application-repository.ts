import { normalizeIdentityValue } from '../../src/domain/identity';
import { inferStandardPeriodMinutes } from '../../src/domain/planning';
import { normalizeStaffRole, type StaffRole } from '../../src/domain/staff';
import { HttpError } from '../http';

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
  is_active: number;
  can_sub: number;
  is_school_sub: number;
  standard_period_minutes: number | null;
}

interface AliasRow {
  id: string;
  staff_id: string;
  display_value: string;
  normalized_value: string;
}

interface InferenceEntryRow {
  staff_id: string;
  day_type: 'A' | 'B' | 'ALL';
  start_time: string;
  end_time: string;
  activity_type: string;
}

interface DayTypeCountRow {
  a_count: number;
  b_count: number;
  shared_count: number;
}

interface RoomRow {
  id: string;
  name: string;
  is_active: number;
}

export interface StaffSummary {
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

    const [staffCount, roomCount, schedule, schoolSubs] = await Promise.all([
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
          `SELECT id, display_name, role, is_active, can_sub, is_school_sub,
                  standard_period_minutes
             FROM staff
            WHERE is_active = 1 AND is_school_sub = 1
            ORDER BY display_name, id`,
        )
        .all<StaffRow>(),
    ]);

    const dayTypeCounts = schedule
      ? await this.db
          .prepare(
            `SELECT
               COALESCE(SUM(CASE WHEN day_type = 'A' THEN 1 ELSE 0 END), 0) AS a_count,
               COALESCE(SUM(CASE WHEN day_type = 'B' THEN 1 ELSE 0 END), 0) AS b_count,
               COALESCE(SUM(CASE WHEN day_type = 'ALL' THEN 1 ELSE 0 END), 0) AS shared_count
               FROM schedule_entries WHERE schedule_version_id = ?`,
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
        schoolSubs: schoolSubs.results.map((row) => basicStaff(row)),
        dayTypeCounts: {
          A: dayTypeCounts?.a_count ?? 0,
          B: dayTypeCounts?.b_count ?? 0,
          shared: dayTypeCounts?.shared_count ?? 0,
        },
      },
    };
  }

  async listStaff(includeInactive = false): Promise<StaffSummary[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, display_name, role, is_active, can_sub, is_school_sub,
                standard_period_minutes
           FROM staff
          WHERE (? = 1 OR is_active = 1)
          ORDER BY is_active DESC, is_school_sub DESC, display_name, id`,
      )
      .bind(includeInactive ? 1 : 0)
      .all<StaffRow>();
    return this.hydrateStaff(rows.results);
  }

  async getStaff(id: string): Promise<StaffSummary> {
    const row = await this.db
      .prepare(
        `SELECT id, display_name, role, is_active, can_sub, is_school_sub,
                standard_period_minutes FROM staff WHERE id = ?`,
      )
      .bind(id)
      .first<StaffRow>();
    if (!row)
      throw new HttpError(404, 'staff_not_found', 'Staff member not found.');
    return (await this.hydrateStaff([row]))[0]!;
  }

  async createStaff(input: {
    readonly displayName: string;
    readonly role: StaffRole;
    readonly canSub: boolean;
    readonly isSchoolSub: boolean;
    readonly standardPeriodMinutes: number | null;
  }): Promise<StaffSummary> {
    const displayName = cleanName(input.displayName);
    await this.assertStaffNameAvailable(displayName);
    const id = crypto.randomUUID();
    const isSchoolSub = input.isSchoolSub;
    await this.db
      .prepare(
        `INSERT INTO staff
           (id, display_name, role, is_active, can_sub, is_school_sub, standard_period_minutes)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        id,
        displayName,
        roleToStorage(input.role),
        isSchoolSub || input.canSub ? 1 : 0,
        isSchoolSub ? 1 : 0,
        input.standardPeriodMinutes,
      )
      .run();
    return this.getStaff(id);
  }

  async updateStaff(
    id: string,
    input: {
      readonly displayName: string;
      readonly role: StaffRole;
      readonly canSub: boolean;
      readonly isSchoolSub: boolean;
      readonly standardPeriodMinutes: number | null;
    },
  ): Promise<StaffSummary> {
    const existing = await this.getStaff(id);
    const displayName = cleanName(input.displayName);
    await this.assertStaffNameAvailable(displayName, id);
    const isSchoolSub = input.isSchoolSub;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE staff
              SET display_name = ?, role = ?, can_sub = ?, is_school_sub = ?,
                  standard_period_minutes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`,
        )
        .bind(
          displayName,
          roleToStorage(input.role),
          isSchoolSub || input.canSub ? 1 : 0,
          isSchoolSub ? 1 : 0,
          input.standardPeriodMinutes,
          id,
        ),
      this.db
        .prepare(
          `DELETE FROM staff_aliases WHERE staff_id = ? AND normalized_value = ?`,
        )
        .bind(id, normalizeIdentityValue(displayName)),
    ];
    if (
      normalizeIdentityValue(existing.displayName) !==
      normalizeIdentityValue(displayName)
    ) {
      const aliasConflict = await this.identityOwner(existing.displayName);
      if (!aliasConflict || aliasConflict === id) {
        statements.push(
          this.db
            .prepare(
              `INSERT INTO staff_aliases
                 (id, staff_id, display_value, normalized_value)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(normalized_value) DO NOTHING`,
            )
            .bind(
              crypto.randomUUID(),
              id,
              existing.displayName,
              normalizeIdentityValue(existing.displayName),
            ),
        );
      }
    }
    await this.db.batch(statements);
    return this.getStaff(id);
  }

  async setStaffActive(id: string, isActive: boolean): Promise<StaffSummary> {
    const result = await this.db
      .prepare(
        `UPDATE staff
            SET is_active = ?, is_school_sub = CASE WHEN ? = 1 THEN is_school_sub ELSE 0 END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?`,
      )
      .bind(isActive ? 1 : 0, isActive ? 1 : 0, id)
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(404, 'staff_not_found', 'Staff member not found.');
    return this.getStaff(id);
  }

  async addStaffAlias(
    staffId: string,
    displayValueInput: string,
  ): Promise<StaffSummary> {
    await this.getStaff(staffId);
    const displayValue = cleanName(displayValueInput);
    const owner = await this.identityOwner(displayValue);
    if (owner && owner !== staffId) {
      throw new HttpError(
        409,
        'staff_alias_conflict',
        'That schedule name already belongs to another staff member.',
      );
    }
    if (!owner) {
      await this.db
        .prepare(
          `INSERT INTO staff_aliases (id, staff_id, display_value, normalized_value)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          staffId,
          displayValue,
          normalizeIdentityValue(displayValue),
        )
        .run();
    }
    return this.getStaff(staffId);
  }

  async removeStaffAlias(
    staffId: string,
    aliasId: string,
  ): Promise<StaffSummary> {
    const result = await this.db
      .prepare(`DELETE FROM staff_aliases WHERE id = ? AND staff_id = ?`)
      .bind(aliasId, staffId)
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(
        404,
        'staff_alias_not_found',
        'Schedule name not found.',
      );
    return this.getStaff(staffId);
  }

  async listRooms(includeInactive = false) {
    const result = await this.db
      .prepare(
        `SELECT id, name, is_active FROM rooms WHERE (? = 1 OR is_active = 1) ORDER BY is_active DESC, name, id`,
      )
      .bind(includeInactive ? 1 : 0)
      .all<RoomRow>();
    return result.results.map(roomDto);
  }

  async createRoom(nameInput: string) {
    const name = cleanName(nameInput);
    await this.assertRoomNameAvailable(name);
    const id = crypto.randomUUID();
    await this.db
      .prepare(`INSERT INTO rooms (id, name, is_active) VALUES (?, ?, 1)`)
      .bind(id, name)
      .run();
    return { id, name, isActive: true };
  }

  async updateRoom(id: string, nameInput: string) {
    const name = cleanName(nameInput);
    await this.assertRoomNameAvailable(name, id);
    const result = await this.db
      .prepare(`UPDATE rooms SET name = ? WHERE id = ?`)
      .bind(name, id)
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(404, 'room_not_found', 'Room not found.');
    return { id, name, isActive: (await this.roomById(id)).is_active === 1 };
  }

  async setRoomActive(id: string, isActive: boolean) {
    const result = await this.db
      .prepare(`UPDATE rooms SET is_active = ? WHERE id = ?`)
      .bind(isActive ? 1 : 0, id)
      .run();
    if (result.meta.changes !== 1)
      throw new HttpError(404, 'room_not_found', 'Room not found.');
    return roomDto(await this.roomById(id));
  }

  private async hydrateStaff(
    rows: readonly StaffRow[],
  ): Promise<StaffSummary[]> {
    if (rows.length === 0) return [];
    const [aliases, settings] = await Promise.all([
      this.db
        .prepare(
          `SELECT id, staff_id, display_value, normalized_value FROM staff_aliases ORDER BY display_value, id`,
        )
        .all<AliasRow>(),
      this.db
        .prepare(
          `SELECT school_timezone FROM application_settings WHERE id = 'school'`,
        )
        .first<{ school_timezone: string }>(),
    ]);
    const schoolDate = dateInTimezone(
      new Date(),
      settings?.school_timezone ?? 'UTC',
    );
    const schedule = await this.db
      .prepare(
        `SELECT id FROM schedule_versions
          WHERE status = 'active' AND effective_from <= ?
            AND (effective_to IS NULL OR effective_to >= ?)
          ORDER BY effective_from DESC LIMIT 1`,
      )
      .bind(schoolDate, schoolDate)
      .first<{ id: string }>();
    const entries = schedule
      ? await this.db
          .prepare(
            `SELECT staff_id, day_type, start_time, end_time, activity_type
               FROM schedule_entries
              WHERE schedule_version_id = ? AND activity_type = 'instruction'`,
          )
          .bind(schedule.id)
          .all<InferenceEntryRow>()
      : { results: [] as InferenceEntryRow[] };
    return rows.map((row) => {
      const staffEntries = entries.results.filter(
        (entry) => entry.staff_id === row.id,
      );
      const inferredA = inferStandardPeriodMinutes(
        staffEntries.map(inferenceEntry),
        'A',
      );
      const inferredB = inferStandardPeriodMinutes(
        staffEntries.map(inferenceEntry),
        'B',
      );
      return {
        ...basicStaff(row),
        inferredStandardPeriodMinutes:
          inferredA === inferredB ? inferredA : (inferredA ?? inferredB),
        aliases: aliases.results
          .filter((alias) => alias.staff_id === row.id)
          .map((alias) => ({
            id: alias.id,
            displayValue: alias.display_value,
          })),
      };
    });
  }

  private async identityOwner(value: string): Promise<string | null> {
    const normalized = normalizeIdentityValue(value);
    const [staff, alias] = await Promise.all([
      this.db
        .prepare(`SELECT id, display_name FROM staff`)
        .all<{ id: string; display_name: string }>(),
      this.db
        .prepare(
          `SELECT staff_id FROM staff_aliases WHERE normalized_value = ?`,
        )
        .bind(normalized)
        .first<{ staff_id: string }>(),
    ]);
    return (
      staff.results.find(
        (row) => normalizeIdentityValue(row.display_name) === normalized,
      )?.id ??
      alias?.staff_id ??
      null
    );
  }

  private async assertStaffNameAvailable(
    value: string,
    permittedId = '',
  ): Promise<void> {
    const owner = await this.identityOwner(value);
    if (owner && owner !== permittedId) {
      throw new HttpError(
        409,
        'staff_name_conflict',
        'That name already identifies another staff member or imported schedule name.',
      );
    }
  }

  private async assertRoomNameAvailable(
    value: string,
    permittedId = '',
  ): Promise<void> {
    const rooms = await this.db
      .prepare(`SELECT id, name FROM rooms`)
      .all<{ id: string; name: string }>();
    const normalized = normalizeIdentityValue(value);
    const conflict = rooms.results.find(
      (row) =>
        row.id !== permittedId &&
        normalizeIdentityValue(row.name) === normalized,
    );
    if (conflict)
      throw new HttpError(
        409,
        'room_name_conflict',
        'A room with that name already exists.',
      );
  }

  private async roomById(id: string): Promise<RoomRow> {
    const room = await this.db
      .prepare(`SELECT id, name, is_active FROM rooms WHERE id = ?`)
      .bind(id)
      .first<RoomRow>();
    if (!room) throw new HttpError(404, 'room_not_found', 'Room not found.');
    return room;
  }
}

function inferenceEntry(row: InferenceEntryRow) {
  return {
    dayType: row.day_type,
    startTime: row.start_time,
    endTime: row.end_time,
    activityType: row.activity_type,
  };
}

function basicStaff(row: StaffRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    role: roleFromStorage(row.role),
    isActive: row.is_active === 1,
    canSub: row.can_sub === 1,
    isSchoolSub: row.is_school_sub === 1,
    standardPeriodMinutes: row.standard_period_minutes,
  };
}

function roomDto(row: RoomRow) {
  return { id: row.id, name: row.name, isActive: row.is_active === 1 };
}

function roleFromStorage(role: string): StaffRole {
  return normalizeStaffRole(role);
}

function roleToStorage(role: StaffRole): string {
  return role.toLowerCase();
}

function cleanName(value: string): string {
  const cleaned = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new HttpError(400, 'name_required', 'Name is required.');
  return cleaned;
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
