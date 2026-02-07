-- AlterTable
-- Replace dependencies (JSONB) with depends_on (TEXT[]). Existing data in dependencies is not migrated.
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "dependencies";
ALTER TABLE "tasks" ADD COLUMN "depends_on" TEXT[] DEFAULT ARRAY[]::TEXT[];
