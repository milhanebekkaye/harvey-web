-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "energy_required" TEXT,
ADD COLUMN     "preferred_slot" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "energy_peak" TEXT;
