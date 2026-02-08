-- Sync drifted columns: added to schema/DB via db push but never migrated.
-- Uses IF NOT EXISTS for idempotency (columns may already exist in DB).

DO $$
BEGIN
  -- projects
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'projectNotes') THEN
    ALTER TABLE "projects" ADD COLUMN "projectNotes" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'generationCount') THEN
    ALTER TABLE "projects" ADD COLUMN "generationCount" INTEGER NOT NULL DEFAULT 1;
  END IF;
  -- tasks
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'actualDuration') THEN
    ALTER TABLE "tasks" ADD COLUMN "actualDuration" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'batchNumber') THEN
    ALTER TABLE "tasks" ADD COLUMN "batchNumber" INTEGER NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'completionNotes') THEN
    ALTER TABLE "tasks" ADD COLUMN "completionNotes" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'skipNotes') THEN
    ALTER TABLE "tasks" ADD COLUMN "skipNotes" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'skipReason') THEN
    ALTER TABLE "tasks" ADD COLUMN "skipReason" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'startedAt') THEN
    ALTER TABLE "tasks" ADD COLUMN "startedAt" TIMESTAMP(3);
  END IF;
END $$;
