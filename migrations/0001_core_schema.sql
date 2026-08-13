PRAGMA foreign_keys = ON;

CREATE TABLE authorized_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'administrator' CHECK (role = 'administrator'),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  can_sub INTEGER NOT NULL DEFAULT 1 CHECK (can_sub IN (0, 1)),
  is_school_sub INTEGER NOT NULL DEFAULT 0 CHECK (is_school_sub IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX staff_one_active_school_sub
  ON staff (is_school_sub)
  WHERE is_school_sub = 1 AND is_active = 1;
CREATE INDEX staff_active_name ON staff (is_active, display_name);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE schedule_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  effective_to TEXT CHECK (
    effective_to IS NULL OR
    (effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND effective_to >= effective_from)
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  source_file_name TEXT,
  source_file_sha256 TEXT,
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_by TEXT REFERENCES authorized_users(id),
  activated_at TEXT
) STRICT;

CREATE INDEX schedule_versions_effective_dates
  ON schedule_versions (status, effective_from, effective_to);

CREATE TABLE schedule_entries (
  id TEXT PRIMARY KEY,
  schedule_version_id TEXT NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id),
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
  room_id TEXT REFERENCES rooms(id),
  requires_sub INTEGER NOT NULL DEFAULT 0 CHECK (requires_sub IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (schedule_version_id, staff_id, day_type, start_time, end_time, description)
) STRICT;

CREATE INDEX schedule_entries_staff_time
  ON schedule_entries (schedule_version_id, staff_id, day_type, start_time, end_time);

CREATE TABLE special_schedules (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  source_file_name TEXT,
  source_file_sha256 TEXT,
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  activated_by TEXT REFERENCES authorized_users(id),
  activated_at TEXT
) STRICT;

CREATE INDEX special_schedules_date_status ON special_schedules (date, status);

CREATE TABLE special_schedule_entries (
  id TEXT PRIMARY KEY,
  special_schedule_id TEXT NOT NULL REFERENCES special_schedules(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id),
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
  room_id TEXT REFERENCES rooms(id),
  requires_sub INTEGER NOT NULL DEFAULT 0 CHECK (requires_sub IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (special_schedule_id, staff_id, day_type, start_time, end_time, description)
) STRICT;

CREATE INDEX special_schedule_entries_staff_time
  ON special_schedule_entries (special_schedule_id, staff_id, day_type, start_time, end_time);

CREATE TABLE absences (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK (
    end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND start_date <= end_date
  ),
  start_time TEXT CHECK (start_time IS NULL OR (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) <= '23')),
  end_time TEXT CHECK (end_time IS NULL OR (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) <= '23')),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND start_date = end_date AND start_time < end_time)
  )
) STRICT;

CREATE INDEX absences_staff_dates ON absences (staff_id, start_date, end_date);
CREATE INDEX absences_date_range ON absences (start_date, end_date);

