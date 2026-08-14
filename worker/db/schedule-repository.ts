import { HttpError } from '../http';

interface VersionRow {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string | null;
  status: 'active' | 'retired';
  source_file_name: string | null;
  created_at: string;
  activated_at: string | null;
  entry_count: number;
  plan_reference_count: number;
}

interface SpecialRow {
  id: string;
  date: string;
  name: string;
  status: 'draft' | 'active' | 'retired';
  source_file_name: string | null;
  created_at: string;
  entry_count: number;
  plan_reference_count: number;
}

export class ScheduleRepository {
  constructor(private readonly db: D1Database) {}

  async list() {
    const timezone =
      (
        await this.db
          .prepare(
            `SELECT school_timezone FROM application_settings WHERE id = 'school'`,
          )
          .first<{ school_timezone: string }>()
      )?.school_timezone ?? 'UTC';
    const schoolDate = dateInTimezone(new Date(), timezone);
    const [versions, specials] = await Promise.all([
      this.db
        .prepare(
          `SELECT sv.id, sv.name, sv.effective_from, sv.effective_to, sv.status,
                  sv.source_file_name, sv.created_at, sv.activated_at,
                  COUNT(DISTINCT se.id) AS entry_count,
                  COUNT(DISTINCT p.id) AS plan_reference_count
             FROM schedule_versions sv
        LEFT JOIN schedule_entries se ON se.schedule_version_id = sv.id
        LEFT JOIN daily_sub_plans p ON p.schedule_version_id = sv.id
            WHERE sv.status IN ('active', 'retired')
            GROUP BY sv.id
            ORDER BY sv.effective_from DESC, sv.created_at DESC`,
        )
        .all<VersionRow>(),
      this.db
        .prepare(
          `SELECT ss.id, ss.date, ss.name, ss.status, ss.source_file_name,
                  ss.created_at, COUNT(DISTINCT se.id) AS entry_count,
                  COUNT(DISTINCT p.id) AS plan_reference_count
             FROM special_schedules ss
        LEFT JOIN special_schedule_entries se ON se.special_schedule_id = ss.id
        LEFT JOIN daily_sub_plans p ON p.special_schedule_id = ss.id
            GROUP BY ss.id
            ORDER BY ss.date DESC, ss.created_at DESC`,
        )
        .all<SpecialRow>(),
    ]);

    return {
      schoolDate,
      scheduleVersions: versions.results.map((row) => ({
        id: row.id,
        name: row.name,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        status: versionStatus(row, schoolDate),
        sourceFileName: row.source_file_name,
        createdAt: row.created_at,
        activatedAt: row.activated_at,
        entryCount: row.entry_count,
        planReferenceCount: row.plan_reference_count,
        canDelete: row.plan_reference_count === 0,
      })),
      specialSchedules: specials.results.map((row) => ({
        id: row.id,
        date: row.date,
        name: row.name,
        status: row.status === 'retired' ? 'archived' : row.status,
        sourceFileName: row.source_file_name,
        createdAt: row.created_at,
        entryCount: row.entry_count,
        planReferenceCount: row.plan_reference_count,
        canDelete: row.plan_reference_count === 0,
      })),
    };
  }

