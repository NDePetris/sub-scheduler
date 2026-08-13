import { shiftSchoolDate } from '../../src/domain/planning';
import type { ImportIssue } from '../../src/features/schedule-import/types';
import type { SchoolScheduleCandidate } from '../../src/features/schedule-import/school-schedule-adapter';
import { HttpError } from '../http';

interface IdentityRow {
  id: string;
  value: string;
}

interface ImportRow {
  id: string;
  source_file_name: string;
  source_file_sha256: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
  sheet_name: string | null;
  a_b_detected: number;
  created_at: string;
  activated_schedule_version_id: string | null;
  activated_at: string | null;
}

interface MappingRow {
  display_value: string;
  target_id: string | null;
  mapping_status: string;
}

interface IssueRow {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  source_sheet: string | null;
  source_cell: string | null;
}

interface CountRow {
  count: number;
}

interface StagedEntryRow {
  id: string;
  staff_id: string;
  room_id: string | null;
  day_type: 'A' | 'B' | 'ALL';
  start_time: string;
  end_time: string;
  activity_type:
    | 'instruction'
    | 'plan'
    | 'admin'
    | 'lunch'
    | 'duty'
    | 'after_school'
    | 'other';
  category:
    | 'PRI'
    | 'EL'
    | 'INT'
    | 'MS'
    | 'HS'
    | 'PLAN_ADMIN'
    | 'LUNCH'
    | 'AFTER_SCHOOL_OTHER';
  description: string;
  requires_sub: number;
}

interface ActiveVersionRow {
  id: string;
  effective_from: string;
  effective_to: string | null;
}

export class ImportRepository {
  constructor(private readonly db: D1Database) {}

  async stage(input: {
    readonly fileName: string;
    readonly sha256: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
    readonly candidate: SchoolScheduleCandidate;
    readonly issues: readonly ImportIssue[];
    readonly actorId: string;
  }) {
    const existing = await this.db
      .prepare(
        `SELECT id FROM schedule_imports
          WHERE source_file_sha256 = ? AND effective_from = ?
            AND COALESCE(effective_to, '') = COALESCE(?, '')`,
      )
      .bind(input.sha256, input.effectiveFrom, input.effectiveTo)
      .first<{ id: string }>();
    if (existing) return this.get(existing.id);

    const [staff, rooms] = await Promise.all([
      this.db
        .prepare(
          `SELECT id, display_name AS value FROM staff WHERE is_active = 1`,
        )
        .all<IdentityRow>(),
      this.db
        .prepare(`SELECT id, name AS value FROM rooms WHERE is_active = 1`)
        .all<IdentityRow>(),
    ]);
    const staffByName = identityMap(staff.results);
    const roomsByName = identityMap(rooms.results);
    const importId = crypto.randomUUID();
    const recognizedStaff = input.candidate.staffDisplayValues.filter((value) =>
      staffByName.has(normalize(value)),
    ).length;
    const recognizedRooms = input.candidate.roomDisplayValues.filter((value) =>
      roomsByName.has(normalize(value)),
    ).length;
    const hasBlockingIssue = input.issues.some(
      (issue) => issue.severity === 'error',
    );
    const mappingsComplete =
      recognizedStaff === input.candidate.staffDisplayValues.length &&
      recognizedRooms === input.candidate.roomDisplayValues.length;
    const status = !hasBlockingIssue && mappingsComplete ? 'ready' : 'staged';

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO schedule_imports (
             id, source_file_name, source_file_sha256, status, effective_from,
             effective_to, sheet_name, recognized_staff_count,
             recognized_room_count, a_b_detected, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          importId,
          input.fileName,
          input.sha256,
          status,
          input.effectiveFrom,
          input.effectiveTo,
          input.candidate.sheetName,
          recognizedStaff,
          recognizedRooms,
          input.candidate.aBDetected ? 1 : 0,
          input.actorId,
        ),
    ];

