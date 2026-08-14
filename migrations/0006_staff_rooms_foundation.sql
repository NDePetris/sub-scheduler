DROP INDEX IF EXISTS staff_one_active_school_sub;

UPDATE staff SET can_sub = 1 WHERE is_school_sub = 1 AND can_sub = 0;

ALTER TABLE staff ADD COLUMN standard_period_minutes INTEGER
  CHECK (standard_period_minutes IS NULL OR standard_period_minutes > 0);

CREATE TABLE staff_aliases (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  display_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (staff_id, normalized_value),
  UNIQUE (normalized_value)
) STRICT;

CREATE INDEX staff_aliases_staff ON staff_aliases (staff_id, display_value);

CREATE INDEX staff_candidate_configuration
  ON staff (is_active, can_sub, is_school_sub, display_name);

CREATE TRIGGER staff_school_sub_requires_can_sub_insert
BEFORE INSERT ON staff
WHEN NEW.is_school_sub = 1 AND NEW.can_sub = 0
BEGIN
  SELECT RAISE(ABORT, 'School Sub must be eligible to sub');
END;

CREATE TRIGGER staff_school_sub_requires_can_sub_update
BEFORE UPDATE OF can_sub, is_school_sub ON staff
WHEN NEW.is_school_sub = 1 AND NEW.can_sub = 0
BEGIN
  SELECT RAISE(ABORT, 'School Sub must be eligible to sub');
END;
