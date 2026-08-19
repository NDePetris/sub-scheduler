PRAGMA foreign_keys = OFF;

-- Preserve children because D1 may apply ON DELETE cascades while rebuilding
-- daily_sub_plans even with foreign key enforcement disabled for the migration.
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
  CHECK (schedule_version_id IS NOT NULL OR special_schedule_id IS NOT NULL),
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
  id, date, day_type, schedule_version_id, special_schedule_id, status,
  created_by, created_at, updated_by, updated_at, finalized_by, finalized_at
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

PRAGMA foreign_keys = ON;