CREATE TABLE daily_sub_plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  day_type TEXT NOT NULL CHECK (day_type IN ('A', 'B')),
  schedule_version_id TEXT NOT NULL REFERENCES schedule_versions(id),
  special_schedule_id TEXT REFERENCES special_schedules(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finalized_by TEXT REFERENCES authorized_users(id),
  finalized_at TEXT,
  CHECK (
    (status = 'draft' AND finalized_at IS NULL AND finalized_by IS NULL) OR
    (status = 'finalized' AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
  )
) STRICT;

CREATE INDEX daily_sub_plans_schedule ON daily_sub_plans (schedule_version_id, special_schedule_id);

CREATE TABLE default_sub_plans (
  id TEXT PRIMARY KEY,
  absent_staff_id TEXT NOT NULL REFERENCES staff(id),
  day_type TEXT CHECK (day_type IS NULL OR day_type IN ('A', 'B')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  created_by TEXT NOT NULL REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX default_sub_plans_staff_day_version
  ON default_sub_plans (absent_staff_id, COALESCE(day_type, 'ALL'), version);
CREATE INDEX default_sub_plans_lookup ON default_sub_plans (absent_staff_id, day_type, status);

CREATE TABLE default_sub_plan_actions (
  id TEXT PRIMARY KEY,
  default_sub_plan_id TEXT NOT NULL REFERENCES default_sub_plans(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) <= '23'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) <= '23' AND start_time < end_time),
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'teacher_covers', 'redistribute_class', 'switch_groups', 'combine_class',
      'move_room', 'cover_duty', 'leave_uncovered', 'manual_unresolved'
    )
  ),
  assigned_staff_id TEXT REFERENCES staff(id),
  room_id TEXT REFERENCES rooms(id),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (default_sub_plan_id, sequence)
) STRICT;

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  daily_sub_plan_id TEXT NOT NULL REFERENCES daily_sub_plans(id) ON DELETE CASCADE,
  absence_id TEXT NOT NULL REFERENCES absences(id),
  source_schedule_entry_id TEXT REFERENCES schedule_entries(id),
  source_special_schedule_entry_id TEXT REFERENCES special_schedule_entries(id),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) <= '23'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) <= '23' AND start_time < end_time),
  responsibility_type TEXT NOT NULL CHECK (responsibility_type IN ('instruction', 'duty', 'after_school', 'other')),
  description TEXT NOT NULL,
  room_id TEXT REFERENCES rooms(id),
  default_action_id TEXT REFERENCES default_sub_plan_actions(id),
  assigned_staff_id TEXT REFERENCES staff(id),
  resolution_type TEXT CHECK (
    resolution_type IS NULL OR resolution_type IN (
      'teacher_cover', 'redistribution', 'switch_groups', 'combine_class', 'move_room',
      'duty_coverage', 'intentional_uncovered', 'manual_override', 'split_coverage'
    )
  ),
  resolution_details_json TEXT CHECK (resolution_details_json IS NULL OR json_valid(resolution_details_json)),
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'assigned', 'intentionally_uncovered')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  conflict_explanation TEXT,
  override_acknowledged_at TEXT,
  override_acknowledged_by TEXT REFERENCES authorized_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((source_schedule_entry_id IS NOT NULL) <> (source_special_schedule_entry_id IS NOT NULL)),
  CHECK (
    (override_acknowledged_at IS NULL AND override_acknowledged_by IS NULL) OR
    (override_acknowledged_at IS NOT NULL AND override_acknowledged_by IS NOT NULL)
  )
) STRICT;

CREATE INDEX assignments_plan_status ON assignments (daily_sub_plan_id, status, start_time);
CREATE INDEX assignments_absence ON assignments (absence_id);
CREATE INDEX assignments_staff_workload ON assignments (assigned_staff_id, status, daily_sub_plan_id);

CREATE TABLE assignment_segments (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) <= '23'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) <= '23' AND start_time < end_time),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (assignment_id, sequence)
) STRICT;

CREATE INDEX assignment_segments_staff_time ON assignment_segments (staff_id, start_time, end_time);

CREATE TABLE generated_messages (
  id TEXT PRIMARY KEY,
  daily_sub_plan_id TEXT NOT NULL REFERENCES daily_sub_plans(id) ON DELETE CASCADE,
  generated_text TEXT NOT NULL,
  edited_text TEXT NOT NULL,
  generated_by TEXT NOT NULL REFERENCES authorized_users(id),
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX generated_messages_plan_time ON generated_messages (daily_sub_plan_id, generated_at DESC);

CREATE TABLE application_settings (
  id TEXT PRIMARY KEY CHECK (id = 'school'),
  school_name TEXT NOT NULL,
  school_logo_url TEXT,
  school_timezone TEXT NOT NULL,
  workload_warning_threshold REAL NOT NULL DEFAULT 5.0 CHECK (workload_warning_threshold > 0),
  workload_window_days INTEGER NOT NULL DEFAULT 7 CHECK (workload_window_days > 0),
  split_snap_minutes INTEGER NOT NULL DEFAULT 10 CHECK (split_snap_minutes > 0),
  message_template TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES authorized_users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
