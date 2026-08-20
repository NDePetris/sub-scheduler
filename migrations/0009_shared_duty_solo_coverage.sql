-- A structural key links absence-created records that describe one shared
-- non-instructional responsibility in a pinned schedule context. SQLite needs
-- a rebuild to extend the existing checked resolution-type vocabulary.
PRAGMA foreign_keys = OFF;

CREATE TABLE assignments_new (
  id TEXT PRIMARY KEY,
  daily_sub_plan_id TEXT NOT NULL REFERENCES daily_sub_plans(id) ON DELETE CASCADE,
  absence_id TEXT NOT NULL REFERENCES absences(id),
  source_schedule_entry_id TEXT REFERENCES schedule_entries(id),
  source_special_schedule_entry_id TEXT REFERENCES special_schedule_entries(id),
  start_time TEXT NOT NULL CHECK (start_time < end_time),
  end_time TEXT NOT NULL,
  responsibility_type TEXT NOT NULL CHECK (responsibility_type IN ('instruction', 'duty', 'after_school', 'other')),
  description TEXT NOT NULL,
  room_id TEXT REFERENCES rooms(id),
  default_action_id TEXT REFERENCES default_sub_plan_actions(id),
  assigned_staff_id TEXT REFERENCES staff(id),
  resolution_type TEXT CHECK (resolution_type IS NULL OR resolution_type IN (
    'teacher_cover', 'redistribution', 'switch_groups', 'combine_class', 'move_room',
    'duty_coverage', 'intentional_uncovered', 'manual_override', 'split_coverage', 'solo_coverage'
  )),
  resolution_details_json TEXT CHECK (resolution_details_json IS NULL OR json_valid(resolution_details_json)),
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'assigned', 'intentionally_uncovered')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  conflict_explanation TEXT,
  override_acknowledged_at TEXT,
  override_acknowledged_by TEXT REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  shared_responsibility_key TEXT,
  counts_toward_workload INTEGER NOT NULL DEFAULT 1 CHECK (counts_toward_workload IN (0, 1)),
  CHECK ((source_schedule_entry_id IS NOT NULL) <> (source_special_schedule_entry_id IS NOT NULL)),
  CHECK ((override_acknowledged_at IS NULL AND override_acknowledged_by IS NULL) OR (override_acknowledged_at IS NOT NULL AND override_acknowledged_by IS NOT NULL))
) STRICT;

INSERT INTO assignments_new (
  id, daily_sub_plan_id, absence_id, source_schedule_entry_id, source_special_schedule_entry_id,
  start_time, end_time, responsibility_type, description, room_id, default_action_id,
  assigned_staff_id, resolution_type, resolution_details_json, status, is_default,
  conflict_explanation, override_acknowledged_at, override_acknowledged_by, created_at, updated_by, updated_at
) SELECT
  id, daily_sub_plan_id, absence_id, source_schedule_entry_id, source_special_schedule_entry_id,
  start_time, end_time, responsibility_type, description, room_id, default_action_id,
  assigned_staff_id, resolution_type, resolution_details_json, status, is_default,
  conflict_explanation, override_acknowledged_at, override_acknowledged_by, created_at, updated_by, updated_at
  FROM assignments;

DROP TABLE assignments;
ALTER TABLE assignments_new RENAME TO assignments;
CREATE INDEX assignments_plan_status ON assignments (daily_sub_plan_id, status, start_time);
CREATE INDEX assignments_absence ON assignments (absence_id);
CREATE INDEX assignments_staff_workload ON assignments (assigned_staff_id, status, daily_sub_plan_id);
CREATE UNIQUE INDEX assignments_generated_source ON assignments (
  daily_sub_plan_id, absence_id, COALESCE(source_schedule_entry_id, source_special_schedule_entry_id)
);
CREATE INDEX assignments_shared_responsibility ON assignments (daily_sub_plan_id, shared_responsibility_key, status);

PRAGMA foreign_keys = ON;
