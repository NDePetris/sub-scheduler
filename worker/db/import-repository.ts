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
  import_kind: 'normal' | 'special';
  schedule_name: string;
  source_file_name: string;
  source_file_sha256: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  special_date: string | null;
  sheet_name: string | null;
  a_b_detected: number;
  created_at: string;
  activated_schedule_version_id: string | null;
  activated_special_schedule_id: string | null;
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
  name: string;
  effective_from: string;
  effective_to: string | null;
}

export interface ActivationPreview {
  readonly action: 'activate' | 'close_predecessor';
  readonly predecessor: {
    readonly id: string;
    readonly name: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: null;
    readonly proposedEffectiveTo: string;
  } | null;
}

export class ImportRepository {
  constructor(private readonly db: D1Database) {}

  async stage(input: {
    readonly kind?: 'normal' | 'special';
    readonly name?: string;
    readonly fileName: string;
    readonly sha256: string;
    readonly effectiveFrom?: string;
    readonly effectiveTo: string | null;
    readonly specialDate?: string;
    readonly candidate: SchoolScheduleCandidate;
    readonly issues: readonly ImportIssue[];
    readonly actorId: string;
  }) {
    const kind = input.kind ?? 'normal';
    const name = input.name?.trim() || input.fileName.replace(/\.xlsx$/i, '');
    const effectiveFrom = kind === 'normal' ? input.effectiveFrom : null;
    const effectiveTo = kind === 'normal' ? input.effectiveTo : null;
    const specialDate = kind === 'special' ? input.specialDate : null;
    if (kind === 'normal' && !effectiveFrom) {
      throw new HttpError(
        400,
        'effective_from_required',
        'Effective From is required.',
      );
    }
    if (kind === 'special' && !specialDate) {
      throw new HttpError(
        400,
        'special_date_required',
        'Special Schedule date is required.',
      );
    }
    if (kind === 'special') await this.assertSpecialDateAvailable(specialDate!);
    const existing = await this.db
      .prepare(
        `SELECT id FROM schedule_imports
          WHERE import_kind = ? AND source_file_sha256 = ?
            AND COALESCE(effective_from, '') = COALESCE(?, '')
            AND COALESCE(effective_to, '') = COALESCE(?, '')
            AND COALESCE(special_date, '') = COALESCE(?, '')`,
      )
      .bind(kind, input.sha256, effectiveFrom, effectiveTo, specialDate)
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
             id, import_kind, schedule_name, source_file_name, source_file_sha256,
             status, effective_from, effective_to, special_date, sheet_name, recognized_staff_count,
             recognized_room_count, a_b_detected, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          importId,
          kind,
          name,
          input.fileName,
          input.sha256,
          status,
          effectiveFrom,
          effectiveTo,
          specialDate,
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
        `SELECT id, import_kind, schedule_name, source_file_name, source_file_sha256,
                status, effective_from, effective_to, special_date, sheet_name,
                a_b_detected, created_at, activated_schedule_version_id,
                activated_special_schedule_id, activated_at
           FROM schedule_imports
          ORDER BY created_at DESC`,
      )
      .all<ImportRow>();
    return Promise.all(rows.results.map((row) => this.hydrate(row)));
  }

  async get(id: string) {
    const row = await this.db
      .prepare(
        `SELECT id, import_kind, schedule_name, source_file_name, source_file_sha256,
                status, effective_from, effective_to, special_date, sheet_name,
                a_b_detected, created_at, activated_schedule_version_id,
                activated_special_schedule_id, activated_at
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

  async configure(
    id: string,
    input:
      | {
          readonly kind: 'normal';
          readonly name: string;
          readonly effectiveFrom: string;
          readonly effectiveTo: string | null;
        }
      | {
          readonly kind: 'special';
          readonly name: string;
          readonly date: string;
        },
  ) {
    const detail = await this.get(id);
    if (detail.status === 'activated') {
      throw new HttpError(
        409,
        'import_already_activated',
        'Activated imports cannot be changed through staging configuration.',
      );
    }
    if (detail.kind !== input.kind) {
      throw new HttpError(
        400,
        'import_kind_mismatch',
        'The import kind cannot be changed.',
      );
    }
    if (input.kind === 'normal') {
      if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
        throw new HttpError(
          400,
          'invalid_effective_range',
          'Effective To must not precede Effective From.',
        );
      }
      await this.db
        .prepare(
          `UPDATE schedule_imports
              SET schedule_name = ?, effective_from = ?, effective_to = ?
            WHERE id = ? AND status <> 'activated' AND import_kind = 'normal'`,
        )
        .bind(input.name, input.effectiveFrom, input.effectiveTo, id)
        .run();
    } else {
      await this.assertSpecialDateAvailable(input.date, id);
      await this.db
        .prepare(
          `UPDATE schedule_imports SET schedule_name = ?, special_date = ?
            WHERE id = ? AND status <> 'activated' AND import_kind = 'special'`,
        )
        .bind(input.name, input.date, id)
        .run();
    }
    return this.get(id);
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

  async activationPreview(importId: string): Promise<ActivationPreview> {
    const detail = await this.get(importId);
    if (detail.kind !== 'normal') {
      throw new HttpError(
        400,
        'normal_import_required',
        'Special Schedules use their dedicated activation operation.',
      );
    }
    if (detail.status === 'activated') {
      return { action: 'activate', predecessor: null };
    }
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

    const active = await this.db
      .prepare(
        `SELECT id, name, effective_from, effective_to
           FROM schedule_versions WHERE status = 'active'
          ORDER BY effective_from`,
      )
      .all<ActiveVersionRow>();
    const predecessors = active.results.filter(
      (version) =>
        version.effective_to === null &&
        version.effective_from < detail.effectiveFrom!,
    );
    if (predecessors.length > 1) {
      throw new HttpError(
        409,
        'schedule_range_conflict',
        'More than one open-ended Schedule Version precedes this import. Correct the existing ranges before activation.',
      );
    }
    const predecessor = predecessors[0] ?? null;
    for (const version of active.results) {
      if (version.id === predecessor?.id) continue;
      if (
        rangesOverlap(version, {
          effectiveFrom: detail.effectiveFrom!,
          effectiveTo: detail.effectiveTo,
        })
      ) {
        throw scheduleConflict(version);
      }
    }
    return predecessor
      ? {
          action: 'close_predecessor',
          predecessor: {
            id: predecessor.id,
            name: predecessor.name,
            effectiveFrom: predecessor.effective_from,
            effectiveTo: null,
            proposedEffectiveTo: shiftSchoolDate(detail.effectiveFrom!, -1),
          },
        }
      : { action: 'activate', predecessor: null };
  }

  async activate(
    importId: string,
    name: string | undefined,
    actorId: string,
    confirmPredecessorClosure = false,
  ) {
    const detail = await this.get(importId);
    if (detail.kind !== 'normal') {
      throw new HttpError(
        400,
        'normal_import_required',
        'Use Activate Special Schedule for this import.',
      );
    }
    if (detail.status === 'activated') return detail;
    const preview = await this.activationPreview(importId);
    if (preview.action === 'close_predecessor' && !confirmPredecessorClosure) {
      throw new HttpError(
        409,
        'activation_confirmation_required',
        `${preview.predecessor?.name ?? 'The previous schedule'} is open-ended. Confirm that it should end on ${preview.predecessor?.proposedEffectiveTo ?? ''}.`,
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

    const statements: D1PreparedStatement[] = [];
    if (preview.predecessor) {
      statements.push(
        this.db
          .prepare(
            `UPDATE schedule_versions SET effective_to = ?
              WHERE id = ? AND status = 'active' AND effective_to IS NULL`,
          )
          .bind(
            preview.predecessor.proposedEffectiveTo,
            preview.predecessor.id,
          ),
      );
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
          name?.trim() || detail.name,
          detail.effectiveFrom!,
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

  async activateSpecial(importId: string, actorId: string) {
    const detail = await this.get(importId);
    if (detail.kind !== 'special') {
      throw new HttpError(
        400,
        'special_import_required',
        'This is not a Special Schedule import.',
      );
    }
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
    await this.assertSpecialDateAvailable(detail.specialDate!, importId);
    const staged = await this.mappedEntries(importId);
    const specialScheduleId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO special_schedules (
             id, date, name, status, source_file_name, source_file_sha256,
             created_by, activated_by, activated_at
           ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        )
        .bind(
          specialScheduleId,
          detail.specialDate,
          detail.name,
          detail.sourceFileName,
          detail.sourceFileSha256,
          actorId,
          actorId,
          now,
        ),
    ];
    for (const entry of staged) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO special_schedule_entries (
               id, special_schedule_id, staff_id, day_type, start_time, end_time,
               activity_type, category, description, room_id, requires_sub
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            specialScheduleId,
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
              SET status = 'activated', activated_special_schedule_id = ?, activated_at = ?
            WHERE id = ? AND status <> 'activated'`,
        )
        .bind(specialScheduleId, now, importId),
    );
    await this.db.batch(statements);
    return this.get(importId);
  }

  async deleteStaged(importId: string): Promise<void> {
    const detail = await this.get(importId);
    if (detail.status === 'activated') {
      throw new HttpError(
        409,
        'import_already_activated',
        'Activated import provenance is managed with its Schedule Version.',
      );
    }
    await this.db
      .prepare(`DELETE FROM schedule_imports WHERE id = ?`)
      .bind(importId)
      .run();
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
      kind: row.import_kind,
      name: row.schedule_name,
      sourceFileName: row.source_file_name,
      sourceFileSha256: row.source_file_sha256,
      status: row.status,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      specialDate: row.special_date,
      sheetName: row.sheet_name,
      aBDetected: row.a_b_detected === 1,
      createdAt: row.created_at,
      activatedScheduleVersionId: row.activated_schedule_version_id,
      activatedSpecialScheduleId: row.activated_special_schedule_id,
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

  private async mappedEntries(importId: string): Promise<StagedEntryRow[]> {
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
    return staged.results;
  }

  private async assertSpecialDateAvailable(
    date: string,
    excludeImportId = '',
  ): Promise<void> {
    const existing = await this.db
      .prepare(
        `SELECT name FROM special_schedules WHERE date = ?
         UNION ALL
         SELECT schedule_name AS name FROM schedule_imports
          WHERE import_kind = 'special' AND special_date = ?
            AND status <> 'activated' AND id <> ?
         LIMIT 1`,
      )
      .bind(date, date, excludeImportId)
      .first<{ name: string }>();
    if (existing) {
      throw new HttpError(
        409,
        'special_schedule_date_conflict',
        `${existing.name} is already configured for ${date}. Configure or remove that Special Schedule instead.`,
      );
    }
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

function scheduleConflict(version: ActiveVersionRow): HttpError {
  return new HttpError(
    409,
    'schedule_range_conflict',
    `The requested dates overlap ${version.name} (${version.effective_from} to ${version.effective_to ?? 'open-ended'}). Schedule Version ranges cannot be ambiguous.`,
  );
}
