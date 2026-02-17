-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "is_flexible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "window_end" TEXT,
ADD COLUMN     "window_start" TEXT;
