# Timeline View (Steps 1-4 Complete)

## Overview
Timeline View is now fully implemented as the primary dashboard view mode. It is split into reusable components, powered by real task data, and includes an AI-generated “Harvey’s Tip” for the active task.

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
