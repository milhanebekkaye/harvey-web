-- Add User enrichment columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_session_length" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "communication_style" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "userNotes" JSONB;

-- Add Project enrichment columns
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "target_deadline" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "skill_level" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tools_and_stack" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "project_type" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "weekly_hours_commitment" INTEGER;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "motivation" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "phases" JSONB;

-- Convert projectNotes from TEXT to JSONB, preserving existing data as single-entry array
ALTER TABLE "projects" ALTER COLUMN "projectNotes" TYPE JSONB USING (
  CASE
    WHEN "projectNotes" IS NULL THEN NULL
    ELSE jsonb_build_array(
      jsonb_build_object(
        'note', "projectNotes",
        'extracted_at', to_jsonb((now() AT TIME ZONE 'UTC')::timestamptz)
      )
    )
  END
);
