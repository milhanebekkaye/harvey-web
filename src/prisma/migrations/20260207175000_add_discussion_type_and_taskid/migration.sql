-- Add type and taskId columns to discussions (for onboarding vs project vs task separation)
-- Uses conditional logic for idempotency if columns were added via db push

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'discussions' AND column_name = 'type') THEN
    ALTER TABLE "discussions" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'discussions' AND column_name = 'taskId') THEN
    ALTER TABLE "discussions" ADD COLUMN "taskId" TEXT;
  END IF;
END $$;
