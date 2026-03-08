-- AlterTable: User - rest_days and oneOffBlocks for contextData migration
ALTER TABLE "users" ADD COLUMN     "rest_days" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "oneOffBlocks" JSONB;

-- AlterTable: Project - exclusions for contextData migration
ALTER TABLE "projects" ADD COLUMN     "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[];
