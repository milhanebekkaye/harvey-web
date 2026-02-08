# Dashboard (Tasks, Timeline, Chat Sidebar)

## What this feature is about
The dashboard is the main authenticated UI. It shows scheduled tasks (grouped by date), a chat sidebar with onboarding conversation history, and controls for task status and checklist updates. Tasks added via chat (Harvey's add_task tool) now receive 2–4 AI-generated success criteria, shown in the task detail view as checklist items—same format as onboarding-generated tasks.

## Files involved (and where to find them)
- `src/app/dashboard/page.tsx`
  - Dashboard page: fetches tasks and discussions, handles actions, and renders views.
- `src/components/dashboard/ChatSidebar.tsx`
  - Displays conversation history and includes “Rebuild schedule” action.
- `src/components/dashboard/TimelineView.tsx`
  - Renders tasks grouped by date sections and handles expansion.
- `src/components/dashboard/TaskTile.tsx`
  - Compact task card, clickable to expand.
- `src/components/dashboard/TaskDetails.tsx`
  - Expanded task details (description, checklist, actions).
- `src/components/dashboard/TaskChecklistItem.tsx`
  - Checklist UI with toggle support.
- `src/components/dashboard/CalendarView.tsx`
  - Placeholder for calendar view.
- `src/components/dashboard/ViewToggle.tsx`
  - Timeline/Calendar toggle and search input.
- `src/app/api/tasks/route.ts`
  - Fetch grouped tasks for the active project.
- `src/app/api/tasks/[taskId]/route.ts`
  - Update a task’s status/title/description.
- `src/app/api/tasks/[taskId]/checklist/route.ts`
  - Update a task’s checklist state.
- `src/app/api/discussions/[projectId]/route.ts`
  - Fetch discussion history for the sidebar.
- `src/app/api/schedule/reset-schedule/route.ts`
  - Deletes tasks for a project (used by rebuild flow).
- `src/lib/tasks/task-service.ts`
  - Task fetching, grouping, and updates.
- `src/types/task.types.ts`
  - Task type definitions for UI.
- `src/types/chat.types.ts`
  - Chat message types used in sidebar.

## Feature flow (end-to-end)
1. User visits `/dashboard`.
2. `DashboardPage` calls `GET /api/tasks`.
3. `Tasks API` authenticates user, finds active project, groups tasks, returns task groups.
4. `DashboardPage` sets tasks + project info and fetches discussion history via `GET /api/discussions/[projectId]`.
5. Timeline view renders grouped tasks; user can expand tasks, complete/skip them, or toggle checklist items.
6. Actions call:
   - `PATCH /api/tasks/[taskId]` for status updates.
   - `PATCH /api/tasks/[taskId]/checklist` for checklist updates.
7. Chat sidebar shows onboarding messages and exposes a “Rebuild schedule” button.
8. Rebuild calls `POST /api/schedule/reset-schedule` then redirects to `/loading?projectId=...`.
9. **Auto-refresh after chat tools**: When Harvey executes a tool via chat (e.g. add task, modify schedule, regenerate schedule), `ChatSidebar` detects it in `onFinish` and calls `onTasksChanged`, which triggers `fetchTasks()`. Timeline (and future calendar) views update immediately without manual reload.

## Function reference (what each function does)

### `src/app/dashboard/page.tsx`
- `fetchTasks()`
  - Calls `/api/tasks` and sets grouped task state. Redirects to `/onboarding` on `NO_PROJECT`.
- `fetchMessages(projectId)`
  - Calls `/api/discussions/[projectId]` and loads conversation history.
- `handleCompleteTask(taskId)` / `handleSkipTask(taskId)`
  - PATCH task status then refresh tasks.
- `handleChecklistToggle(taskId, itemId, done)`
  - Optimistically updates checklist and persists via `/api/tasks/[taskId]/checklist`.
- `handleSignOut()`
  - Calls `signOut()` and redirects to `/signin`.

### `src/app/api/tasks/route.ts`
- `GET(request)`
  - Authenticates user, resolves active project, returns grouped tasks and project info.

### `src/app/api/tasks/[taskId]/route.ts`
- `PATCH(request, { params })`
  - Validates ownership and updates task status/title/description.

### `src/app/api/tasks/[taskId]/checklist/route.ts`
- `PATCH(request, { params })`
  - Validates ownership and updates checklist JSON for a task.

### `src/lib/tasks/task-service.ts`
- `getActiveProject(userId)`
  - Returns most recent active project for user.
- `getTasksForProject(projectId, userId)`
  - Fetches tasks for a project with ownership check.
- `transformToDashboardTask(dbTask)`
  - Converts DB task to UI display format.
- `groupTasksByDate(tasks)`
  - Groups tasks into overdue, today, tomorrow, weekDays, nextWeek, later, unscheduled.
- `getGroupedTasks(userId)`
  - Orchestrates active project lookup + task fetch + transform + grouping.
- `updateTask(taskId, userId, data)`
  - Updates task fields and sets completedAt/skippedAt timestamps.
- `updateTaskChecklist(taskId, userId, checklist)`
  - Updates JSON checklist and `updatedAt`.

## Data models used (from Prisma schema)
- `Task`: scheduled dates/times and status used to render timeline view.
- `Project`: active project resolved for dashboard.
- `Discussion`: messages for sidebar.

## Gaps / Not found in repo
- Calendar view implementation is a placeholder.
- Search input does not filter tasks in code shown here.
