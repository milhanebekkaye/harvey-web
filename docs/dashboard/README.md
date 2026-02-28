# Dashboard (Tasks, Timeline, Chat Sidebar)

## What this feature is about
The dashboard is the main authenticated UI. It shows scheduled tasks (grouped by date), a chat sidebar with onboarding conversation history, and controls for task status and checklist updates. Tasks added via chat (Harvey's add_task tool) now receive 2–4 AI-generated success criteria, shown in the task detail view as checklist items—same format as onboarding-generated tasks.

## Files involved (and where to find them)
- `src/app/dashboard/page.tsx`
  - Dashboard page: fetches tasks and discussions, handles actions, and renders views.
- `src/components/dashboard/ChatSidebar.tsx`
  - Displays conversation history and includes “Rebuild schedule” action. Merges messages from useChat, dashboard (e.g. after Complete/Skip or check-in), feedback widgets, and optional streaming check-in; sorts by `createdAt` (ISO) so order is always chronological. Supports `messageType: 'check-in'` and `streamingCheckIn` for daily check-in. Auto-scrolls to the latest message. Completion/skip and reschedule-prompt widgets are not rendered when their stored message has `answered: true`.
- `src/components/dashboard/TimelineView.tsx`
  - Renders tasks grouped by date sections (Overdue, Today, Tomorrow, week days [rolling 7-day], Later, Unscheduled, Past at end). Past is collapsible via “Show past tasks (N)” at the top; past task cards use reduced opacity. Handles expansion; grouping uses user timezone (via task-service). Expanded task detail uses the same task from the list (no extra fetch on click). **Drag-and-drop**: When the dashboard passes `onReorder`, `availableWindows`, and `allTasks`, tasks in Overdue/Today/Tomorrow/weekDays/Later show a GripVertical handle; same-day and cross-day reorder is supported. Dependency violations cancel the drop and show a toast. See “List view reorder” below.
- `src/components/dashboard/TaskTile.tsx`
  - Compact task card, clickable to expand. Optional drag handle (GripVertical) on the left when `dragHandleProps` is provided (list view drag-and-drop).
- `src/components/dashboard/TaskDetails.tsx`
  - Expanded task details (description, checklist, actions).
- `src/components/dashboard/chat/CompletionFeedbackWidget.tsx`
  - “How long did it take?” widget after task completion. Uses single PATCH with ?returnProgressToday=true (response includes progress; fallback GET if absent). Builds acknowledgment: same day/overdue/future. Compares the completed task’s scheduled date to today (user timezone): same day → “That’s X/Y tasks done today”; overdue → “You’re catching up — good job finishing that one”; future → “You’re ahead of schedule — nice work.” Always appends “Next up: [task]” or “You’re all clear for now.”
- `src/components/dashboard/TaskChecklistItem.tsx`
  - Checklist UI with toggle support.
- `src/components/dashboard/CalendarView.tsx`
  - Placeholder for calendar view.
- `src/components/dashboard/ViewToggle.tsx`
  - Timeline/Calendar toggle and search input.
- `src/app/api/tasks/route.ts`
  - Fetch grouped tasks for the active project. GET response includes `tasks`, `projectId`, `projectTitle`, and `availableTime` (from `project.contextData.available_time`) for list-view reorder window lookup.
- `src/app/api/tasks/reorder/route.ts`
  - POST endpoint for list-view drag-and-drop reorder. Accepts `taskId`, `newDate`, `isFlexible`, `windowStart`, `windowEnd`, `destinationSiblingsOrder`, `sourceSiblingsOrder`; updates the dragged task and bulk-updates positions for destination and (when cross-day) source day.
- `src/app/api/tasks/[taskId]/route.ts`
  - Update a task’s status/title/description.
- `src/app/api/tasks/[taskId]/checklist/route.ts`
  - Update a task’s checklist state.
- `src/app/api/progress/today/route.ts`
  - Today’s progress and next task for completion feedback acknowledgment.
- `src/app/api/discussions/[projectId]/route.ts`
  - Fetch discussion history for the sidebar (including stored `answered` metadata on widget messages).
- `src/app/api/discussions/[projectId]/messages/route.ts`
  - Append a sidebar message. Supports optional `widgetAnswer: { widgetType, taskId }` so feedback-answer appends can mark the original widget message as `answered: true` in the same DB write. `widgetType` may be `completion_feedback`, `skip_feedback`, or `reschedule_prompt` (reschedule prompt is the “Yes, reschedule” / “No, leave it skipped” widget shown after skip).
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
5. Timeline view renders grouped tasks; user can expand tasks, complete/skip them, toggle checklist items, or **drag to reorder** (list view only; see “List view reorder” below).
6. Actions call:
  - `PATCH /api/tasks/[taskId]` for status updates.
  - `PATCH /api/tasks/[taskId]/checklist` for checklist updates.
  - `POST /api/tasks/reorder` for drag-and-drop reorder (list view).
7. Chat sidebar shows onboarding messages and exposes a “Rebuild schedule” button.
8. Rebuild calls `POST /api/schedule/reset-schedule` then redirects to `/loading?projectId=...`.
9. **Auto-refresh after chat tools**: When Harvey executes a tool via chat (e.g. add task, modify schedule, regenerate schedule), `ChatSidebar` detects it in `onFinish` and calls `onTasksChanged`, which triggers `fetchTasks()`. Timeline (and future calendar) views update immediately without manual reload.
10. **Daily check-in**: When the user has an active project and at least one task, and rate limit allows (no check-in in the last 3 hours or new calendar day), the dashboard calls `POST /api/chat/checkin`. The response streams as plain text; the sidebar shows it live at the bottom. When the stream ends, the client persists the message via `POST /api/discussions/[projectId]/messages` with `messageType: 'check-in'` and appends it to the chat. See `docs/checkin/README.md`.

## Function reference (what each function does)

### `src/app/dashboard/page.tsx`
- `fetchTasks()`
  - Calls `/api/tasks` and sets grouped task state. Redirects to `/onboarding` on `NO_PROJECT`.
- `fetchMessages(projectId)`
  - Calls `/api/discussions/[projectId]` and loads conversation history.
- `handleCompleteTask(taskId)` / `handleSkipTask(taskId)`
  - **Optimistic UI**: Update task status in local state and append the Harvey feedback message (with widget) to `appendedByDashboard` immediately. PATCH runs in the background; on failure the task is reverted and the user is alerted. On skip success, cascade-skipped task IDs from the response are applied to local state. Optional background `fetchTasks()` to sync.
  - Follow-up feedback answer messages from widget clicks (completion, skip, or reschedule prompt) append with `widgetAnswer` metadata so the matching widget message is persisted as answered and does not re-render after reload.
- `handleChecklistToggle(taskId, itemId, done)`
  - Optimistically updates checklist and persists via `/api/tasks/[taskId]/checklist`.
- `handleReorder(taskId, newDate, isFlexible, windowStart, windowEnd, destinationSiblingsOrder, sourceSiblingsOrder)`
  - Calls `POST /api/tasks/reorder` with the payload, then `fetchTasks()` to refresh the list. Used by TimelineView when the user drops a task in a new position or day.
- `handleSignOut()`
  - Calls `signOut()` and redirects to `/signin`.

### `src/app/api/tasks/route.ts`
- `GET(request)`
  - Authenticates user, resolves active project, returns grouped tasks, project info, and **availableTime** (from `project.contextData.available_time`) for reorder window lookup.

### `src/app/api/tasks/reorder/route.ts`
- `POST(request)`
  - Body: `taskId`, `newDate` (YYYY-MM-DD), `isFlexible`, `windowStart`, `windowEnd`, `destinationSiblingsOrder`, `sourceSiblingsOrder`. Updates the dragged task (position, scheduledDate, is_flexible, window_start/end; when flexible, scheduledStartTime/scheduledEndTime set to null) and bulk-updates 1-based positions for destination and, if non-empty, source day. Used by list view after drag-and-drop.

### `src/app/api/tasks/[taskId]/route.ts`
- `PATCH(request, { params })`
  - Validates ownership and updates task status/title/description. When `?returnProgressToday=true` is set, the response includes `progressToday` (same shape as GET `/api/progress/today`) so the completion feedback widget can avoid a separate GET.

### `src/app/api/tasks/[taskId]/checklist/route.ts`
- `PATCH(request, { params })`
  - Validates ownership and updates checklist JSON for a task.

### `src/app/api/progress/today/route.ts`
- `GET()`
  - Returns today’s progress (completed, skipped, pending, total), userTimezone, and nextTask (first pending today or nearest upcoming). Used by the completion feedback widget to build the Harvey acknowledgment after “how long did it take?”

### `src/lib/tasks/task-service.ts`
- `getActiveProject(userId)`
  - Returns most recent active project for user.
- `getTasksForProject(projectId, userId)`
  - Fetches tasks for a project with ownership check.
- `transformToDashboardTask(dbTask)`
  - Converts DB task to UI display format.
- `groupTasksByDate(tasks, userTimezone)`
  - Groups tasks into past, overdue, today, tomorrow, weekDays (rolling 7-day window), later, unscheduled. Uses user timezone for “today” so Past (completed from previous days), Overdue, and Today are correct.
- `getGroupedTasks(userId)`
  - Orchestrates active project lookup + task fetch + transform + grouping.
- `getTodayProgress(userId)`
  - Returns today’s counts (completed, skipped, pending, total), userTimezone, and nextTask (first pending today or nearest upcoming). Used by completion feedback acknowledgment.
- `updateTask(taskId, userId, data)`
  - Updates task fields and sets completedAt/skippedAt timestamps.
- `updateTaskChecklist(taskId, userId, checklist)`
  - Updates JSON checklist and `updatedAt`.

## Data models used (from Prisma schema)
- `Task`: scheduled dates/times and status used to render timeline view.
- `Project`: active project resolved for dashboard; `contextData.available_time` used for reorder window lookup.
- `Discussion`: messages for sidebar.

## List view reorder (drag-and-drop)

When the dashboard passes `onReorder`, `availableWindows`, and `allTasks` to TimelineView, the list view uses **@dnd-kit** (core, sortable, utilities) for drag-and-drop reordering.

- **Valid drags**: Same-day reorder (move a task before/after another on the same day) and cross-day move (e.g. from Today to Tomorrow). Only **pending**, **focus**, **urgent**, or **in_progress** tasks are draggable; completed and skipped tasks are not. Past and Unscheduled sections do not show drag handles.
- **Trigger**: Only the **GripVertical** handle on the left of the task card starts a drag; clicking elsewhere still expands the task (PointerSensor `activationConstraint: { distance: 8 }`).
- **On drop – same day**: Positions are recomputed for that day (1-based). If the dragged task was fixed (`is_flexible === false`), it is converted to flexible: `scheduledStartTime`/`scheduledEndTime` set to null, `window_start`/`window_end` set from the day’s availability window (from `availableTime`). If already flexible, only position is updated.
- **On drop – cross-day**: The task’s `scheduledDate` is set to the destination day; it is always stored as flexible with `window_start`/`window_end` for the destination day; position is set at the drop index; positions are recomputed for both source and destination days.
- **Availability window**: For a given date, the client looks up the day name (e.g. `saturday`) in `availableTime`; if multiple blocks exist for that day, the earliest start and latest end are used; if none, fallback is `09:00`–`23:59`.
- **Dependency hard block**: Before applying a drop, the client checks that (1) every task the dragged task depends on (`depends_on`) is before it (earlier date or same date with lower position), and (2) every task that depends on the dragged task is after it. If any check fails, the drop is cancelled, the task snaps back, and a toast is shown: *“Can’t reorder: ‘[dependency task title]’ must come first.”*
- **Persistence**: TimelineView calls `onReorder(...)` with the computed payload; the dashboard’s `handleReorder` sends `POST /api/tasks/reorder` then `fetchTasks()` to refresh.

## Gaps / Not found in repo
- Calendar view implementation is a placeholder.
- Search input does not filter tasks in code shown here.
