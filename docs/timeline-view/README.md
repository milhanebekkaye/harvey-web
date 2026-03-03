# Timeline View (Steps 1-4 Complete)

## Overview
Timeline View is now fully implemented as the primary dashboard view mode. It is split into reusable components, powered by real task data, and includes an AI-generated “Harvey’s Tip” for the active task.

## Task ordering and audit logs (2026-02-27, effective start + gap)

- **Where tasks are fetched**: `GET /api/timeline` (see `src/app/api/timeline/route.ts`) calls `getTimelineData(projectId, userId)` in `src/lib/timeline/get-timeline-data.ts`. No other API is used for the Timeline View rail (completed / active / upcoming).
- **Where tasks are sorted**: All ordering for the timeline rail happens in **`src/lib/timeline/get-timeline-data.ts`** via **`compareTasksChronologically()`**. No DB `orderBy` for active or upcoming; the comparator receives the full list as fourth argument for gap calculation.
- **Sort rule (plain English)**:
  - **Across days**: `scheduledDate` asc.
  - **Effective start**: Fixed task = `scheduledStartTime` (in user TZ, decimal hours). Flexible task = `window_start` string parsed to decimal hours (e.g. "09:00" → 9, "14:30" → 14.5).
  - **Same day, flexible vs fixed**: gap = (earliest fixed start on that day) − (flexible effective start). If gap ≥ flexible task’s duration in hours → flexible sorts first (it fits before the fixed task). Otherwise fixed sorts first, then flexible.
  - **Among flexible**: `position` asc when both tasks have a position value; if only one has position it sorts first; if neither has position, falls back to `createdAt` asc. (Dependency order was previously used here but replaced by position so drag-and-drop reordering in the list view affects the timeline.)
  - **Among fixed**: `scheduledStartTime` asc.
  - **Legacy**: `is_flexible ?? false` → treated as fixed.
- **Active task**: All pending with non-null `scheduledDate` are fetched (with `estimatedDuration`, `window_start`, `window_end`), sorted with `compareTasksChronologically(..., allTasks)`; first = active candidate. If it has **unmet dependencies**, those are fetched and sorted the same way; first = active (`reason: 'unmet-dependency'`).
- **Upcoming**: Pending (excluding active), filtered to “from now”, sorted with same comparator and list; then dependency-aware pass; first two taken.
- **Console logs**: `[TIMELINE] Tasks fetched:`, `[TIMELINE] Tasks after sort:`, `[TIMELINE] Render order:`; `[TIMELINE] Active task selected: { id, title, reason }`.

## Implementation Summary
- Step 1: Added List/Timeline view toggle.
- Step 2: Built timeline UI shell (completed, active, upcoming task cards).
- Step 3: Refactored into `src/components/timeline/*` and wired real timeline data via `GET /api/timeline`.
- Step 4: Added real Harvey tip generation via `POST /api/tasks/tip`, wired into `ActiveTaskCard` + `HarveysTip`.

## Key Frontend Files
- `src/components/dashboard/ProjectTimelineView.tsx`
  - Thin wrapper that renders timeline module in dashboard mode.
- `src/components/timeline/TimelineView.tsx`
  - Fetches timeline payload, handles edge states, and wires active-task actions. Accepts `refreshTrigger?: number` prop — when this value increments the component silently refetches via `fetchTimeline({ silent: true })` (no loading spinner). Used by `dashboard/page.tsx` after a reorder API success.
- `src/components/timeline/ActiveTaskCard.tsx`
  - Renders active task details (description via MarkdownMessage) and manages Harvey tip fetch + refresh lifecycle.
- `src/components/timeline/HarveysTip.tsx`
  - Tip display component with loading state and disabled refresh while fetching.

## Backend APIs
- `GET /api/timeline`
  - Returns:
    - `lastCompletedTask`
    - `activeTask`
    - `upcomingTasks`
    - `skippedTasks` (all tasks with `status: 'skipped'` for the project; used for the Skipped section at the bottom of the timeline)
    - `dependencies`
    - `dependentTasks`
- `POST /api/tasks/tip`
  - Body: `{ taskId: string }`
  - Auth: Supabase user required.
  - Ownership: verifies task’s project belongs to authenticated user.
  - Cache-first behavior: returns `Task.harveyTip` when already stored.
  - If missing, context includes task details, success criteria completion state, dependency statuses, and project goals, then generates and stores the tip.
  - Claude model: `claude-haiku-4-5-20251001`, `max_tokens: 100`.
  - Response contract: always HTTP 200 with `{ tip: string }`.
  - Fallback tip used on any error:
    - `Break this task into the first small step and start there.`

## Skipped section (bottom of timeline)

- **Data**: All tasks for the current project with `status: 'skipped'` are returned in the timeline payload as `skippedTasks` and are **not** included in active or upcoming.
- **Placement**: A collapsible section is rendered at the very bottom of the timeline rail, below all completed / active / upcoming task cards.
- **Collapsed (default)**: Shows a single line: "Skipped (N)" where N is the count of skipped tasks. Click to expand.
- **Expanded**: Renders one read-only card per skipped task:
  - Grey left border and grey "SKIPPED" status badge.
  - Task title, time estimate (from scheduled date/start/end), and label pill.
  - No Complete or Skip buttons.
- **Active/upcoming**: Skipped tasks never appear as the active task or in the upcoming list; the active-task candidate query uses `status: 'pending'` only, and unmet-dependency substitution considers only pending (not skipped) dependencies.

## Dependency warning in task detail

- **Where**: In the active task card, under "Dependencies" → "This Task Depends On".
- **When**: For each dependency whose status is `skipped`:
  - The dependency row uses a **red warning icon** instead of the usual check/unchecked icon.
  - A **red warning message** is shown directly below that row: `"[Task title]" was skipped — make sure you've completed this before starting.` (styled `text-red-500`, small font).
- **When not**: Pending or completed dependencies show no warning; only skipped dependencies show the icon and message.

## UX Behavior
- Timeline loads from real DB-backed data.
- Active task success criteria updates are persisted.
- Harvey tip is fetched on active card mount and can be refreshed.
- Harvey tip generation happens only once per task (first timeline request), then is served from DB cache.
- While tip is loading, a spinner appears in the tip content area and Refresh is disabled.