    for (const value of input.candidate.staffDisplayValues) {
      const match = staffByName.get(normalize(value));
      statements.push(
        this.db
          .prepare(
            `INSERT INTO schedule_import_staff
               (import_id, display_value, staff_id, mapping_status)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            importId,
            value,
            match?.id ?? null,
            match ? 'exact' : 'unmapped',
          ),
      );
    }
    for (const value of input.candidate.roomDisplayValues) {
      const match = roomsByName.get(normalize(value));
      statements.push(
        this.db
          .prepare(
            `INSERT INTO schedule_import_rooms
               (import_id, display_value, room_id, mapping_status)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            importId,
            value,
            match?.id ?? null,
            match ? 'exact' : 'unmapped',
          ),
      );
    }
    for (const entry of input.candidate.entries) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO staged_schedule_entries (
               id, import_id, source_sheet, source_cell, staff_display_value,
               room_display_value, day_type, start_time, end_time,
               activity_type, category, description, requires_sub
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            importId,
            entry.sourceSheet,
            entry.sourceCell,
            entry.staffDisplayValue,
            entry.roomDisplayValue,
            entry.dayType,
            entry.startTime,
            entry.endTime,
            entry.activityType,
            entry.category,
            entry.description,
            entry.requiresSub ? 1 : 0,
          ),
      );
    }
    for (const issue of input.issues) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO schedule_import_issues (
               id, import_id, severity, code, message, source_sheet, source_cell
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            importId,
            issue.severity,
            issue.code,
            issue.message,
            issue.sheet ?? null,
            issue.row
              ? `R${issue.row}${issue.column ? `C${issue.column}` : ''}`
              : null,
          ),
      );
    }
    await this.db.batch(statements);
    return this.get(importId);
  }

  async list() {
    const rows = await this.db
      .prepare(
        `SELECT id, source_file_name, source_file_sha256, status, effective_from,
                effective_to, sheet_name, a_b_detected, created_at,
                activated_schedule_version_id, activated_at
           FROM schedule_imports
          ORDER BY created_at DESC`,
      )
      .all<ImportRow>();
    return Promise.all(rows.results.map((row) => this.hydrate(row)));
  }

  async get(id: string) {
    const row = await this.db
      .prepare(
        `SELECT id, source_file_name, source_file_sha256, status, effective_from,
                effective_to, sheet_name, a_b_detected, created_at,
                activated_schedule_version_id, activated_at
           FROM schedule_imports WHERE id = ?`,
      )
      .bind(id)
      .first<ImportRow>();
    if (!row)
      throw new HttpError(
        404,
        'import_not_found',
        'Schedule import not found.',
      );
    return this.hydrate(row);
  }

  async mapValue(input: {
    readonly importId: string;
    readonly kind: 'staff' | 'room';
    readonly displayValue: string;
    readonly targetId?: string;
    readonly createNew: boolean;
  }) {
    const detail = await this.get(input.importId);
    if (detail.status === 'activated') {
      throw new HttpError(
        409,
        'import_already_activated',
        'Activated imports cannot be remapped.',
      );
    }

    const targetId = input.createNew
      ? await this.createIdentity(input.kind, input.displayValue)
      : await this.assertIdentity(input.kind, input.targetId);
    const table =
      input.kind === 'staff'
        ? 'schedule_import_staff'
        : 'schedule_import_rooms';
    const column = input.kind === 'staff' ? 'staff_id' : 'room_id';
    const result = await this.db
      .prepare(
        `UPDATE ${table} SET ${column} = ?, mapping_status = ?
          WHERE import_id = ? AND display_value = ?`,
      )
      .bind(
        targetId,
        input.createNew ? 'created' : 'mapped',
        input.importId,
        input.displayValue,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new HttpError(
        404,
        'mapping_not_found',
        'The imported value was not found.',
      );
    }
    await this.refreshStatus(input.importId);
    return this.get(input.importId);
  }

  async activate(importId: string, name: string, actorId: string) {
    const detail = await this.get(importId);
    if (detail.status === 'activated') return detail;
    if (
      detail.blockingErrors > 0 ||
      detail.unmappedStaff > 0 ||
      detail.unmappedRooms > 0
    ) {
      throw new HttpError(
        409,
        'import_not_ready',
        'Resolve blocking validation issues and required mappings before activation.',
      );
    }

    const staged = await this.db
      .prepare(
        `SELECT e.id, sm.staff_id, rm.room_id, e.day_type, e.start_time,
                e.end_time, e.activity_type, e.category, e.description,
                e.requires_sub
           FROM staged_schedule_entries e
           JOIN schedule_import_staff sm
             ON sm.import_id = e.import_id
            AND sm.display_value = e.staff_display_value
      LEFT JOIN schedule_import_rooms rm
             ON rm.import_id = e.import_id
            AND rm.display_value = e.room_display_value
          WHERE e.import_id = ?
          ORDER BY e.source_cell`,
      )
      .bind(importId)
      .all<StagedEntryRow>();
    if (
      staged.results.length === 0 ||
      staged.results.some((entry) => !entry.staff_id)
    ) {
      throw new HttpError(
        409,
        'import_not_ready',
        'The import does not contain fully mapped entries.',
      );
    }

    const active = await this.db
      .prepare(
        `SELECT id, effective_from, effective_to
           FROM schedule_versions WHERE status = 'active'
          ORDER BY effective_from`,
      )
      .all<ActiveVersionRow>();
    const statements: D1PreparedStatement[] = [];
    for (const version of active.results) {
      if (
        version.effective_to === null &&
        version.effective_from < detail.effectiveFrom
      ) {
        statements.push(
          this.db
            .prepare(
              `UPDATE schedule_versions SET effective_to = ? WHERE id = ?`,
            )
            .bind(shiftSchoolDate(detail.effectiveFrom, -1), version.id),
        );
        continue;
      }
      if (rangesOverlap(version, detail)) {
        throw new HttpError(
          409,
          'schedule_range_conflict',
          'The requested effective dates overlap another active Schedule Version.',
        );
      }
    }

    const scheduleVersionId = crypto.randomUUID();
    const now = new Date().toISOString();
    statements.push(
      this.db
        .prepare(
          `INSERT INTO schedule_versions (
             id, name, effective_from, effective_to, status, source_file_name,
             source_file_sha256, created_by, activated_by, activated_at
           ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        )
        .bind(
          scheduleVersionId,
          name,
          detail.effectiveFrom,
          detail.effectiveTo,
          detail.sourceFileName,
          detail.sourceFileSha256,
          actorId,
          actorId,
          now,
        ),
    );
    for (const entry of staged.results) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO schedule_entries (
               id, schedule_version_id, staff_id, day_type, start_time, end_time,
               activity_type, category, description, room_id, requires_sub
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            scheduleVersionId,
            entry.staff_id,
            entry.day_type,
            entry.start_time,
            entry.end_time,
            entry.activity_type,
            entry.category,
            entry.description,
            entry.room_id,
            entry.requires_sub,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `UPDATE schedule_imports
              SET status = 'activated', activated_schedule_version_id = ?, activated_at = ?
            WHERE id = ? AND status <> 'activated'`,
        )
        .bind(scheduleVersionId, now, importId),
    );
    await this.db.batch(statements);
    return this.get(importId);
  }

  private async hydrate(row: ImportRow) {
    const [staff, rooms, issues, entries] = await Promise.all([
      this.db
        .prepare(
          `SELECT display_value, staff_id AS target_id, mapping_status
             FROM schedule_import_staff WHERE import_id = ? ORDER BY display_value`,
        )
        .bind(row.id)
        .all<MappingRow>(),
      this.db
        .prepare(
          `SELECT display_value, room_id AS target_id, mapping_status
             FROM schedule_import_rooms WHERE import_id = ? ORDER BY display_value`,
        )
        .bind(row.id)
        .all<MappingRow>(),
      this.db
        .prepare(
          `SELECT severity, code, message, source_sheet, source_cell
             FROM schedule_import_issues WHERE import_id = ?
            ORDER BY severity, code, source_cell`,
        )
        .bind(row.id)
        .all<IssueRow>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM staged_schedule_entries WHERE import_id = ?`,
        )
        .bind(row.id)
        .first<CountRow>(),
    ]);
    const blockingErrors = issues.results.filter(
      (issue) => issue.severity === 'error',
    ).length;
    return {
      id: row.id,
      sourceFileName: row.source_file_name,
      sourceFileSha256: row.source_file_sha256,
      status: row.status,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      sheetName: row.sheet_name,
      aBDetected: row.a_b_detected === 1,
      createdAt: row.created_at,
      activatedScheduleVersionId: row.activated_schedule_version_id,
      activatedAt: row.activated_at,
      entryCount: entries?.count ?? 0,
      staffMappings: staff.results.map(toMapping),
      roomMappings: rooms.results.map(toMapping),
      unmappedStaff: staff.results.filter(
        (mapping) => mapping.target_id === null,
      ).length,
      unmappedRooms: rooms.results.filter(
        (mapping) => mapping.target_id === null,
      ).length,
      recognizedStaff: staff.results.filter(
        (mapping) => mapping.target_id !== null,
      ).length,
      recognizedRooms: rooms.results.filter(
        (mapping) => mapping.target_id !== null,
      ).length,
      blockingErrors,
      warnings: issues.results.filter((issue) => issue.severity === 'warning')
        .length,
      issues: issues.results.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        sheet: issue.source_sheet,
        cell: issue.source_cell,
      })),
    };
  }

  private async createIdentity(
    kind: 'staff' | 'room',
    displayValue: string,
  ): Promise<string> {
    const existing = await this.findIdentity(kind, displayValue);
    if (existing) return existing;
    const id = crypto.randomUUID();
    if (kind === 'staff') {
      await this.db
        .prepare(
          `INSERT INTO staff (id, display_name, role, is_active, can_sub, is_school_sub)
           VALUES (?, ?, 'teacher', 1, 1, 0)`,
        )
        .bind(id, displayValue)
        .run();
    } else {
      await this.db
        .prepare(`INSERT INTO rooms (id, name, is_active) VALUES (?, ?, 1)`)
        .bind(id, displayValue)
        .run();
    }
    return id;
  }

  private async assertIdentity(
    kind: 'staff' | 'room',
    targetId?: string,
  ): Promise<string> {
    if (!targetId) {
      throw new HttpError(
        400,
        'target_required',
        'Choose an existing record or create a new one.',
      );
    }
    const table = kind === 'staff' ? 'staff' : 'rooms';
    const row = await this.db
      .prepare(`SELECT id FROM ${table} WHERE id = ? AND is_active = 1`)
      .bind(targetId)
      .first<{ id: string }>();
    if (!row)
      throw new HttpError(
        400,
        'invalid_mapping_target',
        'The mapping target is not active.',
      );
    return row.id;
  }

  private async findIdentity(
    kind: 'staff' | 'room',
    value: string,
  ): Promise<string | null> {
    const column = kind === 'staff' ? 'display_name' : 'name';
    const table = kind === 'staff' ? 'staff' : 'rooms';
    const row = await this.db
      .prepare(
        `SELECT id FROM ${table} WHERE lower(${column}) = lower(?) LIMIT 1`,
      )
      .bind(value)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  private async refreshStatus(importId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE schedule_imports
            SET status = CASE
              WHEN EXISTS (
                SELECT 1 FROM schedule_import_issues
                 WHERE import_id = schedule_imports.id AND severity = 'error'
              ) THEN 'staged'
              WHEN EXISTS (
                SELECT 1 FROM schedule_import_staff
                 WHERE import_id = schedule_imports.id AND staff_id IS NULL
              ) OR EXISTS (
                SELECT 1 FROM schedule_import_rooms
                 WHERE import_id = schedule_imports.id AND room_id IS NULL
              ) THEN 'staged'
              ELSE 'ready'
            END
          WHERE id = ? AND status <> 'activated'`,
      )
      .bind(importId)
      .run();
  }
}

function identityMap(rows: readonly IdentityRow[]): Map<string, IdentityRow> {
  return new Map(rows.map((row) => [normalize(row.value), row]));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function toMapping(row: MappingRow) {
  return {
    displayValue: row.display_value,
    targetId: row.target_id,
    status: row.mapping_status,
  };
}

function rangesOverlap(
  existing: { effective_from: string; effective_to: string | null },
  incoming: { effectiveFrom: string; effectiveTo: string | null },
): boolean {
  const existingEnd = existing.effective_to ?? '9999-12-31';
  const incomingEnd = incoming.effectiveTo ?? '9999-12-31';
  return (
    existing.effective_from <= incomingEnd &&
    incoming.effectiveFrom <= existingEnd
  );
}
