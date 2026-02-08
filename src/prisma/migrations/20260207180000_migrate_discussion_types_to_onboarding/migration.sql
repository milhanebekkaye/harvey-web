-- Migrate existing discussions to type = 'onboarding'
-- Per the discussion type separation plan: onboarding discussions are created during intake.
-- Project discussions will be created when schedule is generated (with Harvey greeting).
-- All existing discussions are treated as onboarding (created before this migration).

UPDATE "discussions"
SET type = 'onboarding'
WHERE type = 'project'
   OR type IS NULL;
