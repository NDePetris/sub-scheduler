DROP INDEX assignments_generated_source;

CREATE UNIQUE INDEX assignments_generated_source
  ON assignments (
    daily_sub_plan_id,
    absence_id,
    COALESCE(source_schedule_entry_id, source_special_schedule_entry_id)
  );
