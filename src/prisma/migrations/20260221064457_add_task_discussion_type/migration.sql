-- AddForeignKey
ALTER TABLE "discussions" ADD CONSTRAINT "discussions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
