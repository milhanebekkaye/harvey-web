# Timeline View (Steps 1-4 Complete)

## Overview
Timeline View is now fully implemented as the primary dashboard view mode. It is split into reusable components, powered by real task data, and includes an AI-generated “Harvey’s Tip” for the active task.

## Task ordering and audit logs (2026-02-25)

- **Where tasks are fetched**: `GET /api/timeline` (see `src/app/api/timeline/route.ts`) calls `getTimelineData(projectId, userId)` in `src/lib/timeline/get-timeline-data.ts`. No other API is used for the Timeline View rail (completed / active / upcoming).
- **Where tasks are sorted**: All ordering for the timeline rail happens in **`src/lib/timeline/get-timeline-data.ts`**. There is no separate sort step on the frontend; the component renders the payload as returned (lastCompleted → active → upcoming).
- **Current sort logic (plain English)** (updated Step 2 fix):
  - **Active task**: Candidate = first pending/skipped task with non-null `scheduledDate`, ordered by `scheduledDate` asc, then `scheduledStartTime` asc (DB nulls last). If the candidate has any **unmet dependencies** (depends_on task IDs that are not completed), the code fetches those unmet tasks and picks the **earliest** one (by date, then same-day: flexible/null start before fixed start time) and uses that as the active task instead (`reason: 'unmet-dependency'`). Otherwise the candidate is used (`reason: 'direct'`).
  - **Upcoming tasks**: Pending tasks (excluding the selected active one), filtered to “from now”, sorted by date then `scheduledStartTime` (nulls as infinity). Then a **dependency-aware pass**: if task X depends on task Y and Y appears after X, Y is moved before X. First two tasks are taken.
- **`scheduled_start_time` / `scheduled_end_time` / `depends_on`**: Used for active-task selection (including unmet-dependency substitution and earliest-unmet ordering) and for upcoming time-based sort plus dependency reorder.
- **Console logs**: `[TIMELINE] Tasks fetched:`, `[TIMELINE] Tasks after sort:`, `[TIMELINE] Render order:` (audit); `[TIMELINE] Active task selected: { id, title, reason: 'direct' | 'unmet-dependency' }`.

## Implementation Summary
- Step 1: Added List/Timeline view toggle.
- Step 2: Built timeline UI shell (completed, active, upcoming task cards).
- Step 3: Refactored into `src/components/timeline/*` and wired real timeline data via `GET /api/timeline`.
- Step 4: Added real Harvey tip generation via `POST /api/tasks/tip`, wired into `ActiveTaskCard` + `HarveysTip`.

## Key Frontend Files
- `src/components/dashboard/ProjectTimelineView.tsx`
  - Thin wrapper that renders timeline module in dashboard mode.
- `src/components/timeline/TimelineView.tsx`
  - Fetches timeline payload, handles edge states, and wires active-task actions.
- `src/components/timeline/ActiveTaskCard.tsx`
  - Renders active task details and manages Harvey tip fetch + refresh lifecycle.
- `src/components/timeline/HarveysTip.tsx`
  - Tip display component with loading state and disabled refresh while fetching.

## Backend APIs
- `GET /api/timeline`
  - Returns:
    - `lastCompletedTask`
    - `activeTask`
    - `upcomingTasks`
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

## UX Behavior
- Timeline loads from real DB-backed data.
- Active task success criteria updates are persisted.
- Harvey tip is fetched on active card mount and can be refreshed.
- Harvey tip generation happens only once per task (first timeline request), then is served from DB cache.
- While tip is loading, a spinner appears in the tip content area and Refresh is disabled.
