# Skip behavior

This document describes how task skipping works: API, cascade (or lack thereof), and dependency warnings in the UI.

## Single-task only (no cascade)

- **Skipping a task** is a single-task operation. When the user skips a task (e.g. Task A), only that task’s status is set to `skipped` and `skippedAt` is set.
- **Dependent tasks are not changed.** If Task B depends on Task A, skipping Task A does **not** automatically skip Task B. The API still returns `downstreamSkippedIds` in the response for compatibility, but it is always an empty array.

## API

- **Endpoint**: `PATCH /api/tasks/[taskId]`
- **Body**: `{ status: 'skipped' }` (optional: `skipReason`, `skipNotes`)
- **Response**: `{ success, task, downstreamSkippedIds? }` — `downstreamSkippedIds` is always `[]` (no cascade).

Implementation: `src/app/api/tasks/[taskId]/route.ts` calls `updateTask` in `src/lib/tasks/task-service.ts`. The service updates only the requested task; it does not call `getDownstreamDependentTaskIds` or perform any `updateMany` for dependents.

## Dependency warning in both views

When a task **depends on** another task that has been **skipped**, the UI shows a warning so the user can confirm they’ve completed the dependency before starting.

- **List View** (dashboard timeline list): The expanded task detail is rendered by `TaskDetails` (`src/components/dashboard/TaskDetails.tsx`). It receives `allTasks` (flattened from dashboard task groups). For each ID in `task.dependsOn`, if that task exists in `allTasks` and has `status === 'skipped'`, a red warning line is shown:  
  *Heads up — this task depends on "[skipped task title]" which was skipped. Make sure you've completed it before starting.*  
  One line per skipped dependency; no full “Dependencies” section.

- **Timeline View** (project timeline with active/upcoming cards): The active task detail is rendered by `ActiveTaskCard` (`src/components/timeline/ActiveTaskCard.tsx`). It already has a “Dependencies” section; when a dependency has `status === 'skipped'`, a red warning icon and the same-style message are shown for that dependency.

No extra API calls are made for the List View warning; dependency status is derived from the existing task list in dashboard state.
