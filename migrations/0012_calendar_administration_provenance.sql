ALTER TABLE school_calendar_dates ADD COLUMN updated_by TEXT REFERENCES authorized_users(id);
ALTER TABLE school_calendar_dates ADD COLUMN updated_at TEXT;
