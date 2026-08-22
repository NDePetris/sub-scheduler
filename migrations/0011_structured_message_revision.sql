-- Generated communication is tied to a specific structured-plan revision.
-- Existing messages intentionally start without a source revision so the next
-- review can refresh them safely instead of assuming they are current.
ALTER TABLE daily_sub_plans
  ADD COLUMN structured_revision INTEGER NOT NULL DEFAULT 0
  CHECK (structured_revision >= 0);

ALTER TABLE generated_messages
  ADD COLUMN source_plan_revision INTEGER
  CHECK (source_plan_revision IS NULL OR source_plan_revision >= 0);
