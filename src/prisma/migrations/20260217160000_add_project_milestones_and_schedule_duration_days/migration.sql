-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "milestones" JSONB,
ADD COLUMN     "schedule_duration_days" INTEGER;
