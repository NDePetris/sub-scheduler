PRAGMA foreign_keys = OFF;

-- D1 may enforce cascades while applying migrations even when the PRAGMA is
-- present, so preserve every direct/indirect Daily Sub Plan child explicitly.
CREATE TABLE daily_sub_plan_assignments_backup AS SELECT * FROM assignments;
CREATE TABLE daily_sub_plan_segments_backup AS SELECT * FROM assignment_segments;
CREATE TABLE daily_sub_plan_messages_backup AS SELECT * FROM generated_messages;

CREATE TABLE daily_sub_plans_rebuilt (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  day_type TEXT NOT NULL CHECK (day_type IN ('A', 'B')),
  schedule_version_id TEXT REFERENCES schedule_versions(id),
  special_schedule_id TEXT REFERENCES special_schedules(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finalized_by TEXT REFERENCES authorized_users(id),
  finalized_at TEXT,
  CHECK ((schedule_version_id IS NOT NULL) <> (special_schedule_id IS NOT NULL)),
  CHECK (
    (finalized_at IS NULL AND finalized_by IS NULL) OR
    (finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
  ),
  CHECK (
    status = 'draft' OR
    (status = 'finalized' AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
  )
) STRICT;

INSERT INTO daily_sub_plans_rebuilt (
  id, date, day_type, schedule_version_id, special_schedule_id, status,
  created_by, created_at, updated_by, updated_at, finalized_by, finalized_at
)
SELECT
  id,
  date,
  day_type,
  CASE WHEN special_schedule_id IS NOT NULL THEN NULL ELSE schedule_version_id END,
  special_schedule_id,
  status,
  created_by,
  created_at,
  updated_by,
  updated_at,
  finalized_by,
  finalized_at
FROM daily_sub_plans;

DROP TABLE daily_sub_plans;
ALTER TABLE daily_sub_plans_rebuilt RENAME TO daily_sub_plans;

CREATE INDEX daily_sub_plans_schedule
  ON daily_sub_plans (schedule_version_id, special_schedule_id);

INSERT INTO assignments SELECT * FROM daily_sub_plan_assignments_backup;
INSERT INTO assignment_segments SELECT * FROM daily_sub_plan_segments_backup;
INSERT INTO generated_messages SELECT * FROM daily_sub_plan_messages_backup;

DROP TABLE daily_sub_plan_assignments_backup;
DROP TABLE daily_sub_plan_segments_backup;
DROP TABLE daily_sub_plan_messages_backup;

CREATE TABLE schedule_imports_rebuilt (
  id TEXT PRIMARY KEY,
  import_kind TEXT NOT NULL DEFAULT 'normal' CHECK (import_kind IN ('normal', 'special')),
  schedule_name TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staged', 'ready', 'activated', 'failed')),
  effective_from TEXT CHECK (
    effective_from IS NULL OR
    effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  effective_to TEXT CHECK (
    effective_to IS NULL OR
    (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND effective_to >= effective_from)
  ),
  special_date TEXT CHECK (
    special_date IS NULL OR
    special_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  sheet_name TEXT,
  recognized_staff_count INTEGER NOT NULL DEFAULT 0 CHECK (recognized_staff_count >= 0),
  recognized_room_count INTEGER NOT NULL DEFAULT 0 CHECK (recognized_room_count >= 0),
  a_b_detected INTEGER NOT NULL DEFAULT 0 CHECK (a_b_detected IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_schedule_version_id TEXT REFERENCES schedule_versions(id),
  activated_special_schedule_id TEXT REFERENCES special_schedules(id),
  activated_at TEXT,
  CHECK (
    (import_kind = 'normal' AND effective_from IS NOT NULL AND special_date IS NULL) OR
    (import_kind = 'special' AND effective_from IS NULL AND effective_to IS NULL AND special_date IS NOT NULL)
  ),
  CHECK ((activated_schedule_version_id IS NOT NULL) <> (activated_special_schedule_id IS NOT NULL) OR status <> 'activated')
) STRICT;

INSERT INTO schedule_imports_rebuilt (
  id, import_kind, schedule_name, source_file_name, source_file_sha256, status,
  effective_from, effective_to, special_date, sheet_name,
  recognized_staff_count, recognized_room_count, a_b_detected, created_by,
  created_at, activated_schedule_version_id, activated_special_schedule_id,
  activated_at
)
SELECT
  id,
  'normal',
  source_file_name,
  source_file_name,
  source_file_sha256,
  status,
  effective_from,
  effective_to,
  NULL,
  sheet_name,
  recognized_staff_count,
  recognized_room_count,
  a_b_detected,
  created_by,
  created_at,
  activated_schedule_version_id,
  NULL,
  activated_at
FROM schedule_imports;

DROP TABLE schedule_imports;
ALTER TABLE schedule_imports_rebuilt RENAME TO schedule_imports;

CREATE UNIQUE INDEX schedule_imports_normal_source_hash
  ON schedule_imports (source_file_sha256, effective_from, COALESCE(effective_to, ''))
  WHERE import_kind = 'normal';
CREATE UNIQUE INDEX schedule_imports_special_source_hash
  ON schedule_imports (source_file_sha256, special_date)
  WHERE import_kind = 'special';
CREATE INDEX schedule_imports_status_created
  ON schedule_imports (status, created_at DESC);

PRAGMA foreign_keys = ON;
