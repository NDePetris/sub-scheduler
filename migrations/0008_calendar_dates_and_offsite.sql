CREATE TABLE school_calendar_dates (
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  expected_day_type TEXT CHECK (expected_day_type IS NULL OR expected_day_type IN ('A', 'B')),
  is_school_day INTEGER NOT NULL DEFAULT 1 CHECK (is_school_day IN (0, 1)),
  is_blackout_day INTEGER NOT NULL DEFAULT 0 CHECK (is_blackout_day IN (0, 1)),
  expects_special_schedule INTEGER NOT NULL DEFAULT 0 CHECK (expects_special_schedule IN (0, 1)),
  label TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual_import',
  imported_by TEXT REFERENCES authorized_users(id),
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (is_school_day = 1 OR expected_day_type IS NULL)
) STRICT;

CREATE INDEX school_calendar_dates_school_day ON school_calendar_dates (is_school_day, date);
CREATE INDEX school_calendar_dates_special_expectation ON school_calendar_dates (expects_special_schedule, date);

PRAGMA foreign_keys = OFF;

CREATE TABLE schedule_entries_new (
  id TEXT PRIMARY KEY, schedule_version_id TEXT NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id), day_type TEXT NOT NULL CHECK (day_type IN ('A','B','ALL')),
  start_time TEXT NOT NULL, end_time TEXT NOT NULL CHECK (start_time < end_time),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('instruction','plan','admin','lunch','duty','after_school','off_site','other')),
  category TEXT NOT NULL, description TEXT NOT NULL, room_id TEXT REFERENCES rooms(id),
  requires_sub INTEGER NOT NULL DEFAULT 0 CHECK (requires_sub IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (schedule_version_id, staff_id, day_type, start_time, end_time, description)
) STRICT;
INSERT INTO schedule_entries_new SELECT * FROM schedule_entries;
DROP TABLE schedule_entries;
ALTER TABLE schedule_entries_new RENAME TO schedule_entries;
CREATE INDEX schedule_entries_staff_time ON schedule_entries (schedule_version_id, staff_id, day_type, start_time, end_time);

CREATE TABLE special_schedule_entries_new (
  id TEXT PRIMARY KEY, special_schedule_id TEXT NOT NULL REFERENCES special_schedules(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES staff(id), day_type TEXT NOT NULL CHECK (day_type IN ('A','B','ALL')),
  start_time TEXT NOT NULL, end_time TEXT NOT NULL CHECK (start_time < end_time),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('instruction','plan','admin','lunch','duty','after_school','off_site','other')),
  category TEXT NOT NULL, description TEXT NOT NULL, room_id TEXT REFERENCES rooms(id),
  requires_sub INTEGER NOT NULL DEFAULT 0 CHECK (requires_sub IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (special_schedule_id, staff_id, day_type, start_time, end_time, description)
) STRICT;
INSERT INTO special_schedule_entries_new SELECT * FROM special_schedule_entries;
DROP TABLE special_schedule_entries;
ALTER TABLE special_schedule_entries_new RENAME TO special_schedule_entries;
CREATE INDEX special_schedule_entries_staff_time ON special_schedule_entries (special_schedule_id, staff_id, day_type, start_time, end_time);

CREATE TABLE staged_schedule_entries_new (
  id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES schedule_imports(id) ON DELETE CASCADE,
  source_sheet TEXT NOT NULL, source_cell TEXT NOT NULL, staff_display_value TEXT NOT NULL, room_display_value TEXT,
  day_type TEXT NOT NULL CHECK (day_type IN ('A','B','ALL')), start_time TEXT NOT NULL, end_time TEXT NOT NULL CHECK (start_time < end_time),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('instruction','plan','admin','lunch','duty','after_school','off_site','other')),
  category TEXT NOT NULL, description TEXT NOT NULL, requires_sub INTEGER NOT NULL CHECK (requires_sub IN (0,1)),
  UNIQUE (import_id, source_cell)
) STRICT;
INSERT INTO staged_schedule_entries_new SELECT * FROM staged_schedule_entries;
DROP TABLE staged_schedule_entries;
ALTER TABLE staged_schedule_entries_new RENAME TO staged_schedule_entries;
CREATE INDEX staged_schedule_entries_import_staff_time ON staged_schedule_entries (import_id, staff_display_value, day_type, start_time, end_time);

PRAGMA foreign_keys = ON;