  async configure(
    id: string,
    input: {
      readonly name: string;
      readonly effectiveFrom: string;
      readonly effectiveTo: string | null;
    },
  ) {
    const target = await this.version(id);
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new HttpError(
        400,
        'invalid_effective_range',
        'Effective To must not precede Effective From.',
      );
    }
    if (target.status === 'active') {
      const conflict = await this.findConflict(
        input.effectiveFrom,
        input.effectiveTo,
        id,
      );
      if (conflict) throw conflictError(conflict);
    }
    const update =
      target.status === 'active'
        ? await this.db
            .prepare(
              `UPDATE schedule_versions
                  SET name = ?, effective_from = ?, effective_to = ?
                WHERE id = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM schedule_versions other
                     WHERE other.status = 'active' AND other.id <> ?
                       AND other.effective_from <= COALESCE(?, '9999-12-31')
                       AND ? <= COALESCE(other.effective_to, '9999-12-31')
                  )`,
            )
            .bind(
              input.name,
              input.effectiveFrom,
              input.effectiveTo,
              id,
              id,
              input.effectiveTo,
              input.effectiveFrom,
            )
            .run()
        : await this.db
            .prepare(
              `UPDATE schedule_versions
                  SET name = ?, effective_from = ?, effective_to = ?
                WHERE id = ?`,
            )
            .bind(input.name, input.effectiveFrom, input.effectiveTo, id)
            .run();
    if (update.meta.changes !== 1) {
      const conflict = await this.findConflict(
        input.effectiveFrom,
        input.effectiveTo,
        id,
      );
      if (conflict) throw conflictError(conflict);
      throw new HttpError(
        409,
        'schedule_update_conflict',
        'The Schedule Version changed while it was being configured. Reload and try again.',
      );
    }
    return this.list();
  }

  async delete(id: string) {
    const target = await this.version(id);
    const references = await this.planReferences(id);
    if (references > 0) {
      throw new HttpError(
        409,
        'schedule_in_use',
        `${target.name} is referenced by ${references} historical Sub Plan${references === 1 ? '' : 's'} and cannot be deleted without destroying schedule context. Archive it instead.`,
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM schedule_imports WHERE activated_schedule_version_id = ?`,
        )
        .bind(id),
      this.db.prepare(`DELETE FROM schedule_versions WHERE id = ?`).bind(id),
    ]);
    return this.list();
  }

  async archive(id: string) {
    await this.version(id);
    await this.db
      .prepare(`UPDATE schedule_versions SET status = 'retired' WHERE id = ?`)
      .bind(id)
      .run();
    return this.list();
  }

  async configureSpecial(
    id: string,
    input: { readonly name: string; readonly date: string },
  ) {
    const target = await this.special(id);
    const references = await this.specialPlanReferences(id);
    if (references > 0 && input.date !== target.date) {
      throw new HttpError(
        409,
        'special_schedule_date_pinned',
        'A Special Schedule used by a Sub Plan cannot be moved to another date. Archive it and create a new Special Schedule instead.',
      );
    }
    const conflict = await this.db
      .prepare(`SELECT name FROM special_schedules WHERE date = ? AND id <> ?`)
      .bind(input.date, id)
      .first<{ name: string }>();
    if (conflict) {
      throw new HttpError(
        409,
        'special_schedule_date_conflict',
        `${conflict.name} is already configured for ${input.date}.`,
      );
    }
    await this.db
      .prepare(`UPDATE special_schedules SET name = ?, date = ? WHERE id = ?`)
      .bind(input.name, input.date, id)
      .run();
    return this.list();
  }

  async deleteSpecial(id: string) {
    const target = await this.special(id);
    const references = await this.specialPlanReferences(id);
    if (references > 0) {
      throw new HttpError(
        409,
        'special_schedule_in_use',
        `${target.name} is referenced by ${references} historical Sub Plan${references === 1 ? '' : 's'} and cannot be deleted. Archive it instead.`,
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM schedule_imports WHERE activated_special_schedule_id = ?`,
        )
        .bind(id),
      this.db.prepare(`DELETE FROM special_schedules WHERE id = ?`).bind(id),
    ]);
    return this.list();
  }

  async archiveSpecial(id: string) {
    await this.special(id);
    await this.db
      .prepare(`UPDATE special_schedules SET status = 'retired' WHERE id = ?`)
      .bind(id)
      .run();
    return this.list();
  }

  private async version(id: string) {
    const row = await this.db
      .prepare(
        `SELECT id, name, effective_from, effective_to, status
           FROM schedule_versions WHERE id = ? AND status IN ('active', 'retired')`,
      )
      .bind(id)
      .first<{
        id: string;
        name: string;
        effective_from: string;
        effective_to: string | null;
        status: 'active' | 'retired';
      }>();
    if (!row)
      throw new HttpError(
        404,
        'schedule_not_found',
        'Schedule Version not found.',
      );
    return row;
  }

  private async planReferences(id: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM daily_sub_plans WHERE schedule_version_id = ?`,
      )
      .bind(id)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  private async special(id: string) {
    const row = await this.db
      .prepare(
        `SELECT id, name, date, status FROM special_schedules WHERE id = ?`,
      )
      .bind(id)
      .first<{ id: string; name: string; date: string; status: string }>();
    if (!row) {
      throw new HttpError(
        404,
        'special_schedule_not_found',
        'Special Schedule not found.',
      );
    }
    return row;
  }

  private async specialPlanReferences(id: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM daily_sub_plans WHERE special_schedule_id = ?`,
      )
      .bind(id)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  private async findConflict(
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId: string,
  ) {
    const incomingEnd = effectiveTo ?? '9999-12-31';
    return this.db
      .prepare(
        `SELECT id, name, effective_from, effective_to
           FROM schedule_versions
          WHERE status = 'active' AND id <> ?
            AND effective_from <= ?
            AND ? <= COALESCE(effective_to, '9999-12-31')
          ORDER BY effective_from LIMIT 1`,
      )
      .bind(excludeId, incomingEnd, effectiveFrom)
      .first<{
        id: string;
        name: string;
        effective_from: string;
        effective_to: string | null;
      }>();
  }
}

function versionStatus(row: VersionRow, schoolDate: string) {
  if (row.status === 'retired') return 'archived' as const;
  if (row.effective_from > schoolDate) return 'future' as const;
  if (row.effective_to !== null && row.effective_to < schoolDate)
    return 'historical' as const;
  return 'current' as const;
}

function conflictError(conflict: {
  name: string;
  effective_from: string;
  effective_to: string | null;
}) {
  return new HttpError(
    409,
    'schedule_range_conflict',
    `The requested dates overlap ${conflict.name} (${conflict.effective_from} to ${conflict.effective_to ?? 'open-ended'}). Schedule Version ranges cannot be ambiguous.`,
  );
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
