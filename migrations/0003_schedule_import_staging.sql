CREATE TABLE schedule_imports (
  id TEXT PRIMARY KEY,
  source_file_name TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staged', 'ready', 'activated', 'failed')),
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  effective_to TEXT CHECK (
    effective_to IS NULL OR
    (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND effective_to >= effective_from)
  ),
  sheet_name TEXT,
  recognized_staff_count INTEGER NOT NULL DEFAULT 0 CHECK (recognized_staff_count >= 0),
  recognized_room_count INTEGER NOT NULL DEFAULT 0 CHECK (recognized_room_count >= 0),
  a_b_detected INTEGER NOT NULL DEFAULT 0 CHECK (a_b_detected IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_schedule_version_id TEXT REFERENCES schedule_versions(id),
  activated_at TEXT
) STRICT;

CREATE UNIQUE INDEX schedule_imports_source_hash
  ON schedule_imports (source_file_sha256, effective_from, COALESCE(effective_to, ''));
CREATE INDEX schedule_imports_status_created
  ON schedule_imports (status, created_at DESC);

CREATE TABLE schedule_import_staff (
  import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  display_value TEXT NOT NULL,
  staff_id TEXT REFERENCES staff(id),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('unmapped', 'exact', 'mapped', 'created')),
  PRIMARY KEY (import_id, display_value)
) STRICT;

CREATE TABLE schedule_import_rooms (
  import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  display_value TEXT NOT NULL,
  room_id TEXT REFERENCES rooms(id),
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('unmapped', 'exact', 'mapped', 'created')),
  PRIMARY KEY (import_id, display_value)
) STRICT;

CREATE TABLE staged_schedule_entries (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  source_sheet TEXT NOT NULL,
  source_cell TEXT NOT NULL,
  staff_display_value TEXT NOT NULL,
  room_display_value TEXT,
  day_type TEXT NOT NULL CHECK (day_type IN ('A', 'B', 'ALL')),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) <= '23'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) <= '23' AND start_time < end_time),
  activity_type TEXT NOT NULL CHECK (
    activity_type IN ('instruction', 'plan', 'admin', 'lunch', 'duty', 'after_school', 'other')
  ),
  category TEXT NOT NULL CHECK (
    category IN ('PRI', 'EL', 'INT', 'MS', 'HS', 'PLAN_ADMIN', 'LUNCH', 'AFTER_SCHOOL_OTHER')
  ),
  description TEXT NOT NULL,
  requires_sub INTEGER NOT NULL CHECK (requires_sub IN (0, 1)),
  UNIQUE (import_id, source_cell)
) STRICT;

CREATE INDEX staged_schedule_entries_import_staff_time
  ON staged_schedule_entries (import_id, staff_display_value, day_type, start_time, end_time);

CREATE TABLE schedule_import_issues (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  source_sheet TEXT,
  source_cell TEXT
) STRICT;

CREATE INDEX schedule_import_issues_import_severity
  ON schedule_import_issues (import_id, severity);

CREATE UNIQUE INDEX assignments_generated_source
  ON assignments (
    absence_id,
    COALESCE(source_schedule_entry_id, source_special_schedule_entry_id)
  );
