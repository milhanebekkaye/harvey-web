-- =============================================================================
-- MANUAL MIGRATION: Discussion type separation
-- =============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) if Prisma migrate
-- fails with TLS/certificate errors.
--
-- This applies the same changes as migrations:
-- - 20260207175000_add_discussion_type_and_taskid
-- - 20260207180000_migrate_discussion_types_to_onboarding
--
-- After running, mark migrations as applied (optional, for migrate history):
--   npx prisma migrate resolve --applied "20260207175000_add_discussion_type_and_taskid"
--   npx prisma migrate resolve --applied "20260207180000_migrate_discussion_types_to_onboarding"
-- =============================================================================

-- 1. Add type and taskId columns to discussions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'discussions' AND column_name = 'type') THEN
    ALTER TABLE "discussions" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'discussions' AND column_name = 'taskId') THEN
    ALTER TABLE "discussions" ADD COLUMN "taskId" TEXT;
  END IF;
END $$;

-- 2. Mark existing discussions as onboarding (project discussions created at schedule generation)
UPDATE "discussions"
SET type = 'onboarding'
WHERE type = 'project'
   OR type IS NULL;
