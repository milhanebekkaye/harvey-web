## AI Agent Change Log

**What this file is**

- **Purpose**: This file is a **running log of all non-trivial code changes made by AI agents** working on this repository.
- **Audience**: Future AI agents and human maintainers who need to understand **what changed, why, and where to look if something broke**.
- **Scope**: Any change that affects behavior, data structures, or architecture should be recorded here (features, refactors, schema changes, important bug fixes).

Always use `ARCHITECTURE.md` to understand **how the codebase is structured**, and use this `AI_AGENT_CHANGELOG.md` to understand **how it has evolved over time**.

---

## How AI agents should use this file

When you (an AI agent) make a significant change:

1. **Add a new entry at the top** of the “Change log” section (most recent first).
2. **Be concise but precise**:
   - What you changed.
   - Why you changed it.
   - Which files/directories were touched.
   - Any potential risks or follow-up work.
3. **Link to relevant sections** in `ARCHITECTURE.md` if you changed or added documented modules.
4. If you **revert** or significantly modify a previous change, reference the earlier entry by date and short title.

Think of this file as your **debug breadcrumb trail**: future agents (or humans) should be able to answer “What changed recently that might explain this behavior?” by scanning this log.

---

## Recommended entry format

When adding a new entry, follow this structure:

```markdown
### YYYY-MM-DD – Short, descriptive title

- **Agent / context**: (e.g. “Cursor AI assistant”, “Model Used”, brief description of the request or task)
- **Summary**: 1–3 bullet points of what changed at a high level.
- **Files touched**: Key files or directories, not every single file if many were affected.
- **Motivation**: Why this change was made (bug fix, feature request, refactor, performance, etc.).
- **Risks / notes**: Anything that might break, areas to watch, or TODOs for follow-up.
- **Related docs**: References to sections in `ARCHITECTURE.md` or external design docs if applicable.
```

You don’t need to paste large code snippets here—this file is about **narrative and intent**, not implementation details.

---

## Change log

*(Most recent entries go at the top of this section.)*

### 2026-02-23 – Persist feedback widget answered state across reloads

- **Agent / context**: Codex (GPT-5) – User-reported bug: completion/skip feedback widgets reappeared in project chat after page reload even after users had already answered.
- **Summary**:
  - Added `answered?: boolean` to stored discussion message typing and propagated it through discussion fetch transformation so the frontend receives persisted widget-answer state.
  - Extended `POST /api/discussions/[projectId]/messages` with optional `widgetAnswer` metadata (`{ widgetType, taskId }`) and updated discussion append logic to mark the matching widget message as `answered: true` in the same DB write as the appended feedback message.
  - Updated completion/skip widget submit flows to send `widgetAnswer` metadata when appending the automatic user feedback message.
  - Added render guard in `ProjectChatView` to skip interactive rendering for answered completion/skip widgets while preserving message text.
  - Removed render-time ref mutation/use in `ProjectChatView` (`projectIdRef`) to satisfy current lint rule errors (`react-hooks/refs`).
- **Files touched**: `src/types/api.types.ts`, `src/types/chat.types.ts`, `src/lib/discussions/discussion-service.ts`, `src/app/api/discussions/[projectId]/messages/route.ts`, `src/app/api/discussions/[projectId]/route.ts`, `src/app/dashboard/page.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `src/components/dashboard/ProjectChatView.tsx`, `src/components/dashboard/chat/CompletionFeedbackWidget.tsx`, `src/components/dashboard/chat/SkipFeedbackWidget.tsx`, `ARCHITECTURE.md`, `docs/dashboard/README.md`, `docs/chat-router/README.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Ensure feedback widgets are stateful in persisted discussion history so answered widgets do not come back after refresh.
- **Risks / notes**: `widgetAnswer` is currently emitted on the automatic user feedback append call; if a client omits it, old behavior remains (widget can reappear). Targeted eslint run on modified files passes with pre-existing warnings only.
- **Related docs**: `ARCHITECTURE.md` (discussion routes, project chat/widget rendering), `docs/dashboard/README.md`, `docs/chat-router/README.md`.

### 2026-02-23 – Fix react-markdown v10 runtime assertion (`className` prop removed)

- **Agent / context**: Codex (GPT-5) – User reported runtime crash in `MarkdownMessage` after markdown rollout: `Unexpected className prop` from `react-markdown`.
- **Summary**:
  - Removed the unsupported `className` prop from `<ReactMarkdown />` in `MarkdownMessage`.
  - Wrapped the markdown output in a `<div>` that now holds all markdown styling classes previously passed to `ReactMarkdown`.
  - Kept assistant markdown behavior unchanged across onboarding, project chat, and task chat while restoring runtime compatibility with `react-markdown@10`.
- **Files touched**: `src/components/ui/MarkdownMessage.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: `react-markdown` v10 removed `className` on the component; passing it triggers a hard runtime assertion in Next.js dev.
- **Risks / notes**: No expected UI regressions; styles are preserved via wrapper container. Targeted lint check on the modified file passes.
- **Related docs**: `ARCHITECTURE.md` (`src/components/ui/MarkdownMessage.tsx`).

### 2026-02-23 – Assistant chat bubbles now render Markdown across onboarding/project/task chats

- **Agent / context**: Codex (GPT-5) – User requested markdown rendering for assistant responses in all Harvey chat contexts (onboarding, project sidebar chat, per-task chat) using `react-markdown` + `remark-gfm`.
- **Summary**:
  - Installed `react-markdown` and `remark-gfm` and added shared `src/components/ui/MarkdownMessage.tsx` with compact, chat-optimized markdown styling.
  - Wired markdown rendering into assistant bubbles only in `src/components/onboarding/ChatMessage.tsx`, `src/components/dashboard/ProjectChatView.tsx`, and `src/components/dashboard/TaskChatView.tsx`.
  - Kept user bubbles as plain text rendering and preserved existing bubble containers (shape/padding/avatar/timestamps/layout).
  - Added link safety (`target="_blank"` + `rel="noopener noreferrer"`), inline code styling, and code-block horizontal scrolling to avoid layout breaks on long snippets.
  - Updated architecture and feature docs to document the shared markdown renderer and assistant-only usage in each chat surface.
- **Files touched**: `package.json`, `package-lock.json`, `src/components/ui/MarkdownMessage.tsx`, `src/components/onboarding/ChatMessage.tsx`, `src/components/dashboard/ProjectChatView.tsx`, `src/components/dashboard/TaskChatView.tsx`, `ARCHITECTURE.md`, `docs/onboarding/README.md`, `docs/chat-router/README.md`, `docs/per-task-chat/README.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Harvey responses include markdown syntax; rendering plain text made responses harder to read and exposed raw markdown tokens.
- **Risks / notes**: Repo-wide `npm run lint` currently fails because of many pre-existing unrelated lint errors; targeted chat renderer files were updated and integrate without introducing additional lint issues in the modified markdown-related files.
- **Related docs**: `ARCHITECTURE.md` (`src/components/ui/`, dashboard/onboarding component sections), `docs/onboarding/README.md`, `docs/chat-router/README.md`, `docs/per-task-chat/README.md`.

### 2026-02-23 – Timeline Harvey tips now cached in DB (generate once per task)

- **Agent / context**: Codex (GPT-5) – User requested timeline tips to be generated only on first view, then reused from database instead of regenerating every load.
- **Summary**:
  - Added `Task.harveyTip` in Prisma schema and migration `20260223103000_add_task_harvey_tip_cache` so each task can persist a single generated timeline tip.
  - Updated `POST /api/tasks/tip` to use cache-first behavior: if `harveyTip` exists, return it immediately; otherwise generate tip via Haiku, store it in `Task.harveyTip`, and return it.
  - Preserved timeline-triggered generation flow (tip is still generated from timeline API usage, not during task creation/schedule generation).
  - Kept the fail-safe response contract: API always returns HTTP 200 with fallback tip text when needed.
- **Files touched**: `src/prisma/schema.prisma`, `src/prisma/migrations/20260223103000_add_task_harvey_tip_cache/migration.sql`, `src/app/api/tasks/tip/route.ts`, `src/node_modules/.prisma/client/schema.prisma`, `docs/timeline-view.md`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Avoid unnecessary repeated model calls, reduce cost/latency, and keep a stable actionable tip for each task once first generated.
- **Risks / notes**: Existing tasks will have `harveyTip = null` until first timeline tip request. Apply migrations to database before relying on persistence in all environments.
- **Related docs**: `ARCHITECTURE.md` (`/api/tasks/tip`, Prisma migrations), `docs/timeline-view.md`.

### 2026-02-21 – Timeline View Step 4: Harvey tip API integration (Haiku)

- **Agent / context**: Codex (GPT-5) – User request to complete Timeline View Step 4 by wiring `HarveysTip` to a real backend call and keeping prior Timeline behavior unchanged.
- **Summary**:
  - Added new authenticated route `POST /api/tasks/tip` that validates task ownership through project ownership, loads task + project context, optionally loads dependency statuses, calls Claude Haiku (`claude-haiku-4-5-20251001`, `max_tokens: 100`), and returns `{ tip }`.
  - Implemented strict fallback behavior in tip API: on any error (including auth/body/task/model errors), returns HTTP 200 with fallback tip text instead of 500.
  - Wired `src/components/timeline/ActiveTaskCard.tsx` to fetch tip on mount (per active task) and on refresh, with local `tip` and `tipLoading` state.
  - Updated `src/components/timeline/HarveysTip.tsx` loading UX: spinner now appears in tip content area while loading, and Refresh is disabled until completion.
  - Added timeline feature documentation file `docs/timeline-view.md` and updated architecture docs to mark Timeline Step 4 as complete and document `/api/tasks/tip`.
- **Files touched**: `src/app/api/tasks/tip/route.ts`, `src/components/timeline/ActiveTaskCard.tsx`, `src/components/timeline/HarveysTip.tsx`, `docs/timeline-view.md`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Complete the final Timeline View step by replacing placeholder tip content with real AI-generated, task-specific coaching while preserving existing Timeline UX and actions.
- **Risks / notes**: Tip quality depends on model response quality and available task context. API is intentionally fail-safe (always fallback tip) to avoid breaking Timeline rendering.
- **Related docs**: `ARCHITECTURE.md` (`/api/tasks/tip`, `src/components/timeline/`, `src/lib/timeline/`), `docs/timeline-view.md`.

### 2026-02-21 – Timeline action buttons now reliably use list-view Complete/Skip flow

- **Agent / context**: Codex (GPT-5) – User requested Timeline "Skip" and "Mark as Complete" to trigger the same behavior as list view (`TaskDetails` actions).
- **Summary**:
  - Updated dashboard action handlers so `handleCompleteTask` and `handleSkipTask` no longer early-return when the task is missing from list-view grouped state.
  - Timeline action buttons now always execute the same PATCH + chat-side effects flow used by list view, even when timeline data arrives before grouped list data.
  - Preserved optimistic list-state updates when task exists locally; fallback path still executes API action and background refresh when it does not.
- **Files touched**: `src/app/dashboard/page.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Ensure Timeline action buttons behave identically to list view and never no-op because of temporary state mismatch.
- **Risks / notes**: On rare failure when task is absent from grouped state, UI reversion relies on `fetchTasks()` refresh rather than exact local rollback (same end result after refresh).
- **Related docs**: `docs/dashboard/README.md` (dashboard action flow), `ARCHITECTURE.md` (dashboard page handlers; no structure change).

### 2026-02-21 – Dashboard default view switched to Timeline

- **Agent / context**: Codex (GPT-5) – User requested Timeline to be the main default view when loading dashboard.
- **Summary**:
  - Changed dashboard initial view state from `'list'` to `'timeline'`.
  - Dashboard now opens directly on Timeline View by default.
- **Files touched**: `src/app/dashboard/page.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Make Timeline the primary landing experience in the dashboard.
- **Risks / notes**: List view remains available via the existing View selector; only the initial default changed.
- **Related docs**: `ARCHITECTURE.md` (no structural change required).

### 2026-02-21 – Timeline upcoming ordering fix (from now, not from active task date)

- **Agent / context**: Codex (GPT-5) – User reported Timeline “Upcoming” cards were skipping later-today tasks and showing tomorrow first in some cases.
- **Summary**:
  - Updated timeline upcoming-task logic to use **current time** as the baseline instead of `activeTask.scheduledDate`.
  - Upcoming now selects the next pending tasks in chronological order from now:
    - later today first (if any),
    - then future days (e.g. tomorrow),
    - while excluding the currently active task to avoid duplication.
  - Added timezone-aware filtering using the user’s timezone for same-day comparisons.
- **Files touched**: `src/lib/timeline/get-timeline-data.ts`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Ensure Timeline “Upcoming” reflects true next tasks in time order and does not hide remaining same-day tasks.
- **Risks / notes**: For tasks scheduled today without a `scheduledStartTime`, they are treated as still upcoming for today and sorted after timed tasks on the same date.
- **Related docs**: `ARCHITECTURE.md` (`src/lib/timeline/` and `/api/timeline` sections; no structural documentation change required).

### 2026-02-21 – Timeline View Step 3: component architecture + real data wiring

- **Agent / context**: Codex (GPT-5) – User request to refactor timeline UI into reusable components before data wiring, then connect real DB data and persist success criteria from timeline mode.
- **Summary**:
  - Added a dedicated timeline module under `src/components/timeline/` (`TimelineView`, `TimelineRail`, `CompletedTaskCard`, `ActiveTaskCard`, `HarveysTip`, `SuccessCriteriaList`, `UpcomingTaskCard`) while preserving the Step 2 visual styling.
  - Added timeline data service + API endpoint: `getTimelineData(projectId, userId)` in `src/lib/timeline/get-timeline-data.ts` and `GET /api/timeline` in `src/app/api/timeline/route.ts` for real completed/active/upcoming task data and dependency metadata.
  - Replaced hardcoded timeline rendering with live data in dashboard timeline mode through `ProjectTimelineView` wrapper + new `TimelineView` shell; wired active-card actions (`Complete`, `Skip`, `Ask Harvey`) to existing dashboard handlers.
  - Wired success criteria toggles in timeline mode with optimistic updates and rollback on failure via `PATCH /api/tasks/[taskId]`, including API/service support for `successCriteria` payloads.
  - Implemented Step 3 edge cases: hide completed slot when none, show empty-state message when no active task, hide upcoming slots when none.
- **Files touched**: `src/components/timeline/*` (new module), `src/components/dashboard/ProjectTimelineView.tsx`, `src/app/dashboard/page.tsx`, `src/lib/timeline/get-timeline-data.ts`, `src/app/api/timeline/route.ts`, `src/types/timeline.types.ts`, `src/app/api/tasks/[taskId]/route.ts`, `src/lib/tasks/task-service.ts`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Complete Step 3 requested architecture split before backend wiring, then deliver real timeline data and DB-backed success-criteria persistence without changing timeline visual design.
- **Risks / notes**: Timeline mode now depends on `/api/timeline`; if API/auth/project resolution fails, the shell shows a brief toast and empty-state message. Harvey tip remains placeholder (`"..."`) per Step 3 scope; Step 4 should replace with real tip API call.
- **Related docs**: `ARCHITECTURE.md` (`src/components/timeline/`, `src/lib/timeline/`, `/api/timeline`, `/api/tasks/[taskId]`).

### 2026-02-21 – Timeline card detail update: rail-center markers + dependencies section

- **Agent / context**: Codex (GPT-5) – User requested two UI fixes: marker/dot stacking exactly over the rail and replacing task-card attachments with dependency visibility.
- **Summary**:
  - **Rail-centered markers**: Updated completed, active, and upcoming marker positioning so the marker center is aligned with the rail axis (stacked over the line, not offset to the side).
  - **Dependencies instead of attachments**: Removed the “Attachments & Links” panel in the active task card and replaced it with a “Dependencies” panel split into:
    - “This Task Depends On”
    - “Tasks Depending On This”
  - Added matching hardcoded dependency sample data in the timeline shell for the active task.
- **Files touched**: `src/components/dashboard/ProjectTimelineView.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Improve timeline readability and make task-card context more useful for planning by surfacing dependency flow directly.
- **Risks / notes**: Dependency data here is still hardcoded timeline-shell data (not yet wired to real task relations).
- **Related docs**: `ARCHITECTURE.md` (dashboard components; no architecture update required).

### 2026-02-21 – Timeline rail alignment fix (dot centers on rail axis)

- **Agent / context**: Codex (GPT-5) – User-reported UI bug: timeline dots were visually sitting on cards instead of centered on the vertical rail.
- **Summary**:
  - Adjusted completed, active, and upcoming marker horizontal offsets in `ProjectTimelineView` so each marker center aligns with the rail axis.
  - Removed the previous centering transform-based placement for markers in favor of fixed offsets that match the current rail geometry.
- **Files touched**: `src/components/dashboard/ProjectTimelineView.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Fix visual misalignment and restore clear rail-to-marker relationship in the timeline UI.
- **Risks / notes**: Marker offset is tied to current rail/card spacing. If timeline horizontal spacing changes later (`pl-14` / rail `left-5`), marker offsets should be re-tuned.
- **Related docs**: `ARCHITECTURE.md` (dashboard components; no architecture update required).

### 2026-02-21 – Timeline view UI polish: unified right header + floating view selector + rail marker alignment

- **Agent / context**: Codex (GPT-5) – User-requested visual cleanup for the new timeline experience to match a more modern layout.
- **Summary**:
  - **Unified right header**: Replaced the old top toggle/search bar in dashboard right pane with a cleaner header matching timeline style: "Project Timeline" title + subtitle + `Filter` and `View` buttons.
  - **Floating view selector**: `View` now opens a floating popover menu with `List View` and `Timeline View` options (with active-state checkmark), and closes on outside click / `Escape`.
  - **Removed duplicate headers**: Deleted internal headers from `TimelineView` and `ProjectTimelineView` so the right pane has one consistent header.
  - **Removed week progress text**: Deleted the hardcoded "Week 4 of 12" timeline subtitle text.
  - **Rail marker fix**: Reworked timeline vertical rail and marker placement in `ProjectTimelineView` with a single aligned rail axis and cleaner completed (green), active (purple), and upcoming (grey) dots.
- **Files touched**: `src/app/dashboard/page.tsx`, `src/components/dashboard/ProjectTimelineView.tsx`, `src/components/dashboard/TimelineView.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Improve timeline UI quality and consistency, remove clutter, and provide a more modern view switch interaction matching requested behavior.
- **Risks / notes**: `Filter` button remains visual-only in this pass (no filtering logic attached yet). Timeline content is still hardcoded in `ProjectTimelineView` as in Step 2 shell.
- **Related docs**: `ARCHITECTURE.md` (dashboard layout/components; no structural change required).

### 2026-02-21 – Timeline View Step 2: Hardcoded UI Shell

- **Agent / context**: Claude Code – Feature: Timeline View Step 2 — build full timeline UI with hardcoded data matching Stitch design.
- **Summary**:
  - **ProjectTimelineView**: New component `src/components/dashboard/ProjectTimelineView.tsx` — vertical timeline visualization with completed task (green checkmark, strikethrough, DONE pill), active task (purple dot with glow, expanded card with description, success criteria, Harvey's Tip, action buttons), and upcoming tasks (grey dots, 50% opacity, UPCOMING pills).
  - **Dashboard integration**: Timeline view now renders `ProjectTimelineView` instead of "Coming Soon" placeholder.
  - **Header cleanup**: Removed settings, extract, AM/PM/Eve test buttons from dashboard header. Kept only ViewToggle.
  - **Logout relocated**: Moved logout button from dashboard header to ChatSidebar left rail, below the conversations toggle button.
  - **Code cleanup**: Removed unused `Link` import, `isExtractLoading` state, and `handleTestExtract` function.
- **Files touched**: `src/components/dashboard/ProjectTimelineView.tsx` (new), `src/components/dashboard/index.ts`, `src/app/dashboard/page.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Step 2 of Timeline View feature — build the complete UI shell with hardcoded data before wiring to real task data.
- **Risks / notes**: All data is hardcoded (1 completed, 1 active, 2 upcoming tasks). Success criteria checkboxes are not interactive yet. Action buttons (Mark as Complete, Skip, Ask Harvey) are not wired. Step 3 will make success criteria interactive.
- **Related docs**: `ARCHITECTURE.md` (dashboard components).

### 2026-02-21 – Timeline View Step 1: View toggle (List / Timeline)

- **Agent / context**: Claude Code – Feature: Timeline View Step 1 — replace Calendar view system with List/Timeline toggle.
- **Summary**:
  - **ViewToggle**: Changed `ViewMode` type from `'timeline' | 'calendar'` to `'list' | 'timeline'`. Button labels now "List" and "Timeline".
  - **Dashboard page**: Default view is now `'list'`. List view renders `TimelineView` (unchanged behavior). Timeline view renders a "Coming Soon" placeholder with centered text and subtitle "Harvey Timeline View — in progress".
  - **CalendarView removed**: Deleted `CalendarView.tsx`, removed export from `index.ts`, removed import from dashboard page.
- **Files touched**: `src/components/dashboard/ViewToggle.tsx`, `src/app/dashboard/page.tsx`, `src/components/dashboard/index.ts`, `src/components/dashboard/CalendarView.tsx` (deleted), `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Step 1 of Timeline View feature — establish two-option view toggle (List/Timeline) with List as default showing current task list, and Timeline showing placeholder for future implementation.
- **Risks / notes**: No functional changes to task list behavior. Timeline view is placeholder only — future steps will implement actual timeline functionality.
- **Related docs**: `ARCHITECTURE.md` (dashboard components).

### 2026-02-21 – Task chat opening message sync fix (no reload needed)

- **Agent / context**: Codex (GPT-5) – Fix bug where a newly created task chat showed “Harvey is typing…” but the opening assistant message stayed invisible until full page reload.
- **Summary**:
  - Updated `TaskChatView` to stop relying on `useChat` reinitialization from changing seed state (the `key` option used previously is not handled by this `@ai-sdk/react` `useChat` implementation).
  - Added message reconciliation helpers (`areMessagesEquivalent`, `isMessagePrefix`, `mergeSeedIntoChatMessages`) and a sync effect that pushes late-arriving `seedMessages` into `useChat` via `setMessages`.
  - Sync behavior is non-destructive: if chat already contains the seed prefix, it keeps current chat state; if seed is newer, it upgrades to seed; if seed is missing, it prepends seed so the opening message is visible immediately.
- **Files touched**: `src/components/dashboard/TaskChatView.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Opening task-chat messages are created/stored correctly by API/DB, but `useChat` only consumed initial messages once and ignored later `seedMessages` updates from parent/poller.
- **Risks / notes**: Reconciliation compares `role + text` (not ids/timestamps). If server-side text transformations are introduced later, monitor for potential duplicate-prepend edge cases.
- **Related docs**: `ARCHITECTURE.md` (dashboard chat sidebar and per-task chat flow).

### 2026-02-21 – Per-task chat Step 4 (full context assembly + Harvey responds)

- **Agent / context**: Cursor – Per-task chat Step 4: full context assembly for task chat and end-to-end streaming Harvey responses.
- **Summary**:
  - **buildTaskChatContext**: New `src/lib/context-builders/build-task-chat-context.ts` — `buildTaskChatContext(taskId, userId): Promise<string>`. Five layers: project context, current task, dependencies (and incomplete / downstream), schedule context (recent 7 days + upcoming), behavioral patterns (estimation accuracy by label, skip patterns). Queries run fresh each time; on Prisma failure returns a minimal fallback prompt and never throws.
  - **POST /api/chat/task**: New streaming endpoint. Body: `{ messages, taskId, projectId? }`. Loads task discussion (getTaskDiscussion), last 20 messages, builds system prompt via buildTaskChatContext, streams with **Claude Sonnet** (`claude-sonnet-4-20250514`), no tools. Persists user message before stream and assistant message in onFinish. Same createUIMessageStream / createUIMessageStreamResponse pattern as project chat.
  - **TaskChatView**: Switched to `useChat` with `/api/chat/task`; displays streamed replies word-by-word; seed messages from load/cache/parent; onFinish updates in-memory cache. No more POST to `/api/discussions/task/messages` on send — the chat API handles persistence.
- **Files touched**: `src/lib/context-builders/build-task-chat-context.ts` (new), `src/app/api/chat/task/route.ts` (new), `src/components/dashboard/TaskChatView.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/per-task-chat/README.md`.
- **Motivation**: Step 4 of per-task chat: Harvey now responds in task chat with full project/task/schedule/behavioral context; all messages (user + assistant) are stored in the Discussion.
- **Risks / notes**: Sonnet used for all task chat responses; Step 5 will add model routing (e.g. Haiku for simple turns). POST /api/discussions/task/messages is still used only if something bypasses TaskChatView (e.g. future clients); TaskChatView itself no longer calls it.
- **Related docs**: `ARCHITECTURE.md` (API routes, Context builders), `docs/per-task-chat/README.md`.

### 2026-02-21 – Per-task chat Step 3 (real opening message via Haiku)

- **Agent / context**: Cursor – Per-task chat Step 3: replace hardcoded task-chat opening message with a one-time Claude Haiku API call that generates a task-specific opening message on first Discussion creation; result stored in DB so subsequent opens load from DB with no extra API call.
- **Summary**:
  - **New**: `src/lib/discussions/generate-task-opening-message.ts` — `generateTaskOpeningMessage(task: TaskContext): Promise<string>`, exported `TaskContext` type. Uses Anthropic SDK (shared `anthropic` from `claude-client`), model `claude-haiku-4-5-20251001`, max_tokens 200. System prompt: Harvey accountability coach, short/specific/encouraging, mention unlocks and incomplete dependencies, one concrete suggestion, max 3 sentences. User message built from TaskContext (title, category, duration, description, dependencies with status, unlocks count, project title/goals). On success returns generated text; on error logs and returns fallback string (never throws — discussion creation is never blocked).
  - **API**: `POST /api/discussions/task` — after existing-discussion check, fetches task (scoped to project) with project title/goals, unlocks count, dependency tasks (title + status); builds TaskContext; calls `generateTaskOpeningMessage`; creates discussion with that message as initialMessage. If task missing or fetch fails, uses same fallback and still creates discussion.
- **Files touched**: `src/lib/discussions/generate-task-opening-message.ts` (new), `src/app/api/discussions/task/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/per-task-chat/README.md`.
- **Motivation**: Step 3 of per-task chat: first message in a new task chat is now task-specific and useful instead of generic; no streaming or full context assembly yet (Step 4).
- **Risks / notes**: Opening message generation is best-effort; fallback ensures creation never fails. Model used: `claude-haiku-4-5-20251001`. Step 4 will add full context assembly (behavioral patterns, schedule data).
- **Related docs**: `ARCHITECTURE.md` (discussions/task, discussion-service), `docs/per-task-chat/README.md`.

### 2026-02-21 – Per-task chat Step 2 (database wiring)

- **Agent / context**: Cursor – Per-task chat Step 2: wire task chat creation, loading, and message persistence to the database. No real Harvey response yet (placeholder typing indicator only).
- **Summary**:
  - **Prisma**: Added Discussion–Task relation (`task Task?` on Discussion, `discussions Discussion[]` on Task). Migration `add_task_discussion_type`. Existing Discussion rows unchanged (type default "project", taskId null).
  - **API**: New routes — `POST/GET /api/discussions/task` (create or get task discussion), `POST /api/discussions/task/messages` (append user message), `GET /api/discussions/task/list?projectId=` (list task discussions for project; excludes deleted tasks). All routes use existing Supabase auth and project-ownership checks.
  - **Discussion service**: `getTaskDiscussion(projectId, userId, taskId)` and `listTaskDiscussions(projectId, userId)` with task include for title/label.
  - **Dashboard**: `openTaskChats` extended with optional `discussionId`. `handleAskHarvey` calls POST /api/discussions/task and stores returned discussionId. On load, GET /api/discussions/task/list populates openTaskChats for persistence across refresh.
  - **TaskChatView**: Loads discussion on mount via GET by taskId; shows messages, enabled input, optimistic send, "Harvey is thinking..." placeholder (1.5s), inline error on send failure. Step 3 will replace placeholder with real streaming.
  - **ChatSidebar**: Passes taskId, projectId, discussionId (and taskTitle, taskLabel) to TaskChatView. **OpenTaskChat** type includes optional `discussionId`.
- **Files touched**: `src/prisma/schema.prisma`, `src/lib/discussions/discussion-service.ts`, `src/app/api/discussions/task/route.ts` (new), `src/app/api/discussions/task/messages/route.ts` (new), `src/app/api/discussions/task/list/route.ts` (new), `src/components/dashboard/TaskChatView.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `src/components/dashboard/ConversationNavPanel.tsx`, `src/app/dashboard/page.tsx`, `ARCHITECTURE.md`, `docs/per-task-chat/README.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Implement Per-Task Chat Step 2 per plan: DB-backed task discussions, create/get/list and add-message APIs, frontend wiring with optimistic UI and persistence across refresh. No Claude/Harvey response in this step.
- **Risks / notes**: Task chat sends only persist user messages; Harvey does not reply. List endpoint filters out discussions whose task was deleted (task relation null). Project chat behavior unchanged.
- **Related docs**: `docs/per-task-chat/README.md`, `ARCHITECTURE.md` (API routes, Discussion/Task schema, dashboard per-task chat).

### 2026-02-21 – Per-task chat Step 1 (UI only, zero logic)

- **Agent / context**: Cursor – Per-task chat feature, Step 1: conversation navigation and sidebar content switching with React state only; no API, DB, or persistence.
- **Summary**:
  - **Conversation nav panel**: New `ConversationNavPanel` overlay (Pinned: Project Chat; TASKS list; user row). No History section. Dashboard state: `isPanelOpen`, `activeConversation`, `openTaskChats`. Sidebar header shows "Harvey AI" / "Conversations" or task title / "Task Chat" and a conversations toggle.
  - **Sidebar content switching**: `ChatSidebar` refactored to shell; project chat body moved to `ProjectChatView` (useChat, messages, project pill, rebuild, input). New `TaskChatView` for task chat placeholder (back link, hardcoded message, disabled input). Content switches based on `activeConversation`.
  - **Ask Harvey on task cards**: "Ask Harvey" button in `TaskDetails` (with Complete/Skip); adds task to `openTaskChats`, sets `activeConversation`, switches sidebar to task chat. Active task card gets purple ring and chat bubble badge.
  - **Project name visibility**: Timeline header "Project Timeline" + subtitle (project name). Project context chip in sidebar below project pill when on project chat.
- **Files touched**: `src/components/dashboard/ConversationNavPanel.tsx` (new), `ProjectChatView.tsx` (new), `TaskChatView.tsx` (new), `ChatSidebar.tsx` (refactor), `TimelineView.tsx`, `TaskDetails.tsx`, `TaskTile.tsx`, `src/app/dashboard/page.tsx`, `src/components/dashboard/index.ts`, `docs/per-task-chat.md` (new), `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Implement Per-Task Chat Step 1 per plan: UI and navigation only before wiring task chat API and persistence in Step 2.
- **Risks / notes**: Task chat input is disabled; no persistence across refresh. Rebuild button moved from sidebar header into ProjectChatView (below project chip). All existing project chat behavior preserved in ProjectChatView.
- **Related docs**: `docs/per-task-chat.md`, `ARCHITECTURE.md` (dashboard / ChatSidebar / per-task chat).

### 2026-02-18 – Claude scheduler validation fix: allow partial slot usage

- **Agent / context**: Codex (GPT-5) – User-requested bug fix for `assignTasksWithClaude` duration validation causing unnecessary fallback.
- **Summary**:
  - Fixed `validateClaudeAssignments` in `src/lib/schedule/task-scheduler.ts` by removing the overly strict per-slot check that required `hoursAssigned` to equal the full slot time range.
  - Kept slot-boundary and capacity checks, but moved duration integrity to task level: sum of `hoursAssigned` across all assigned slots for a task must match the task estimate (tolerance ±0.1h).
  - Added inline comments clarifying that partial slot usage is valid and task-level sums are the real duration integrity rule.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `docs/schedule-generation/README.md`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Prevent valid Claude schedules (e.g. 2h task in a 3h slot) from being rejected, which was forcing deterministic fallback even when assignment logic was otherwise valid.
- **Risks / notes**: Tasks can now intentionally claim less than slot capacity; this is expected. True duration mismatches (sum assigned vs estimated) still fail validation and trigger retry/fallback.
- **Related docs**: `ARCHITECTURE.md` (`src/lib/schedule/task-scheduler.ts` section), `docs/schedule-generation/README.md`.

### 2026-02-18 – Claude-powered slot assignment with validation/retry/fallback

- **Agent / context**: Codex (GPT-5) – User-requested replacement of deterministic slot assignment with Claude scheduling, keeping slot-map and DB writes intact.
- **Summary**:
  - Added **`assignTasksWithClaude`** in `src/lib/schedule/task-scheduler.ts` as the new primary scheduler path: it keeps `buildAvailabilityMap` unchanged, serializes tasks + date-specific slots, calls **Claude Haiku** (`max_tokens=4000`), parses JSON output, and returns the existing `ScheduleResult` shape.
  - Implemented hard-constraint validation for Claude output: valid task indices, valid slot references (`date + startTime`), no overlap/slot conflicts, strict dependency timing (task earliest start > dependency latest end), split continuity (contiguous part numbers + consecutive slots), and duration integrity (assigned hours must match task estimate).
  - Implemented one validation-guided retry: on first failure, scheduler sends Claude the previous response plus concrete violation messages and requests a corrected full JSON array; if retry fails, it logs violations and falls back to existing deterministic `assignTasksToSchedule`.
  - Updated `src/app/api/schedule/generate-schedule/route.ts` to call `await assignTasksWithClaude(...)` and pass project context fields (`projectGoals`, `projectMotivation`) into `SchedulerOptions`; DB write logic remains unchanged.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `docs/schedule-generation/README.md`, `docs/task-generation/README.md`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Replace brittle deterministic slot picking with semantic scheduling that can reason about task intent, while preserving reliability through deterministic fallback when AI output is invalid.
- **Risks / notes**: Claude output must remain strict JSON; when unavailable/invalid after retry, fallback deterministic scheduling is used automatically. Regenerate tool (`full_rebuild`) still uses deterministic scheduler directly unless updated separately.
- **Related docs**: `ARCHITECTURE.md` (`src/lib/schedule/task-scheduler.ts`, `src/app/api/schedule/generate-schedule/route.ts`), `docs/schedule-generation/README.md`, `docs/task-generation/README.md`.

### 2026-02-18 – Scheduler fixes: cross-day dependencies, continuation priority, phase-aware ordering

- **Agent / context**: Codex (GPT-5) – User-requested targeted bugfix pass in scheduler only (no task-generation logic changes).
- **Summary**:
  - Fixed **cross-day dependency enforcement** in `canPlaceTaskInSlot`: for every `depends_on` task, the scheduler now checks all scheduled parts across all dates; if a dependency has no scheduled assignment yet, placement is blocked; if scheduled, candidate slot start must be strictly after the dependency’s latest end.
  - Fixed **split continuation priority** in the main slot loop: before `pickTaskForSlot`, scheduler now checks eligible continuation tasks (already split with `partNumber` scheduled + `earliestStartForContinuation` reached) and selects them with absolute priority.
  - Added **phase-aware sort key** to `sortIndicesByDependenciesThenPriorityAndEnergy`: when `options.phases` is present, tasks are tagged with heuristic `phaseOrder` (active=0, future=1), then sorted by phase first, then dependency layer, priority, and energy; scheduler logs now include `phase=active|future`.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `docs/task-generation/README.md`, `ARCHITECTURE.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Prevent dependents from being placed before dependencies across days, prevent interleaving when continuing split tasks, and make scheduler ordering honor active-phase intent from constraints.
- **Risks / notes**: Phase detection currently uses heuristic (high-priority prefix in topological order) because parsed tasks do not yet carry explicit phase IDs. Manual validation trace run against `assignTasksToSchedule` confirmed: dependency task on Thursday blocks dependent on Wednesday; split task part 2 follows part 1 in the next slot with no interleaving; sort logs show active-phase tasks before future-phase tasks.
- **Related docs**: `ARCHITECTURE.md` (`src/lib/schedule/task-scheduler.ts` section), `docs/task-generation/README.md` (scheduling flow + function reference).

### 2026-02-18 – Read-only audit: task generation + scheduler pipeline

- **Agent / context**: Codex (GPT-5) – User requested a deep, code-level audit report of task generation and scheduling behavior with no implementation changes.
- **Summary**:
  - Traced the full trigger chain from onboarding UI (`/onboarding` → `/loading`) to `POST /api/schedule/generate-schedule`, including Claude prompt construction, task parsing, scheduling, and DB persistence.
  - Extracted and documented the exact task-generation prompt/template, Claude message payload structure, parser behavior, and typed task fields at parse output.
  - Isolated evidence for three known issues: dependency conflicts being dropped, split-part sequencing fallback that can allow interleaving, and missing phase-awareness in scheduler ordering.
- **Files touched**: `AI_AGENT_CHANGELOG.md` only. Audit was read-only for source code. Key files inspected include `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/schedule/schedule-generation.ts`, `src/lib/schedule/task-scheduler.ts`, `src/app/loading/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/api/onboarding/extract/route.ts`, `src/types/api.types.ts`, `src/prisma/schema.prisma`, `ARCHITECTURE.md`, `docs/task-generation/README.md`, `docs/schedule-generation/README.md`.
- **Motivation**: Provide a structured technical basis for a human advisor to diagnose current scheduler/task-generation bugs and plan fixes safely.
- **Risks / notes**: No runtime or behavior changes were made. Findings reflect current HEAD at audit time and may differ from older changelog claims.
- **Related docs**: `ARCHITECTURE.md` (schedule routes and `src/lib/schedule/*`), `docs/task-generation/README.md`, `docs/schedule-generation/README.md`.

### 2026-02-18 – Split task parts scheduled consecutively (no other tasks between parts)

- **Agent / context**: Cursor AI – Ensure all parts of a split task are placed back-to-back with no other tasks in between.
- **Summary**:
  - In **task-scheduler.ts** `assignTasksToSchedule`, when a task is split and Part 1 is assigned, the scheduler now **immediately** schedules Part 2, Part 3, … in the next available slot(s) via **scheduleRemainingPartsConsecutively(task, afterTime, useEmergency)**. No other task can be placed between Part 1 and Part 2 (previously Part 2 could be delayed and other tasks filled the gap).
  - **getSlotUsedState(scheduledTasks, currentDate, slot, userTimezone)** computes how much of a slot is already used (from scheduledTasks) and the next start hour; used to avoid double-booking and to find the next free slot for consecutive parts. **getLocalHoursInTimezone** / **getLocalDateStrInTimezone** support timezone-aware slot usage.
  - Each slot’s **slotFilled** and **currentSlotStartHours** are initialized from **getSlotUsedState** at the start of the slot loop so assignments made by the consecutive scheduler are respected when the main loop later processes that slot.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`.
- **Motivation**: User reported e.g. "Build per-task chat Part 1" on Wed 10:00, "Implement onboarding Part 1" on Wed 20:00, then "Build per-task chat Part 2" on Thu 10:00; parts of the same task must be consecutive.
- **Risks / notes**: If no slot is found for a continuation part in the current pass (e.g. non-emergency full), the task stays in the queue with remaining hours and may be placed in the emergency pass or remain unscheduled.
- **Related docs**: `ARCHITECTURE.md` (task-scheduler).

### 2026-02-18 – Task split sequencing + task title cleanup

- **Agent / context**: Cursor AI – Fix schedule generation: split parts out of order and markdown artifacts in titles.
- **Summary**:
  - **Split-part ordering (Fix 1)**: In **task-scheduler.ts** `assignTasksToSchedule`, when a task is split into Part 1, Part 2, Part 3, parts are now scheduled **sequentially**. After assigning Part N to a slot, the scheduler records the earliest start time for Part N+1 (Part N end + 15 min gap). Part N+1 is only placed in slots that start at or after that time (same day or later). Implemented via `earliestStartForContinuation` Map and an extra condition in the task-picking loop (Option A: no dependency graph change; continuation constraint enforced at placement).
  - **Task title cleanup (Fix 2)**: In **schedule-generation.ts** `parseTaskBlock`, the task title extracted from the `TASK:` line is now stripped of leading `**` and trailing `**` so markdown parsing no longer leaves titles like "Plan onboarding flow architecture & user journey**".
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `src/lib/schedule/schedule-generation.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`.
- **Motivation**: Part 2 was sometimes scheduled before Part 1 (e.g. Part 2 at 10:00, Part 1 at 20:00), making the schedule unusable; task titles showed trailing asterisks from Claude markdown.
- **Risks / notes**: None. All parts of a split task inherit the original task's priority and preferred_slot; no re-prioritization of parts.
- **Related docs**: `docs/task-generation/README.md` (assignTasksToSchedule, parseTaskBlock), `ARCHITECTURE.md` (task-scheduler, schedule-generation).

### 2026-02-18 – Parse numbered task headers (TASK 1:, TASK 2:)

- **Agent / context**: Cursor AI – Fix 0 tasks parsed when Claude outputs "TASK 1:", "TASK 2:" instead of "TASK:".
- **Summary**: In **schedule-generation.ts** `parseTasks` and `parseTaskBlock`, the parser now accepts both `TASK:` and numbered headers like `TASK 1:`, `TASK 2:`. Regex changed from `\bTASK\s*:` to `\bTASK\s*\d*\s*:` for block detection and title extraction so blocks such as `## TASK 1: Plan onboarding...` are recognized and titles are captured correctly.
- **Files touched**: `src/lib/schedule/schedule-generation.ts`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: User reported "we don't Generate any tasks" after schedule generation; logs showed "blocks containing TASK: (i)= 0" and "block 1 no TASK: found" because Claude returned "TASK 1:", "TASK 2:" (numbered). The 2026-02-18 title-cleanup change did not alter these regexes; the failure was due to response format variance.
- **Risks / notes**: None. Backward compatible with unnumbered "TASK:".

### 2026-02-17 – Milestones prompt and extraction improvements

- **Agent / context**: Cursor AI – Reliably persist Project.milestones when generating a schedule.
- **Summary**:
  - **Prompt**: In **schedule-generation.ts** `buildTaskGenerationPrompt`, the MILESTONES section is now **required** (not "if partial schedule"). Instructions state "you MUST include exactly this block" and "Do not omit it", with 2–5 concrete deliverables and exact markers `===MILESTONES===` / `===END MILESTONES===`.
  - **Extraction**: In **parseTasks**, extraction now tries (1) exact markers, (2) case-insensitive markers and `===END\\s*MILESTONES===`, (3) fallback regex for "By end of week" / "deliverables" at end of response with a numbered list. Logs indicate which path was used.
  - **Persistence**: In **generate-schedule** route, milestone line parsing accepts `1. Title`, `1) Title`, and `-` / `*` / `•` bullets; skips boilerplate lines (e.g. "This represents", "Next period focus"); requires title length 3–250 chars before pushing to `milestonesForDb`.
- **Files touched**: `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Project.milestones was often null because Claude skipped the block or used different formatting; making it required and broadening parsing ensures milestones are saved when present.
- **Risks / notes**: None. Existing behavior unchanged when Claude still omits the block; then milestones remain null.

### 2026-02-17 – Schedule generation hang fixes (scheduler + coaching timeout)

- **Agent / context**: Cursor AI – Fix loading screen hanging forever; tasks not stored when generation never completed.
- **Summary**:
  - **Scheduler**: In **task-scheduler.ts**, the same-day dependency loop (`while (chosen && !canPlaceTaskInSlot(...))`) now has a cap: `tries < maxTries` with `maxTries = remainingTasks.length`, so the loop cannot run indefinitely if every candidate fails the same-day check.
  - **Milestones fallback regex**: In **schedule-generation.ts** `parseTasks`, fallback 2 (extract milestones from "By end of week" at end of response) now runs only on `tasksText.slice(-1500)` instead of the full string to avoid possible regex backtracking on long responses.
  - **Coaching message timeout**: In **generate-schedule** route, `generateScheduleCoachingMessage` is wrapped in `Promise.race` with a 15s timeout; on timeout or error the route uses the fallback greeting so the response is always returned and tasks are persisted.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Users reported infinite loading and tasks not saved; hang was likely in the scheduler’s dependency loop or in the coaching Claude call; safeguards ensure the route completes and writes tasks.

### 2026-02-17 – Session 2: Scheduler algorithm fixes + post-generation Harvey message

- **Agent / context**: Cursor AI – Six scheduler fixes and one feature applied sequentially; each verified with `tsc --noEmit`.
- **Summary**:
  - **Fix 1 – Emergency buffer slots misclassified**: **getSlotType** in `task-scheduler.ts` now treats a window as emergency if the block label/type *contains* `"emergency"` or `"late_night"` (e.g. `late_night_emergency`), not only exact match. Overnight windows (end &lt; start, start ≥ 22:00) are also classified as emergency. **getSlotType** accepts optional `endHours`; fixed and flexible call sites pass it so 22:00–02:00 is detected.
  - **Fix 2 – Week structure start_date forward**: Scheduler already iterates from **start_date** for `duration_weeks * 7` days (no calendar-week alignment). Added log `Schedule order (start_date forward): day0=… day1=…` and documented in **docs/task-generation/README.md** and **ARCHITECTURE.md** that the week is start_date forward.
  - **Fix 3 – Same-day dependency ordering**: In **assignTasksToSchedule**, added **canPlaceTaskInSlot(taskIndex, currentDate, slotStartHours, scheduledTasks)** so a dependent is not placed in a slot if any dependency on the same day ends *after* that slot start. When picking a task for a slot, we skip candidates that fail this check and try the next; if none fit, we leave the slot and move on so the dependent is placed later.
  - **Fix 4 – Weekend capacity (flexible_hours)**: **buildConstraintsFromProjectAndUser** now prefers **User.availabilityWindows** over **contextData.available_time** when the user has windows, so extracted **flexible_hours** is always used for capacity/slot end. When falling back to contextData, flexible blocks missing **flexible_hours** are normalized from boundary and a warning is logged. Scheduler comment clarified: capacity and slot end MUST use **flexible_hours** when present.
  - **Fix 5 – Weekend slots included**: Confirmed the assignment loop iterates all days (including Saturday/Sunday); no weekday-only filter. Documented in task-scheduler and **docs/task-generation/README.md** that weekend slots are filled when task volume or capacity requires it.
  - **Fix 6 – Post-generation Harvey coaching message**: After scheduling, the route builds a **ScheduleCoachingContext** (total tasks/hours, slot-type counts, weekend used/available, splits, start date, duration, energy_peak, preferred_session_length, project title/deadline/phases). **generateScheduleCoachingMessage(context)** in **schedule-generation.ts** calls Claude with a prompt to produce a 3–4 sentence coaching message (distribution, choices, what to focus on first, constraints). That message is used as the project discussion’s initial message; on API failure the route falls back to the previous hardcoded greeting. **ScheduleResult** and **ScheduledTaskAssignment** now include **weekendHoursUsed**, **weekendHoursAvailable**, and **slotType** for the coaching context.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`.
- **Motivation**: Correct emergency classification (label + overnight), clarify week-from-start-date behavior, enforce same-day dependency order, ensure flexible_hours drives capacity, document weekend inclusion, and replace the generic post-schedule greeting with an AI-generated coaching message.
- **Risks / notes**: Coaching message depends on Claude; fallback avoids blocking discussion creation. Same-day dependency check may leave some slots empty when a dependent cannot be placed before its dependency ends; that is intended.
- **Related docs**: `ARCHITECTURE.md` (task-scheduler, generate-schedule), `docs/task-generation/README.md`.

### 2026-02-17 – Session 1: Data layer and validation fixes (scheduler pipeline)

- **Agent / context**: Cursor AI – Four independent data-pipeline fixes applied sequentially; each verified with `tsc --noEmit` before proceeding.
- **Summary**:
  - **Fix 1 – energy_peak not loaded**: **user-service.ts** raw SQL in `getUserByIdRaw` did not SELECT `energy_peak`, and `updateUser` did not persist it. Added `energy_peak` to the SELECT and return object in `getUserByIdRaw`, and added an update branch for `data.energy_peak` in `updateUser`. Schedule generation now receives and logs the stored value (e.g. `energy_peak=evening`).
  - **Fix 2 – Schedule start date**: Added **Project.schedule_start_date** (DateTime?, migration `20260217185648_add_project_schedule_start_date`). Onboarding extraction prompt and route now extract `schedule_start_date` (natural language → ISO or "today"/"tomorrow"/"next Monday" resolved server-side via `parseScheduleStartDate`). **missing-fields.ts**: added `schedule_start_date` to ENRICHING_FIELDS and `fieldToNaturalDescription`. **ProjectShadowPanel**: new editable "Start date" field (formatted long date, date input). **generate-schedule** route prefers `project.schedule_start_date` when non-null (normalized to UTC noon for the calendar day); otherwise falls back to `calculateStartDate(constraints, userTimezone)`. **update-field** route accepts `schedule_start_date` for project scope (string → Date). **project-service** `UpdateProjectData` includes `schedule_start_date`.
  - **Fix 3 – Dependency validation for flexible tasks**: In **generate-schedule** route, replaced naive `depTime <= thisTaskTime` (which used midnight for flexible tasks and incorrectly dropped valid deps) with temporal ordering: **getEarliestStartMs** (fixed → scheduledStartTime; flexible → same day at `window_start`) and **getLatestEndMs** (fixed → scheduledEndTime or start+1h; flexible → same day at `window_end`). A dependency is valid when `depLatestEndMs <= thisEarliestStartMs`, so e.g. flexible 10:00–17:00 before fixed 20:00 on the same day is now accepted.
  - **Fix 4 – Flexible slot capacity**: In **task-scheduler** `buildAvailabilityMap`, flexible blocks are now classified by **either** `flexible_hours > 0` **or** `window_type === 'flexible'`. Slot capacity and slot end always use `flexible_hours` (slot end = start + flexible_hours, never boundary end). When `window_type === 'flexible'` but `flexible_hours` is missing, boundary duration is used and a warning is logged so weekend/flexible windows show correct capacity (e.g. 6h not 6.5h when flexible_hours is 6).
- **Files touched**: `src/lib/users/user-service.ts`, `src/prisma/schema.prisma`, `src/lib/projects/project-service.ts`, `src/app/api/onboarding/extract/route.ts`, `src/app/api/onboarding/update-field/route.ts`, `src/lib/onboarding/missing-fields.ts`, `src/components/onboarding/ProjectShadowPanel.tsx`, `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/schedule/task-scheduler.ts`, new migration `20260217185648_add_project_schedule_start_date`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`, `docs/settings/README.md`.
- **Motivation**: Unblock scheduler: energy_peak was never read; start date was never asked or stored; valid dependencies were dropped when comparing flexible to fixed times; flexible windows showed boundary-based capacity instead of `flexible_hours`.
- **Risks / notes**: Run new migration for `schedule_start_date`. Existing projects have null start date and continue to use default (tomorrow/next Monday). No changes to regenerateSchedule (full_rebuild) for start date — it still uses `calculateStartDate` from constraints.
- **Related docs**: `ARCHITECTURE.md` (User, Project, schedule flow), `docs/task-generation/README.md`, `docs/settings/README.md`.

### 2026-02-17 – Scheduler debug logs + no re-extraction on Build Schedule

- **Agent / context**: Cursor AI – Two tasks: (1) add structured scheduler logs for debugging task placement; (2) ensure generate-schedule uses DB-only constraints (no re-extraction when user clicks "Build my schedule").
- **Summary**:
  - **Task 1 – Scheduler logs**: Format `[Module] Category: message`. **task-scheduler.ts**: `buildAvailabilityMap()` logs every slot as `SlotMap: day HH:MM-HH:MM → type=… capacity=…`. `assignTasksToSchedule()` logs: task order (`TaskOrder` with energy, priority, preferred_slot); slot matching attempts and outcomes (`SlotMatch` assigned / no X slot found trying Y); dependency conflicts (`DependencyCheck` CONFLICT + rescheduling note); day-1 ramp-up (`RampUp` deferring task); gap insertion (`Gap` 15min after …); fragment rejection (`Fragment` slot size vs task need); emergency usage; per-day capacity (total/used/remaining); final `Summary: scheduled=… unscheduled=… total_hours=… emergency_used=…`. **schedule-generation.ts**: `logCapacityBreakdown(constraints)` logs `Capacity: flexible_windows=… + fixed_windows=… + weekend=… + emergency=… → total=… (emergency excluded from usable=…)`; each parsed task logged with `energy_required` and `preferred_slot`. **generate-schedule route**: logs `SchedulerOptions` passed to scheduler; each task record with `energy_required`, `preferred_slot`, `is_flexible`.
  - **Task 2 – No re-extraction**: Generate-schedule **Step 5** now explicitly loads constraints from DB only. Logs: `Step 5: Loading constraints from DB (no re-extraction) ✅` and `Loaded: energy_peak=…, skill_level=…, weekly_hours=…, windows=…`. The route already used `buildConstraintsFromProjectAndUser(project, dbUser)` and did not call `extractConstraints`; the change is clarifying logs and comments so it is clear conversation text is used only for **task generation context** (Step 6), not for re-extracting constraints. Extraction during onboarding is unchanged.
- **Files touched**: `src/lib/schedule/task-scheduler.ts`, `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`.
- **Motivation**: Debug task placement decisions; prevent silent overwrite of Project Shadow panel data when user clicks Build Schedule (constraints must come from already-extracted DB state).
- **Risks / notes**: Log volume increases during schedule generation; consider log level or feature flag if too noisy in production.
- **Related docs**: `ARCHITECTURE.md` (generate-schedule flow), `docs/task-generation/README.md`.

### 2026-02-17 – Session 4: Personalized Smart Scheduler

- **Agent / context**: Cursor AI – Add intelligence to the scheduler: User energy peak, task scheduling metadata from Claude, smart slot assignment, breathing room, day-1 ramp-up, phase front-loading.
- **Summary**:
  - **User.energy_peak**: New optional field `"morning" | "afternoon" | "evening"`; added to ENRICHING_FIELDS and onboarding extract prompt; Harvey asks about it naturally when missing.
  - **Task scheduling metadata**: Task model and ParsedTask now have `energy_required` ("high"|"medium"|"low") and `preferred_slot` ("peak_energy"|"normal"|"flexible"). Claude outputs these per task (ENERGY_REQUIRED / PREFERRED_SLOT); prompt includes SCHEDULING METADATA section and calibration rules from user/project notes. Parser extracts and validates; generate-schedule route persists them on Task records.
  - **Smart slot assignment**: `task-scheduler.ts` introduces `SlotType` (peak_energy, normal, flexible, emergency). `getSlotType(day, startHours, windowType, blockType, energyPeak)` classifies each slot; weekend → flexible; late_night/emergency → emergency (used last). `buildAvailabilityMap` accepts `energyPeak` and sets `slotType` on each slot. Tasks ordered by dependency, then within layer by priority and energy_required (high first). When filling slots, `pickTaskForSlot` prefers task whose `preferred_slot` matches slot type; two-pass loop (non-emergency first, then emergency). **Breathing room**: 15-minute gap between consecutive tasks in the same window. **Minimum fragment**: 30 minutes when splitting. **Day-1 ramp-up**: When user/project notes mention "losing motivation" or "lacking motivation", first day gets max 2 tasks and prefers medium/low energy. **Phase front-loading**: Day-by-day iteration naturally front-loads; no extra bias added.
  - **Route**: generate-schedule builds `SchedulerOptions` (energyPeak, preferredSessionLength, userNotes, projectNotes, phases, rampUpDay1), passes to `assignTasksToSchedule`; Task creation includes `energy_required` and `preferred_slot`. `buildConstraintsFromProjectAndUser` returns `energy_peak` and sets `window_type` + `label` (from AvailabilityWindow.type) on available_time blocks for scheduler classification.
- **Files touched**: `src/prisma/schema.prisma`, `src/lib/onboarding/missing-fields.ts`, `src/app/api/onboarding/extract/route.ts`, `src/types/user.types.ts`, `src/types/api.types.ts`, `src/types/task.types.ts`, `src/lib/schedule/schedule-generation.ts`, `src/lib/schedule/task-scheduler.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`, `docs/settings/README.md`. Migration: `20260217153250_add_energy_peak_and_task_scheduling_metadata`.
- **Motivation**: Place high-focus tasks in the user's peak energy window and respect user/project notes for duration calibration and day-1 ramp-up; avoid back-to-back tasks and tiny fragments.
- **Risks / notes**: regenerateSchedule (full_rebuild) does not pass SchedulerOptions; it uses default (no energy peak, no ramp-up). Existing tasks without energy_required/preferred_slot remain valid. Run migration to add User.energy_peak and Task.energy_required, Task.preferred_slot.
- **Related docs**: `ARCHITECTURE.md` (schedule section, User, Task), `docs/task-generation/README.md`, `docs/settings/README.md`.

### 2026-02-17 – Session 3: Milestone Storage + Schedule Duration Persistence

- **Agent / context**: Cursor AI – Persist two pieces of data that Claude already produces during schedule generation: milestones and schedule span in days.
- **Summary**:
  - **Schema**: Project model now has `milestones Json?` (array of milestone objects from schedule generation) and `schedule_duration_days Int?` (calendar days the schedule spans). Migration: `20260217160000_add_project_milestones_and_schedule_duration_days`.
  - **Generate-schedule route**: After tasks are created, the route parses the milestones string from `parseTasks` into an array of `{ title }`, computes `schedule_duration_days` from min/max task `scheduledDate`, and updates the project in a single `prisma.project.update`. TODO comment added for moving `schedule_duration_days` to a Schedule/Batch model when Feature 8 (multi-generation) ships.
  - **Project Details page**: New read-only **Milestones** section (only when `project.milestones` is non-null and non-empty). Renders as a list consistent with Phases and Harvey's Notes; supports array of `{ title }` or legacy string (split by newlines). `SerializedProject` and server serialization include `milestones` and `schedule_duration_days`.
- **Files touched**: `src/prisma/schema.prisma`, `src/prisma/migrations/20260217160000_add_project_milestones_and_schedule_duration_days/migration.sql`, `src/app/api/schedule/generate-schedule/route.ts`, `src/app/dashboard/project/[projectId]/page.tsx`, `src/components/dashboard/ProjectDetailsForm.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/task-generation/README.md`.
- **Motivation**: Persist data Claude already generates instead of discarding it; show schedule milestones on the project details page.
- **Risks / notes**: No prompt or scheduler logic changes. Milestones are not shown on the onboarding shadow panel (they exist only after schedule generation). Run `npm run prisma:migrate:dev` (or deploy migration) to apply the new columns.
- **Related docs**: `ARCHITECTURE.md` (Project model, schema.prisma), `docs/task-generation/README.md`.

### 2026-02-17 – Session 2: Flexible Availability Windows + Scheduler Fix

- **Agent / context**: Cursor AI – Implement plan to fix scheduler ignoring daytime availability (schedules used ~14h/week instead of 37h) by adding fixed vs flexible windows, scheduler capacity from flexible_hours, and timeline display for flexible tasks.
- **Summary**:
  - **Schema**: Task model now has `window_start`, `window_end` (String?), `is_flexible` (Boolean, default false). Shared type **AvailabilityWindow** in `src/types/user.types.ts` (days, start_time, end_time, type, window_type: 'fixed' | 'flexible', flexible_hours?).
  - **Extraction**: Onboarding extract prompt (`src/app/api/onboarding/extract/route.ts`) distinguishes FIXED (specific block every day) vs FLEXIBLE (X hours within a boundary); `computeWeeklyHoursFromAvailabilityWindows` uses `flexible_hours * days.length` for flexible windows.
  - **Scheduler**: TimeBlock extended with `flexible_hours`, `window_type`. `buildConstraintsFromProjectAndUser` includes all windows; flexible windows push blocks with `flexible_hours`. `buildAvailabilityMap` (task-scheduler) creates slots with capacity = flexible_hours for flexible blocks (no work/commute subtraction). `assignTasksToSchedule` sets `isFlexible`, `windowStart`, `windowEnd` on assignments; generate-schedule route persists `scheduledStartTime`/`scheduledEndTime` null and `window_start`/`window_end`/`is_flexible` for flexible tasks. `calculateTotalAvailableHours` and `calculateBlockMinutes` use flexible_hours when set. `getTaskScheduleData` returns null times and window bounds for flexible tasks; regenerateSchedule full_rebuild passes new Task fields.
  - **Timeline UI**: DashboardTask has `isFlexible`, `windowStart`, `windowEnd`. `transformToDashboardTask` maps them; flexible tasks get start/end from window for ordering. TaskTile and TaskModal show "During work hours · 2h" (or morning/afternoon/evening) for flexible tasks via `getFlexibleWindowLabel`.
  - **Chat route**: `todayFormatted` now uses `timeZone: 'Europe/Paris'` so Harvey's date is Paris time, not UTC.
- **Files touched**: `src/prisma/schema.prisma`, `src/types/user.types.ts`, `src/types/api.types.ts`, `src/types/task.types.ts`, `src/app/api/onboarding/extract/route.ts`, `src/lib/schedule/schedule-generation.ts`, `src/lib/schedule/task-scheduler.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/chat/tools/regenerateSchedule.ts`, `src/lib/tasks/task-service.ts`, `src/components/dashboard/TaskTile.tsx`, `src/components/dashboard/TaskModal.tsx`, `src/app/api/chat/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/settings/README.md`, `docs/task-generation/README.md`.
- **Motivation**: Scheduler was effectively dropping daytime capacity because fixed 9–5 windows were added then fully subtracted by User workSchedule, leaving 0h. Flexible windows (e.g. "3h during 9–5") now contribute 3h capacity and tasks are stored with window bounds and no fixed time; UI shows "During work hours · Xh".
- **Risks / notes**: Existing tasks without `is_flexible`/window fields display as before. Regenerate (full_rebuild) creates tasks with new shape when assignments are flexible. Rescheduling (remaining scope) does not create new tasks from scratch—only full rebuild does.
- **Related docs**: `ARCHITECTURE.md` (User.availabilityWindows, Task, task-scheduler, buildConstraintsFromProjectAndUser), `docs/settings/README.md`, `docs/task-generation/README.md`.

### 2026-02-17 – Session 1: Date Awareness + Missing Fields Injection

- **Agent / context**: Cursor AI – Implement plan: fix Harvey date confusion and gate “Build my schedule” on critical fields (specific tech stack, skill level, etc.).
- **Summary**:
  - **Fixed**: Harvey now correctly references today’s date using an unambiguous long format (“Monday, February 17, 2026”) at the top of the onboarding system prompt; “Build my schedule” button now requires specific tech tools (not vague descriptions like “web app”) and other blocking fields before activating.
  - **Added**: `computeMissingFields(projectId, userId)` in `src/lib/onboarding/missing-fields.ts` that loads fresh project/user from DB and returns blocking vs enriching missing fields; dynamic missing-fields guidance injected into onboarding system prompt via `buildMissingFieldsGuidance()`; two-tier field system (blocking: description, availabilityWindows, tools_and_stack, skill_level; enriching: preferred_session_length, weekly_hours_commitment); extract API returns `missingBlockingFields` and `missingEnrichingFields`; onboarding page uses `missingBlockingFields` so `canBuild` is true only when field completeness ≥ 40% and no blocking fields are missing.
- **Files touched**: `src/lib/ai/prompts.ts`, `src/app/api/chat/route.ts`, `src/lib/onboarding/missing-fields.ts` (new), `src/app/api/onboarding/extract/route.ts`, `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `architecture.md`, `docs/onboarding/README.md`.
- **Motivation**: Harvey sometimes used the wrong date for “in 6 days” / “next Friday”; users could hit “Build my schedule” with vague `tools_and_stack: ["web app"]` and `skill_level: null`, producing generic schedules. Now date is explicit and the button is gated on real, specific data.
- **Risks / notes**: `tools_and_stack` is treated as missing when it only contains vague terms (blocklist: “web app”, “app”, “AI”, etc.). Restore does not return `missingBlockingFields`; after restore the next extraction populates it.
- **Related docs**: `ARCHITECTURE.md` (chat route, onboarding, extract API), `docs/onboarding/README.md`.

### 2026-02-17 – Schedule generation analysis (current version)

- **Agent / context**: Codex – Updated schedule generation walkthrough per user request after recent changes.
- **Summary**:
  - Reviewed current task generation and scheduling pipeline, including new DB-based constraint build, prompt enrichment, and dependency ordering.
  - Documented gaps (unused extracted fields, parsing limitations, and scheduling omissions) in chat response; no code changes.
- **Files touched**: `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Provide an accurate, up-to-date explanation of the current schedule generation behavior.
- **Risks / notes**: None (analysis only).
- **Related docs**: `docs/task-generation/README.md`, `ARCHITECTURE.md`.

### 2026-02-16 – Build Schedule uses last extracted data (no second extraction)

- **Agent / context**: Cursor AI – Use last onboarding extraction when user clicks "Build Schedule" instead of re-running extractConstraints().
- **Summary**:
  - When the user clicks "Build Schedule", the generate-schedule route now loads full Project and User from the DB and builds `ExtractedConstraints` via new **buildConstraintsFromProjectAndUser(project, user)**. No second Claude extraction; the data used is exactly what the Shadow Panel shows (from the last POST /api/onboarding/extract after each Harvey message).
  - **schedule-generation.ts**: Added `buildConstraintsFromProjectAndUser()` to map DB shape to ExtractedConstraints (available_time from User.availabilityWindows or contextData; schedule_duration_weeks from contextData or target_deadline; work_schedule/commute from User with onboarding vs legacy shape; enrichment from Project/User; notes/phases normalized). Prefers Project.contextData when present (e.g. manual Settings). Empty availability falls back to default weekday evenings with a warning.
  - **generate-schedule/route.ts**: After loading the onboarding discussion, loads project (getProjectById) and user (getUserById); replaces Step 5 (extractConstraints) with buildConstraintsFromProjectAndUser(project, dbUser); still writes contextData from built constraints so Settings and chat tools keep seeing available_time; removed project/user enrichment writes (data already in DB from last extraction). Preserves contextData.one_off_blocks when updating.
- **Files touched**: `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Avoid duplicate extraction and use the same data the user sees in the Shadow Panel; if the user replies after Harvey says "click the button," the next extraction updates the panel and that becomes the data used when they click Build Schedule.
- **Risks / notes**: extractConstraints() remains in schedule-generation.ts for potential use by full rebuild or other flows. If User.availabilityWindows is missing/empty, a default available_time is used so scheduling does not fail.
- **Related docs**: `ARCHITECTURE.md` (schedule generation, API routes), `docs/schedule-generation.md`, `docs/task-generation/README.md`.

### 2026-02-16 – Schedule Generation Improvements

- **Agent / context**: Cursor AI – Fix critical bugs and integrate enriched extraction data into schedule generation (Sprint Task A follow-up).
- **Summary**:
  - **Fixed**: `skill_level` was read from wrong path (`preferences.skill_level` → `skill_level` top-level). Extraction stores it at top-level; all users were previously treated as "intermediate".
  - **Fixed**: Dependency order was destroyed by a second sort by priority in `task-scheduler.ts`. Removed priority re-sort after topological sort so "Build authentication" cannot be scheduled before "Setup database".
  - **Added**: Integration with enriched extraction: motivation, phases, target_deadline, tech stack, project_type, preferred_session_length, project_notes, communication_style in `buildTaskGenerationPrompt()`. New prompt sections: USER CONTEXT, PROJECT PHASES, CRITICAL PROJECT CONTEXT, COMMUNICATION STYLE; new rules: SPECIFICITY REQUIREMENTS, SESSION LENGTH OPTIMIZATION, DEADLINE PACING.
  - **Changed**: `buildTaskGenerationPrompt()` now uses 12+ context fields for personalization; task-scheduler orders tasks by dependency only (no priority re-sort). Comment added that `gym`, `energy_peak`, `break_preference` are extracted but not yet used in task generation (future feature).
- **Files touched**: `src/lib/schedule/schedule-generation.ts`, `src/lib/schedule/task-scheduler.ts`, `ai_agent_changelog.md`, `docs/task-generation/README.md`, `architecture.md`.
- **Motivation**: Correct skill level and dependency ordering; leverage Task A extraction improvements so generated tasks are specific (tool names, session-sized, deadline-paced) and tone matches communication style.
- **Risks / notes**: Prompt is longer; keep under ~2500 words. No change to `parseTasks()` or `assignTasksToSchedule()` logic other than the dependency sort fix.
- **Related docs**: `ARCHITECTURE.md` (schedule-generation, task-scheduler), `docs/task-generation/README.md` (Task Dependencies, dependency sorting).

### 2026-02-15 – Onboarding smart prompt: date handling and known-info context

- **Agent / context**: Cursor AI – Wire new onboarding system prompt with current date, day, and known-information summary; avoid duplicate questions and improve date calculations.
- **Summary**:
  - **prompts.ts**: Replaced static `ONBOARDING_SYSTEM_PROMPT` with a function `(currentDate, currentDay, knownInfo) => string`. Prompt now receives today’s date (YYYY-MM-DD), weekday (e.g. "Saturday"), and a generated summary of already-extracted info so Harvey doesn’t re-ask and can compute relative dates ("next Monday", "tomorrow") correctly. Added `generateKnownInfoSummary(projectData, userData)` to build that summary from project/user records (known vs still-missing fields).
  - **Chat route** (`/api/chat`): For onboarding context, computes `currentDate` and `currentDay`, fetches project with user when `projectId` exists, calls `generateKnownInfoSummary(project, project.user)`, and passes `ONBOARDING_SYSTEM_PROMPT(currentDate, currentDay, knownInfo)` into `streamText()`. First message uses "Starting fresh" summary; subsequent messages get up-to-date known info so Harvey references the Shadow Panel and skips already-gathered data.
  - **Extraction**: Added `task_preference` ("quick_wins" | "deep_focus" | "mixed") to project extraction schema and merge/save; added `Project.task_preference` in Prisma schema and `UpdateProjectData`; documented `preferred_session_length` in extraction field guidance (already extracted and saved).
- **Files touched**: `src/lib/ai/prompts.ts`, `src/app/api/chat/route.ts`, `src/app/api/onboarding/extract/route.ts`, `src/prisma/schema.prisma`, `src/lib/projects/project-service.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Harvey should never ask the same question twice, calculate dates accurately from "next Thursday" etc., and direct users to the Shadow Panel for completion instead of repeating a text recap.
- **Risks / notes**: Run `npx prisma migrate dev` (or equivalent) to add `task_preference` column if not using db push. Restore flow and Shadow Panel unchanged; extraction continues to run after each message and knownInfo is rebuilt each request from DB.
- **Related docs**: `ARCHITECTURE.md` (chat route, onboarding), `docs/onboarding/README.md`.

### 2026-02-14 – Schedule generation analysis (no code changes)

- **Agent / context**: Codex – Reviewed schedule generation pipeline and prompts to explain behavior for user request.
- **Summary**:
  - Audited schedule generation flow, prompts, parsing, and scheduling logic to produce a detailed walkthrough.
  - No runtime or data changes; explanation delivered in chat response.
- **Files touched**: None (read-only review). Key files inspected: `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/schedule/schedule-generation.ts`, `src/lib/schedule/task-scheduler.ts`, `src/types/api.types.ts`, `src/types/task.types.ts`, `docs/task-generation/README.md`.
- **Motivation**: Provide a clear explanation of how schedule generation works, including prompts, data passed to Claude, and scheduling/dependency mechanics.
- **Risks / notes**: None (no code changes).
- **Related docs**: `docs/task-generation/README.md`, `ARCHITECTURE.md`.

### 2026-02-14 – Rescheduling implementation analysis (no code changes)

- **Agent / context**: Codex – Read-only analysis request: explain current rescheduling behavior, identify incoherence sources, and outline fixes.
- **Summary**: Reviewed rescheduling flow across skip feedback, smart suggestion, single-task reschedule API, and regenerate_schedule (remaining/full rebuild). Identified key logic gaps (end-time not updated on reschedule, dependency ordering bug, timezone/day alignment issues, and overnight-slot handling).
- **Files touched**: None (read-only review). Key files inspected: `src/lib/tasks/smart-reschedule.ts`, `src/app/api/tasks/[taskId]/suggestion/route.ts`, `src/app/api/tasks/[taskId]/reschedule/route.ts`, `src/lib/chat/tools/modifySchedule.ts`, `src/lib/chat/tools/regenerateSchedule.ts`, `src/lib/schedule/task-scheduler.ts`, `src/components/dashboard/chat/SkipFeedbackWidget.tsx`, `src/components/dashboard/chat/ReschedulePromptWidget.tsx`, `src/lib/tasks/task-service.ts`, `src/app/api/tasks/[taskId]/route.ts`.
- **Motivation**: Provide a precise, file-specific explanation before implementing fixes.
- **Risks / notes**: None (no code changes).
- **Related docs**: `ARCHITECTURE.md` (chat tools + schedule).

### 2026-02-14 – Onboarding implementation walkthrough (no code changes)

- **Agent / context**: Codex – Read-only analysis request: explain current onboarding implementation and extraction flow.
- **Summary**: Reviewed onboarding chat flow, extraction endpoints, prompts, and schema usage to produce a detailed walkthrough; no code or schema changes made.
- **Files touched**: None (read-only review). Key files inspected: `src/app/onboarding/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/onboarding/extract/route.ts`, `src/lib/ai/prompts.ts`, `src/components/onboarding/ProjectShadowPanel.tsx`, `src/lib/schedule/schedule-generation.ts`, `src/types/api.types.ts`, `src/prisma/schema.prisma`, `src/app/api/onboarding/restore/route.ts`.
- **Motivation**: Provide the user with an accurate, file-specific explanation before making improvements.
- **Risks / notes**: None.
- **Related docs**: `ARCHITECTURE.md` (onboarding + API routes), `docs/onboarding/README.md`.

### 2026-02-14 – Feature D (Shadow Panel) Batch 5: Harvey-controlled completion (confidence-based progress)

- **Agent / context**: Cursor AI – Replace mechanical field-count progress with Harvey’s self-assessed confidence. Progress bar and button state now use Harvey’s confidence (0–100) plus a hidden field-completeness minimum (40%).
- **Summary**:
  - **Extraction prompt** (in `extract/route.ts`): Added instructions for Harvey to output `completion_confidence` (0–100) reflecting depth of understanding, not just filled fields. Conservative scale (e.g. 80%+ only when genuinely ready); guidance that shallow answers across many fields = 50–60%, rich answers in fewer fields = 75–85%.
  - **Extract API**: Parses and validates `completion_confidence` (default 0 if missing, clamp 0–100); returns it in the response as `completion_confidence`; logs “Harvey’s confidence: X%”.
  - **Onboarding page**: New state `harveyConfidence` (init 0), set from extraction response. Renamed `calculateExtractionProgress` → `calculateFieldCompleteness` (internal only; user never sees this). Button logic: (1) Disabled when `fieldCompleteness < 40%`; (2) Stage 1 when ≥40% and `harveyConfidence < 80%` and no completion marker (enabled, “Build Schedule”, “Better results with more info”, modal on click); (3) Stage 2 when ≥40% and (`harveyConfidence ≥ 80%` or `hasCompletionMarker`) (direct to schedule, “Harvey is ready!”). Confirmation modal shows “Harvey’s confidence” and bar. Dev log: “Field completeness: X% | Harvey’s confidence: Y%”.
  - **ProjectShadowPanel**: Prop `progress` replaced by `harveyConfidence`. Header label “Completion” → “Harvey’s Confidence”; bar value is `harveyConfidence`.
- **Files touched**: `src/app/api/onboarding/extract/route.ts`, `src/app/onboarding/page.tsx`, `src/components/onboarding/ProjectShadowPanel.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Progress previously hit a ceiling when all extractable fields were filled (77–85%), while Harvey might still need follow-ups. Let Harvey decide readiness; shallow answers keep confidence lower even with many fields filled.
- **Risks / notes**: Restore does not return `completion_confidence`; after restore with `extracted`, confidence stays 0 until the next extraction (e.g. after user sends another message). Invalid or missing confidence from extraction defaults to 0.
- **Related docs**: `ARCHITECTURE.md` (onboarding, extract API), `docs/onboarding/README.md`.

### 2026-02-14 – Feature D (Shadow Panel) Batch 4: Reload persistence (restore session on refresh)

- **Agent / context**: Cursor AI – When the user refreshes during onboarding, restore the existing conversation and extracted data instead of starting fresh; avoid duplicate projects. On restore, fetch stored project/user from DB instead of calling the extraction API to save cost.
- **Summary**:
  - **New API**: `GET /api/onboarding/restore`. Optional query `projectId`. Auth required. If `projectId` provided: load that project’s onboarding discussion (ownership verified); if not: find user’s active projects (status=active, order createdAt desc), take the first that has an onboarding discussion with messages. Returns `{ restore: true, projectId, messages, completed?, extracted? }` or `{ restore: false }`. When restoring, also loads full project and user from DB and returns `extracted: { user, project }` in the same shape as the extraction API, so the client can populate the shadow panel without calling `POST /api/onboarding/extract`. If any assistant message contains `COMPLETION_MARKER`, sets `completed: true` so the client can redirect.
  - **Onboarding page**: On mount, `useEffect` calls `/api/onboarding/restore` (with `?projectId=` from URL if present). If `data.completed`, redirect to `/dashboard`. If `data.restore`, set `restoreData` (projectId, messages, and `extracted` when present) and render chat with that; otherwise render with default greeting. **On restore with `extracted`**: shadow panel is filled from `extracted` (no extraction API call). If restore returns no `extracted`, client falls back to calling extraction. Loading state `restoringSession` shows “Loading your conversation…” until restore finishes. Chat content is split into **OnboardingChatContent** which receives `initialMessages`, `initialProjectId`, and optional `initialExtracted`; it calls `useChat({ messages: initialMessages, ... })` and on mount when `initialProjectId` is set either applies `initialExtracted` to shadow state or runs extraction. Priority: URL `projectId` param > existing project from restore > new session.
  - **No duplicates**: Restored session reuses the same projectId so the next message goes to the existing discussion; no new project or discussion is created.
- **Files touched**: `src/app/api/onboarding/restore/route.ts` (new), `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Refresh during onboarding currently resets the UI and creates a new project on next message; users expect to see their previous messages and continue in the same project.
- **Risks / notes**: Restore runs once on mount; if the user has multiple active projects with onboarding, the most recent (by createdAt) is used. Completed onboarding (marker in discussion) redirects to dashboard.
- **Related docs**: `ARCHITECTURE.md` (onboarding page, API routes), `docs/onboarding/README.md`.

### 2026-02-14 – Feature D (Shadow Panel) Batch 3: Click outside to cancel edit

- **Agent / context**: Cursor AI – When editing a field in the Shadow Panel, clicking outside the edit area cancels editing (reverts changes), same as clicking the Cancel button.
- **Summary**:
  - **EditableField** in **ProjectShadowPanel**: The edit area (inputs/textareas + Save/Cancel buttons) is wrapped in a `div` with a ref. When `isEditing` is true, a `mousedown` listener is attached to `document`. If the event target is not inside the ref, `cancelEditing()` is called. The listener is removed when exiting edit mode or on unmount.
  - Clicks inside the edit area (inputs, textareas, Save/Cancel) do not trigger cancel because they are inside the ref. Only clicks outside cancel.
- **Files touched**: `src/components/onboarding/ProjectShadowPanel.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Improve UX so users can dismiss the edit state without having to find the Cancel button.
- **Risks / notes**: None. Works for all field types (text, textarea, phases, work schedule, availability, etc.) since the ref wraps the entire edit block.
- **Related docs**: `ARCHITECTURE.md` (ProjectShadowPanel), `docs/onboarding/README.md`.

### 2026-02-14 – Phases: canonical storage and panel display for flat format

- **Agent / context**: Cursor AI – Fix phases not showing in the Shadow Panel and align storage with the canonical nested format.
- **Summary**:
  - **Root cause**: (1) Extraction prompt only said `"phases": object | null`, so the model often returned a flat map like `{ phase_1: "string", phase_2: "string" }`, which was saved as-is. (2) The panel’s `normalizePhasesToArray` treated object values as `{ name, description }`; when the value was a plain string it produced empty name/description, so phases appeared blank or not at all.
  - **Extraction**: Prompt now requires the canonical shape `{ "phases": [ { "id", "title", "goal", "status", "deadline" } ], "active_phase_id" }` with field-specific guidance. Added `normalizePhasesToCanonical(raw)` in the extract route: if the model returns the flat format (`phase_1: "string"`), it is converted to the canonical format before save and before returning to the client. Existing nested `phases` arrays are passed through with normalized fields.
  - **Panel**: For the object format, when a phase value is a string (e.g. `phase_1: "Design the project..."`), it is now shown as the phase name so existing DB data displays correctly. When saving from the panel, phases are always persisted in the canonical format (`phasesToCanonical`) so the DB no longer stores the flat key-value shape.
- **Files touched**: `src/app/api/onboarding/extract/route.ts`, `src/components/onboarding/ProjectShadowPanel.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Phases were stored as `{ phase_1: "…", phase_2: "…" }` and the panel did not show them; the desired format is the nested structure used elsewhere (e.g. post project).
- **Risks / notes**: Existing projects with flat phases will display correctly; the next extraction or an edit+save from the panel will rewrite phases in the canonical format.
- **Related docs**: `ARCHITECTURE.md` (onboarding extract), `docs/onboarding/README.md`.

### 2026-02-14 – Feature D (Shadow Panel) Batch 2: Phases Support

- **Agent / context**: Cursor AI – Add phases display and inline editing in the Shadow Panel, and fix completion calculation so phases contribute +8% only when they have content.
- **Summary**:
  - **Phases in Project Info**: **ProjectShadowPanel** now shows a “Project Phases” field (after motivation, before project notes) when `fields.project.phases` exists and has content. Three extraction formats are supported: direct array `[{name, description, status}]`, nested `{ phases: [{ title, goal, status }] }`, and object `{ phase_1: {}, phase_2: {} }`. Display normalizes to a list with left border (purple-200), phase name (font-medium), description (text-xs), and status badge (completed=green, active=purple, future=gray).
  - **Editable phases**: Phases use the same **EditableField** pattern: Edit opens a form with Phase N (name input, description textarea, status dropdown: future/active/completed), Remove per phase, and “Add Phase” at the bottom. On save, the value is converted back to the same format as the input (array, nested, or object) and sent via `PATCH /api/onboarding/update-field`. Empty phases are saved as `[]`, `{ phases: [] }`, or `{}` depending on format.
  - **Completion calculation**: In **onboarding/page.tsx**, `calculateExtractionProgress` no longer adds the phases weight (8 points) for empty phases. New helper `hasPhasesContentForProgress(raw)` returns true only for: non-empty array, object with non-empty `phases` array, or object with at least one `phase_*` key. Empty `{}` or `[]` do not count; adding phases with content correctly increases completion by 8%.
- **Files touched**: `src/components/onboarding/ProjectShadowPanel.tsx`, `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Phases were extracted and stored but not shown or editable; completion could decrease when phases were present. Align UI and progress with actual phases content.
- **Risks / notes**: Phases field is only rendered when `hasPhasesContent(project.phases)`; null/undefined/empty object/empty array do not show the field. Removing all phases in edit saves an empty structure per original format.
- **Related docs**: `ARCHITECTURE.md` (ProjectShadowPanel, onboarding page), `docs/onboarding/README.md`.

### 2026-02-14 – Feature D (Shadow Panel) Batch 1: Quick UI Fixes

- **Agent / context**: Cursor AI – Polish Shadow Panel: single progress indicator, sticky completion bar, notes as bullet points.
- **Summary**:
  - **Single progress bar**: Removed the old “Setting up your project” progress bar (OnboardingProgress) from the onboarding page. The only progress indicator is now the “Completion X%” bar inside ProjectShadowPanel.
  - **Sticky header**: ProjectShadowPanel header (title, completion bar, “Extracting…” indicator) is sticky at the top when scrolling. Uses `sticky top-0`, `z-10`, `bg-[#FAF9F6]`, and `border-b border-gray-200` so the bar stays visible and content scrolls underneath.
  - **Notes as bullets**: userNotes and projectNotes are split on “.” and rendered as `<ul>` bullet lists; edit mode uses a textarea with placeholder “separate points with periods”. Empty segments are filtered out.
- **Files touched**: `src/app/onboarding/page.tsx`, `src/components/onboarding/ProjectShadowPanel.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Reduce duplicate progress UI, keep extraction status visible while scrolling, and improve readability of multi-point notes.
- **Risks / notes**: OnboardingProgress component remains in the codebase but is no longer used on the onboarding page. Notes stored as JSON from older extraction are stringified for display and edited as plain text.
- **Related docs**: `ARCHITECTURE.md` (onboarding page, ProjectShadowPanel), `docs/onboarding/README.md`.

### 2026-02-13 – Feature D (Shadow Panel) Step 7: Inline Field Editing

- **Agent / context**: Cursor AI – Allow users to correct extracted fields in the Shadow Panel with per-field Edit / Save / Cancel (Step 7).
- **Summary**:
  - **New API**: `PATCH /api/onboarding/update-field`. Body: `{ projectId, scope: 'user' | 'project', field, value }`. Auth via Supabase; validates project ownership with `getProjectById(projectId, user.id)`; updates one field via `updateUser` or `updateProject`. Converts `target_deadline` string to Date for project. Returns `{ success, updated }` or 401/400/404/500.
  - **ProjectShadowPanel**: New props `projectId` (optional) and `onFieldUpdate(scope, field, value)` (optional). State: `editingField` (composite key `scope:fieldKey`), `editValue`, `saving`. One field in edit mode at a time; other Edit buttons disabled. **EditableField** wrapper: label, Edit button (when not editing), display vs edit slot, Save/Cancel. Escape key cancels edit.
  - **Editable fields**: Title, description, goals, project_type, target_deadline, motivation, projectNotes (project); workSchedule (user, day grid + start/end time); availabilityWindows (user, multiple blocks with type, days, times, add/remove block); weekly_hours_commitment (project); timezone, preferred_session_length, communication_style, userNotes (user); skill_level, tools_and_stack (project, add/remove pills). Phases and commute remain display-only.
- **Files touched**: `src/app/api/onboarding/update-field/route.ts` (new), `src/components/onboarding/ProjectShadowPanel.tsx`, `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Users can fix extraction mistakes without re-chatting; each field has its own Save/Cancel for clear feedback and no accidental overwrites.
- **Risks / notes**: Commute and phases not editable in this step. Validation is minimal (e.g. empty title can be saved). Optimistic update is via `onFieldUpdate` merging into `shadowFields`; no refetch.
- **Related docs**: `ARCHITECTURE.md` (API routes, ProjectShadowPanel), `docs/onboarding/README.md`.

### 2026-02-13 – Feature D (Shadow Panel) Step 6: Button + Progress Logic

- **Agent / context**: Cursor AI – Implement smart “Build My Schedule” button with three states and weighted extraction progress (Step 6).
- **Summary**:
  - **Progress**: `calculateExtractionProgress(shadowFields)` returns 0–100 from weighted fields (title, description/goals, availability, weekly_hours, deadline, project_type, skill_level, tools_and_stack, motivation, phases, workSchedule, commute, preferred_session_length, communication_style, timezone, userNotes, projectNotes). `hasMinimumFields(shadowFields)` requires title, description or goals, non-empty availabilityWindows, and weekly_hours_commitment > 0.
  - **Completion marker**: State `hasCompletionMarker` set in `onFinish` when last assistant message contains `COMPLETION_MARKER` (PROJECT_INTAKE_COMPLETE); used to show “Harvey ready” state even if progress &lt; 80%.
  - **BuildScheduleButton**: Three states — (1) Disabled when !hasMinimumFields: gray button “Build My Schedule”, subtext “Answer Harvey’s questions first”; (2) Stage 1 when canBuild and progress &lt; 80% and !hasCompletionMarker: purple “Build Schedule”, subtext “Better results with more info”, click opens confirmation modal; (3) Stage 2 when progress ≥ 80% or hasCompletionMarker: prominent “Build My Schedule ✨”, “Harvey is ready!”, click navigates directly to `/loading?projectId=...`.
  - **ConfirmationModal**: Shown on Stage 1 click; “Build schedule now?”, progress bar with percentage, [Keep Chatting] (close) and [Build Anyway] (close + navigate).
  - **ProjectShadowPanel**: New prop `progress`; header shows “Completion {progress}%” and a progress bar. Button rendered at bottom of right column (below panel).
- **Files touched**: `src/app/onboarding/page.tsx`, `src/components/onboarding/ProjectShadowPanel.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Guide users toward quality (more info = better schedule) while preserving agency (can build after minimum fields); continuous feedback via progress bar and button state.
- **Risks / notes**: Top progress bar still uses message-count `calculateProgress()`; extraction progress is separate and used only for panel and button. Left-column OnboardingCTA when `isComplete` unchanged; primary CTA is the new button in the right column.
- **Related docs**: `ARCHITECTURE.md` (onboarding page, ProjectShadowPanel), `docs/onboarding/README.md`.

### 2026-02-13 – Feature D (Shadow Panel) Step 5: Build Shadow Panel component

- **Agent / context**: Cursor AI – Implement live-updating Shadow Panel UI for onboarding (Feature D Step 5).
- **Summary**:
  - **New component**: `ProjectShadowPanel` in `src/components/onboarding/ProjectShadowPanel.tsx`. Displays extracted user/project fields in three sections: Project Info (title, description, goals, project_type, target_deadline, motivation, phases collapsible, projectNotes), Your Schedule (work schedule day grid, commute, availability windows with day grids, weekly_hours_commitment), Preferences (timezone, preferred_session_length, communication_style, skill_level, tools_and_stack pills, userNotes). Only renders non-null fields; uses formatTime, formatDate, day-matching for grids; loading state shows "Extracting..." with spinner.
  - **Onboarding layout**: Split view 40% chat / 60% panel. Left: chat messages, typing indicator, error, input or CTA. Right: full-height scrollable Shadow Panel. Debug panel had already been removed earlier.
  - **Exports**: `ProjectShadowPanel` added to `@/components/onboarding` index.
- **Files touched**: `src/components/onboarding/ProjectShadowPanel.tsx` (new), `src/components/onboarding/index.ts`, `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Users see in real time what Harvey has extracted; no logic changes to extraction or storage.
- **Risks / notes**: Desktop-optimized layout; mobile not adjusted. Phases rendering assumes object with optional name/description per entry.
- **Related docs**: `ARCHITECTURE.md` (onboarding page, onboarding components), `docs/onboarding/README.md`.

### 2026-02-13 – Feature D (Shadow Panel) Step 4: Wire extraction into onboarding flow

- **Agent / context**: Cursor AI – Automatically trigger extraction after every Harvey response during onboarding and store results in React state for the shadow panel (Step 5).
- **Summary**:
  - **State**: Added `shadowFields` (user + project extracted payload) and `extractionLoading` on the onboarding page.
  - **triggerExtraction(projectId)**: Calls `POST /api/onboarding/extract` with credentials, updates `shadowFields` from `result.extracted`, logs start/completion/saved/errors; runs non-blocking (errors only logged).
  - **onFinish**: After stream finishes, if `projectIdRef.current` exists, triggers extraction in the background (no await). Logs "User sent message", "Stream finished, Harvey responded", "Triggering extraction" / "No projectId yet, skipping extraction".
  - **Debug panel**: Temporary fixed bottom-right panel showing "Shadow Fields (Debug)", extraction loading state, and JSON of `shadowFields` (to be replaced by real Shadow Panel in Step 5).
- **Files touched**: `src/app/onboarding/page.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Shadow Panel needs live extracted data; extraction must run after each Harvey reply without blocking the user.
- **Risks / notes**: Extraction failures are logged only; first message may not have projectId yet (created by API), so first extraction runs after the first response that returns projectId via onData.
- **Related docs**: `ARCHITECTURE.md` (onboarding page), `docs/onboarding/README.md` (Shadow Panel / extraction trigger).

### 2026-02-13 – Feature D (Shadow Panel) Step 3: Save extraction to database

- **Agent / context**: Cursor AI – Extend onboarding extract endpoint to persist extracted user and project fields to the database (Feature D – Shadow Panel, Step 3).
- **Summary**:
  - **Merge logic**: After extraction and validation, build `userUpdates` and `projectUpdates` only for fields that are non-null in the extraction result, so existing data is not overwritten with null.
  - **Field mapping**: User (timezone, workSchedule, commute, availabilityWindows, preferred_session_length, communication_style, userNotes) and Project (title, description, goals, project_type, target_deadline as Date, weekly_hours_commitment, tools_and_stack, skill_level, motivation, phases, projectNotes). Arrays (availabilityWindows, tools_and_stack) are replaced entirely.
  - **DB writes**: Use existing `updateUser(userId, userUpdates)` and `updateProject(projectId, userId, projectUpdates)`; wrap in try/catch and return 500 with "Failed to save extracted data" on failure.
  - **Response**: Now returns `{ success: true, extracted: { user, project }, saved: { user: userUpdates | null, project: projectUpdates | null } }` so the frontend knows what was stored.
- **Files touched**: `src/app/api/onboarding/extract/route.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Shadow Panel and downstream features need extracted onboarding data persisted; merge logic avoids wiping existing values when extraction returns null for a field.
- **Risks / notes**: Idempotent: calling again overwrites only extracted non-null fields. projectNotes/userNotes replace entirely (no append merge in this step).
- **Related docs**: `ARCHITECTURE.md` (onboarding/extract), `docs/onboarding/README.md` (extraction endpoint).

### 2026-02-13 – Feature D (Shadow Panel) Step 2: Onboarding extraction endpoint

- **Agent / context**: Cursor AI – Implement standalone extraction endpoint for onboarding conversation (Feature D – Shadow Panel, Step 2).
- **Summary**:
  - **New route**: `POST /api/onboarding/extract` – accepts `{ projectId }`, authenticates via Supabase, loads onboarding discussion via `getOnboardingDiscussion(projectId, userId)`, builds full conversation text (User/Harvey lines), calls Anthropic Haiku (`claude-haiku-4-20250514`) with a structured extraction prompt, then parses and validates the JSON response.
  - **Response**: Returns `{ user: {...}, project: {...} }` with extracted fields (timezone, workSchedule, commute, availabilityWindows, preferred_session_length, communication_style, userNotes; title, description, goals, project_type, target_deadline, weekly_hours_commitment, tools_and_stack, skill_level, motivation, phases, projectNotes). Read-only – does not persist to DB (persistence is Step 3).
  - **Defensive handling**: `parseIfString()` for array/object fields that may come back stringified; validation that `availabilityWindows` and `tools_and_stack` are arrays; coercion of `preferred_session_length` and `weekly_hours_commitment` to numbers; strip markdown code blocks from Haiku output before `JSON.parse`.
- **Files touched**: `src/app/api/onboarding/extract/route.ts` (new), `ai_agent_changelog.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`.
- **Motivation**: Shadow Panel needs a way to run extraction on the full onboarding conversation and get clean JSON for comparison/display; this endpoint is the standalone extraction step before any DB write.
- **Risks / notes**: Empty or missing onboarding discussion returns 404. Haiku extraction failures are logged and return 500. Uses same auth and project-ownership pattern as other API routes.
- **Related docs**: `ARCHITECTURE.md` (API routes – onboarding/extract), `docs/onboarding/README.md` (Extraction endpoint).

### 2026-02-12 – Feature C: Project Details page

- **Agent / context**: Cursor AI – Implement Feature C of the Harvey MVP Sprint: dedicated Project Details page for viewing and editing project-level context.
- **Summary**:
  - **Navigation**: Purple project pill in ChatSidebar is now clickable; opens **ProjectDropdownMenu** with “Project Details” (→ `/dashboard/project/[projectId]`) and “User Settings” (→ `/dashboard/settings`). Placeholders for Archive / Switch Project. Settings page “View Project Details” replaced with real link when project exists; Project Details page has “Back to Dashboard” and “User Settings” (with unsaved-changes confirm when dirty).
  - **Route & page**: New route `/dashboard/project/[projectId]`. Server page (auth, `getProjectById`, redirect if not found) passes serialized project to client **ProjectDetailsForm**. Loading state via `loading.tsx`.
  - **API**: New **GET** and **PATCH** `/api/projects/[projectId]`. GET returns project for authenticated owner; PATCH accepts partial updates (title, description, goals, status, target_deadline, skill_level, tools_and_stack, project_type, weekly_hours_commitment, motivation) with validation (e.g. weekly_hours 1–168, status active/paused/completed). Uses `project-service.getProjectById` and `updateProject`; **status** added to `UpdateProjectData` in project-service.
  - **Components**: **EditableField** (reusable): display/edit toggle, types text/textarea/date/select/tags/number, placeholder, maxLength, options, min/max/step, maxTags. **ProjectDetailsForm**: two cards (Project Info: description, goals, target deadline, project type; Your Context: skill level, tools & stack, weekly hours, motivation), editable title, status badge, Save when dirty, PATCH + toast + “Last updated” refresh, **beforeunload** and confirm on navigation when unsaved.
- **Files touched**: `src/app/api/projects/[projectId]/route.ts`, `src/app/dashboard/project/[projectId]/page.tsx`, `src/app/dashboard/project/[projectId]/loading.tsx`, `src/components/dashboard/ProjectDropdownMenu.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `src/components/dashboard/EditableField.tsx`, `src/components/dashboard/ProjectDetailsForm.tsx`, `src/app/dashboard/settings/page.tsx`, `src/lib/projects/project-service.ts`, `ARCHITECTURE.md`, `docs/project-details-feature.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Users need to see and correct what Harvey knows about their project (transparency and control); project-level context is separate from user-level Settings.
- **Risks / notes**: Archive and Delete buttons are UI-only (no API yet). Project type options use lowercase values (e.g. `web app`) to match schema; display labels are title case.
- **Related docs**: `ARCHITECTURE.md` (dashboard/project route, projects API, dashboard components), `docs/project-details-feature.md`.

### 2026-02-12 – Availability blocks persistence (store in same place as fetch)

- **Agent / context**: Cursor AI – Fix availability blocks not being stored in the DB when user adds a block and clicks Save.
- **Summary**:
  - **API** (`POST /api/settings/update`): Persist `available_time` to `Project.contextData.available_time` (same place `GET /api/settings` reads from). Build `newContextData` from a plain object copy of existing contextData so Prisma serializes correctly; sort blocks by day then start time before saving; always set `available_time` and `preferences` when updating project context.
  - **Settings page**: Send `projectId` when project exists (`data.project?.id`); send `available_time` from `data.project?.contextData?.available_time ?? []`. After successful save, refetch `/api/settings` in the background and set state from the response so the UI shows exactly what was persisted.
- **Files touched**: `src/app/api/settings/update/route.ts`, `src/app/dashboard/settings/page.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: User reported that adding an availability block and saving did not persist to the database.
- **Risks / notes**: Refetch after save updates the whole settings state from the server; if another tab changed settings, that will overwrite. Acceptable for single-user settings page.
- **Related docs**: `docs/settings.md` (Persistence and logging).

### 2026-02-12 – Work schedule: per-block days and build fix

- **Agent / context**: Cursor AI – Fix “Expression expected” build error in settings update route; add per-block days to work schedule so each block can have different days (e.g. Mon 9–12 and 15–17, Thu 8–13 only).
- **Summary**:
  - **Build fix**: Work schedule validation in `POST /api/settings/update` was refactored into a `validateWorkSchedule(ws)` helper to resolve a parse error at the `} else {` branch (Turbopack/Next.js 16).
  - **Per-block days**: `WorkScheduleShape.blocks` entries now include `days: number[]` (0–6). Each “Add work block” row has its own day checkboxes and start/end time. Overlap validation: two blocks that share a day must not have overlapping times.
  - **UI**: WorkScheduleSection shows one card per block: “Days” (Sun–Sat checkboxes) + start time “to” end time + Remove. No global work days; legacy payload (workDays + startTime/endTime) is still loaded and shown as one block.
  - **Scheduler and grid**: task-scheduler and AvailabilitySection build blocked slots from each block’s `days` and times. assembleContext formats work schedule with per-block days in the system prompt.
- **Files touched**: `src/app/api/settings/update/route.ts`, `src/types/api.types.ts`, `src/components/settings/WorkScheduleSection.tsx`, `src/components/settings/AvailabilitySection.tsx`, `src/lib/schedule/task-scheduler.ts`, `src/lib/chat/assembleContext.ts`, `docs/settings.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: User needs different time blocks for different days (e.g. Monday class 9–12 and 3–5, Thursday 8–1 only). Build was failing when saving settings.
- **Risks / notes**: Legacy work schedule (no `blocks`) still supported; API defaults missing `days` to [1,2,3,4,5] for backward compatibility.
- **Related docs**: `docs/settings.md` (Work schedule data model, per-block days).

### 2026-02-12 – Settings fixes: persistence, energy preference, multiple work blocks

- **Agent / context**: Cursor AI – Fix three critical issues before Feature C: availability blocks and energy preferences not persisting; work schedule limited to one block per day.
- **Summary**:
  - **Issue 3 – Availability blocks persist**: Confirmed save path (page sends `available_time` and `projectId`; API writes to `Project.contextData.available_time`). Added sorting of blocks by day then start time before save. Added API and client logging (request body, saved contextData) for debugging.
  - **Issue 2 – Energy preferences persist**: Validated flow (PreferencesSection → updateProjectContext → save payload). Added API validation: `preferences.energy_peak` must be one of `mornings` | `afternoons` | `evenings`. Preferences are merged into existing contextData; no bug found in write path; logging added.
  - **Issue 1 – Multiple work blocks per day**: `WorkScheduleShape` (api.types) now supports optional `blocks: Array<{ startTime, endTime }>`; legacy `startTime`/`endTime` retained. WorkScheduleSection UI: list of time blocks with “Add work block”, per-block start/end/Remove; work days apply to all blocks. API validates blocks (end &gt; start, no overlap). Task-scheduler `buildBlockedSlotsFromUser` iterates over `workSchedule.blocks` when present, else uses single start/end. AvailabilitySection grid builds `workBlocksByDay` from blocks or legacy. Chat assembleContext formats multiple blocks in system prompt.
- **Files touched**: `src/app/api/settings/update/route.ts`, `src/app/dashboard/settings/page.tsx`, `src/types/api.types.ts`, `src/components/settings/WorkScheduleSection.tsx`, `src/components/settings/AvailabilitySection.tsx`, `src/lib/schedule/task-scheduler.ts`, `src/lib/chat/assembleContext.ts`, `docs/settings.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Users reported availability blocks and energy preference not saving; users need multiple work blocks (e.g. morning class + afternoon class) for realistic schedules.
- **Risks / notes**: Existing users with legacy work schedule keep it until next save; then UI may send `blocks` (one or more). Schedule-generation still outputs legacy work_schedule; task-scheduler and UI accept both. Keep API logging for Feature C debugging; can reduce later.
- **Related docs**: `docs/settings.md` (work schedule data model, validation, persistence and logging).

### 2026-02-12 – Overnight availability blocks (cross-midnight)

- **Agent / context**: Cursor AI – Fix validation and grid display for availability blocks that cross midnight (e.g. Friday 23:00 – Saturday 02:00).
- **Summary**:
  - **API validation** (`POST /api/settings/update`): Overnight blocks are now valid (`end` &lt; `start` means “continues into next day”). Reject only when `end === start`. Overlap check expanded: each block’s segment on a given day is normalized (overnight ⇒ [start, 24:00) on block day and [00:00, end) on next day); overlaps are checked across all segments on each day so overnight blocks do not falsely conflict and real overlaps (e.g. Friday 23:00–02:00 vs Saturday 00:00–01:00) are detected.
  - **AvailabilitySection**: `addBlock` allows `end` &lt; `start` (overnight); only rejects when `end === start`. Grid uses display segments: each block is expanded into one or two (day, start, end) segments for rendering; overnight blocks show on two days (e.g. Friday 23:00–23:59 and Saturday 00:00–02:00). List shows overnight blocks as “23:00 – Sat 02:00 (overnight)”. Add-form shows hint “This block crosses midnight and will appear on two days” when end &lt; start. Optional dev console logs when adding or rendering overnight blocks.
- **Files touched**: `src/app/api/settings/update/route.ts`, `src/components/settings/AvailabilitySection.tsx`, `docs/settings.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Users could not add blocks like Friday 23:00–02:00; validation wrongly required end &gt; start and the grid did not render overnight blocks.
- **Risks / notes**: Day order is Monday→…→Sunday→Monday. Edge cases: 22:00–00:00 is treated as overnight (two segments: until midnight, then 00:00–00:00 empty next-day segment—effectively one visible segment; getDisplaySegments returns [0, 0] for next day which shows no cell; we may want to treat 00:00 as 24:00 for “until midnight” in a follow-up). Full overnight (00:00–23:59) is valid; overlap logic handles it. No regression on same-day blocks.
- **Related docs**: `docs/settings.md` (Availability Windows, overnight data model).

### 2026-02-12 – Settings page (Feature B) and data architecture refactor

- **Agent / context**: Cursor AI – Implement Feature B (Settings page) and refactor constraints so User holds life constraints and Project.contextData holds only project allocations.
- **Summary**:
  - **Data refactor (Step 0):** (1) Extraction and generate-schedule now write **User.workSchedule** and **User.commute** from onboarding; **Project.contextData** no longer stores `blocked_time` (only available_time, preferences, etc.). (2) Task-scheduler and all tools (regenerate_schedule, add_task, update_constraints, smart-reschedule) derive blocked time from User and use **getEffectiveAvailableTimeBlocks** where needed. (3) ContextData type has `blocked_time` optional/deprecated; TimeBlock and TimeBlockEntry have optional `type: 'work' | 'personal'`. (4) ARCHITECTURE.md documents User vs Project separation.
  - **Settings page (Step 1):** New route `/dashboard/settings`, GET `/api/settings`, POST `/api/settings/update`. Components: WorkScheduleSection, AvailabilitySection (week grid + block list), PreferencesSection, Project placeholder with TODO for Feature C. Dashboard header: Settings gear links to `/dashboard/settings`. Docs: `docs/settings.md`; ARCHITECTURE updated.
- **Files touched**: `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/schedule/task-scheduler.ts`, `src/lib/chat/tools/updateConstraints.ts`, `src/lib/chat/tools/regenerateSchedule.ts`, `src/lib/chat/tools/addTask.ts`, `src/lib/tasks/smart-reschedule.ts`, `src/lib/chat/assembleContext.ts`, `src/lib/chat/types.ts`, `src/types/api.types.ts`, `src/app/api/settings/route.ts`, `src/app/api/settings/update/route.ts`, `src/app/dashboard/settings/page.tsx`, `src/components/settings/*`, `src/components/dashboard/ChatSidebar.tsx`, `src/types/settings.types.ts`, `ARCHITECTURE.md`, `docs/settings.md`.
- **Motivation**: Release blocker: users could not edit constraints after onboarding. Plan required fixing data ownership (User = life, Project = allocations) before building Settings.
- **Risks / notes**: Existing projects may have contextData.blocked_time in DB; code treats it as optional and no longer writes it. Schedule generation and rescheduling now depend on User.workSchedule/commute; ensure onboarding or first generation populates them (extraction + deriveUserLifeConstraints).
- **Related docs**: `ARCHITECTURE.md` (Constraints data: User vs Project; schedule, Settings API), `docs/settings.md`, `Harvey_Sprint_Roadmap_MVP_Launch.md` Task B.

### 2026-02-11 – Project and User enrichment (schema, extraction, context assembly)

- **Agent / context**: Cursor AI – Add structured Project/User enrichment fields, extend single extraction at schedule generation, update onboarding prompt and chat context assembly.
- **Summary**:
  - **Prisma schema**: Project has `target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`, `phases` (Json); `projectNotes` is now `Json?` (append-only array). User has `preferred_session_length`, `communication_style`, `userNotes` (Json). Migration converts existing `projectNotes` string to single-entry JSON array.
  - **Extraction**: `extractConstraints()` extended to return enrichment fields in same call. Conversation for extraction uses last 15 messages; full conversation used for task generation.
  - **Generate-schedule route**: Saves scheduling subset to `Project.contextData`; writes enrichment to Project and User (only defined values; failures non-fatal). TODO: before Feature 8, merge projectNotes with extraction.
  - **Onboarding prompt**: Harvey guided to surface motivation, technical background/tools, phases, deadline/success, preferred session length naturally.
  - **Context assembly**: System prompt includes Project Context (type, phase, deadline, skill level, stack, weekly commitment, motivation), project notes, and user notes sections; nulls omitted.
- **Files touched**: `src/prisma/schema.prisma`, migrations, `src/types/api.types.ts`, `src/types/user.types.ts`, `src/lib/schedule/schedule-generation.ts`, `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/projects/project-service.ts`, `src/lib/ai/prompts.ts`, `src/lib/chat/assembleContext.ts`, `ARCHITECTURE.md`, `docs/task-generation/README.md`, `docs/onboarding/README.md`.
- **Motivation**: Downstream features need structured project/user fields; one extraction at schedule generation keeps cost under control.
- **Risks / notes**: projectNotes overwrite on first generation only; Feature 8 should merge.
- **Related docs**: `ARCHITECTURE.md`, `docs/task-generation/README.md`, `docs/onboarding/README.md`.

### 2026-02-10 – Complete skipped tasks later (task detail “Complete” button)

- **Agent / context**: Cursor AI – Allow completing a task after it was skipped.
- **Summary**:
  - **Task detail tile**: When a task is skipped, the task detail view now shows a “Complete” button at the bottom right. Clicking it marks the task as completed (same flow as normal completion: PATCH with `status: 'completed'`, optimistic UI, optional completion feedback in chat).
  - **Database**: No schema change. Existing `Task.completedAt` is set by `task-service.updateTask()` when status changes to `completed`; `skippedAt` is cleared. PATCH `/api/tasks/[taskId]` already supports this transition.
- **Files touched**: `src/components/dashboard/TaskDetails.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Users could not change status after skipping; they can now complete a skipped task later from the task detail view.
- **Risks / notes**: None. Backend already allowed `skipped` → `completed`; only the UI was hiding the action for skipped tasks.
- **Related docs**: `ARCHITECTURE.md` (TaskDetails, tasks/[taskId] PATCH, task-service).

### 2026-02-10 – Daily Check-In quick wins (styling, loading, fallback, guard, test buttons)

- **Agent / context**: Cursor AI – Quick-win improvements to the Daily Check-In feature.
- **Summary**:
  - **Check-in message styling**: Messages with `messageType: 'check-in'` get a subtle tint (`bg-[#895af6]/5`), left border accent, and a small "Check-in" label above the bubble.
  - **"Harvey is saying hi…"**: When the check-in stream has started but no chunk has arrived yet (`streamingCheckIn === ''`), the sidebar shows a placeholder with that text and typing dots (and `aria-live="polite"`).
  - **Graceful fallback**: On API failure or non-ok response, the dashboard sets a brief error message ("Harvey couldn't say hi right now."); the sidebar shows it in a small red banner; it auto-clears after 3 seconds. Empty stream response does not persist or append.
  - **Don't run check-in while one is in progress**: A ref (`checkInInProgressRef`) guards so a second check-in is not triggered until the current one finishes.
  - **Skip check-in when conversation is brand new**: Automatic check-in runs only if there are existing messages (`messages.length > 0`) or a previous check-in exists in localStorage for this project.
  - **Test buttons**: Three buttons (AM, PM, Eve) next to Rebuild/Settings/Logout trigger a check-in with `timeOfDay` override (morning / afternoon / evening) for easier testing; they bypass rate limit and "brand new" check. API and `assembleCheckInContext` accept optional `timeOfDay`/`timeOfDayOverride`.
- **Files touched**: `src/lib/checkin/checkin-context.ts`, `src/app/api/chat/checkin/route.ts`, `src/app/dashboard/page.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Better UX (loading state, error feedback), avoid duplicate or inappropriate check-ins, and make it easy to test morning/afternoon/evening tones.

### 2026-02-10 – Daily Check-In feature

- **Agent / context**: Cursor AI – Implement Daily Check-In for returning users: contextual greeting streamed at the bottom of the chat sidebar.
- **Summary**:
  - **Check-in context** (`src/lib/checkin/checkin-context.ts`): Assembles time of day (morning/afternoon/evening in user TZ), today’s pending/in-progress tasks with titles and times, yesterday’s completion summary (completed/skipped/total), current streak (consecutive days with ≥1 completion), and recently skipped tasks (last 2 days). Uses existing task and user timezone from DB.
  - **Check-in API** (`POST /api/chat/checkin`): Accepts `{ projectId }`, authenticates user, builds context, runs `streamText()` with a concise system prompt (2–3 sentence check-in, tone examples). Returns streaming plain text; client persists the message to the project discussion with `messageType: 'check-in'`.
  - **Frontend**: Dashboard triggers check-in on load when user has active project and existing tasks; rate limit via `localStorage` (`harvey_checkin_${projectId}`): only if >3 hours since last check-in or new calendar day. Stream is shown live in the sidebar (`streamingCheckIn`); on stream end the message is POSTed to discussions and appended to chat. ChatSidebar accepts `streamingCheckIn` and `messageType: 'check-in'`; check-in messages have `data-message-type="check-in"` for future styling.
  - **Types**: `StoredMessage` and append-message API accept optional `messageType: 'check-in'`; GET discussions returns it; `ChatMessage` and dashboard/sidebar types extended accordingly.
- **Files touched**: `src/lib/checkin/checkin-context.ts` (new), `src/app/api/chat/checkin/route.ts` (new), `src/app/dashboard/page.tsx`, `src/components/dashboard/ChatSidebar.tsx`, `src/types/api.types.ts`, `src/types/chat.types.ts`, `src/app/api/discussions/[projectId]/messages/route.ts`, `src/app/api/discussions/[projectId]/route.ts`, `ARCHITECTURE.md`, `docs/checkin/README.md` (new), `docs/dashboard/README.md`, `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Returning users get a short, contextual Harvey greeting and direction (today’s tasks, yesterday’s summary, streak, skips) without blocking dashboard load.
- **Risks / notes**: Check-in runs after a 300ms delay so it does not block initial render. No new DB table; messages stored in Discussion.messages. Rate limiting is client-only (localStorage); clearing storage will allow more frequent check-ins.
- **Related docs**: `ARCHITECTURE.md` (chat/checkin route, dashboard check-in, ChatSidebar, lib/checkin), `docs/checkin/README.md`, `docs/dashboard/README.md`.

### 2026-02-10 – Task expand refetch fix + feedback conversation order

- **Agent / context**: Cursor AI – Fix refetch on task expand; make feedback widgets show user message first, then Harvey’s reply (conversation order).
- **Summary**:
  - **Expand no longer triggers refetch**: `fetchTasks` depended on `expandedTaskId`, so every expand/collapse re-ran the effect and caused a full GET /api/tasks (~2s). Removed `expandedTaskId` from the callback deps and moved “auto-expand first task” to a ref (`hasAutoExpandedRef`) so it runs only once on initial load. Expanding a task is now instant (no API call).
  - **Feedback flow reads like a conversation**: In CompletionFeedbackWidget the user’s reply (e.g. “The task took me about the right time…”) is appended to the chat immediately on button click; PATCH and progress run in the background; Harvey’s acknowledgment is appended after a short delay (400ms) so the order is clearly user → then Harvey. SkipFeedbackWidget already appended the user first; added the same 400ms delay before showing Harvey’s reply. Message persistence (POST to discussion) continues to run in the background via the parent callback.
- **Files touched**: `src/app/dashboard/page.tsx` (useRef, hasAutoExpandedRef, fetchTasks deps), `src/components/dashboard/chat/CompletionFeedbackWidget.tsx` (user message first, then PATCH, then delayed assistant), `src/components/dashboard/chat/SkipFeedbackWidget.tsx` (delayed assistant), `AI_AGENT_CHANGELOG.md`.
- **Motivation**: Expand felt slow (2s) due to unnecessary refetch; user wanted feedback to look like a real back-and-forth (user message visible first, then Harvey).
- **Risks / notes**: Auto-expand runs only once per session; if the user collapses the only expanded task we do not auto-expand again on a later fetch.

### 2026-02-10 – Dashboard responsiveness: optimistic UI, fewer API calls, widget visibility

- **Agent / context**: Cursor AI – Targeted performance/UX optimizations for the dashboard: Complete/Skip, feedback widgets, and task detail loading.
- **Summary**:
  - **Optimistic UI (Complete/Skip)**: Clicking Complete or Skip on a task now updates the task's visual status in the Timeline immediately. The feedback message and widget appear in the chat right away. The PATCH request runs in the background; on failure the task state is reverted and the user is alerted. Cascade-skipped task IDs from the API are applied to local state on success. No blocking `fetchTasks()` or `setIsActionLoading` before UI update.
  - **Fewer API calls in feedback widgets**: The task PATCH endpoint accepts an optional query `returnProgressToday=true`. When set, the response includes `progressToday` (same shape as GET `/api/progress/today`). CompletionFeedbackWidget now uses this single PATCH for task feedback + progress, avoiding a separate GET. SkipFeedbackWidget appends the user's reply message immediately, then runs PATCH and suggestion in the background so the UI feels instant.
  - **Task detail loading**: Confirmed that expanding a task in the Timeline uses the same task object from the already-loaded list; no extra fetch on click. A short comment was added in TimelineView for clarity.
  - **Widget button visibility**: Feedback widgets (duration accuracy, skip reason) are shown as soon as the Harvey message is in the merged list. With optimistic Complete/Skip, that message is added to `appendedByDashboard` immediately, so the widget appears without waiting for the API. Widgets do not conditionally hide their buttons behind a loading state on first render.
- **Files touched**: `src/app/dashboard/page.tsx` (optimistic complete/skip, helpers `updateTaskInGroups`, `setTasksStatusInGroups`), `src/app/api/tasks/[taskId]/route.ts` (optional `progressToday` in response when `?returnProgressToday=true`), `src/components/dashboard/chat/CompletionFeedbackWidget.tsx` (single PATCH with progress, fallback GET), `src/components/dashboard/chat/SkipFeedbackWidget.tsx` (append user message first, then PATCH/suggestion), `src/components/dashboard/TimelineView.tsx` (comment re task detail from list), `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/dashboard/README.md`.
- **Motivation**: Buttons and task details felt slow because each action triggered sequential API calls and the UI waited for them. Optimistic updates and combining PATCH + progress reduce round-trips and make the UI feel instant.
- **Risks / notes**: On PATCH failure after Complete/Skip, the reverted task is restored from the snapshot taken at click time; any concurrent changes from another tab are overwritten for that task. CompletionFeedbackWidget still falls back to GET `/api/progress/today` if the PATCH response has no `progressToday` (e.g. older deployments).
- **Related docs**: `ARCHITECTURE.md` (tasks PATCH, progress/today, ChatSidebar, CompletionFeedbackWidget), `docs/dashboard/README.md` (Complete/Skip flow, completion feedback, task detail).

### 2026-02-10 – Completion feedback: date-aware acknowledgment (overdue/future tasks no longer “0/0 today”)

- **Agent / context**: Cursor AI – Bug fix: when a user completed a task not scheduled for today (overdue or future), Harvey showed “0/0 tasks done today” because the progress query only counted today’s tasks.
- **Summary**:
  - **CompletionFeedbackWidget**: After the user submits duration (“how long did it take?”), the widget now compares the completed task’s `scheduledDate` to today’s date in the user’s timezone (from User model via progress API). If same day → “That’s X/Y tasks done today. Next up: [task]”; if overdue → “You’re catching up — good job finishing that one. Next up: [task]”; if future → “You’re ahead of schedule — nice work. Next up: [task].” If no upcoming task exists, message ends with “You’re all clear for now.”
  - **Backend**: `getTodayProgress` (task-service) now returns **userTimezone** and **nextTask** as the first pending task today or, if none, the nearest upcoming pending task by date. Progress API response shape unchanged for existing fields; new fields are additive.
  - **Frontend**: Widget uses PATCH response `task.scheduledDate` and progress response `userTimezone`; uses `getDateStringInTimezone` from `@/lib/timezone` for comparison.
- **Files touched**: `src/components/dashboard/chat/CompletionFeedbackWidget.tsx`, `src/lib/tasks/task-service.ts` (TodayProgress interface and getTodayProgress), `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/dashboard/README.md`.
- **Motivation**: Overdue or early-completed tasks should get a correct, encouraging message instead of “0/0 tasks done today.”
- **Risks / notes**: None. Progress API consumers that ignore unknown keys are unaffected; widget only uses the new fields when building the ack.
- **Related docs**: `ARCHITECTURE.md` (progress/today, task-service getTodayProgress, CompletionFeedbackWidget), `docs/dashboard/README.md` (completion feedback, progress API, getTodayProgress).

### 2026-02-10 – Chat sidebar message order fix (Complete/Skip feedback above older messages)

- **Agent / context**: Cursor AI – Bug fix: when a user completes or skips a task from the dashboard, the automatic Harvey feedback message (“Nice work! Quick question…” / “No problem! Quick question…”) was rendering above older messages instead of at the bottom.
- **Summary**:
  - **Root cause**: The chat sidebar merged three message sources (useChat messages, `appendedByParent`, `appendedFeedbackMessages`) by simple concatenation with no sorting. Sources used different or missing timestamps, so display order was wrong.
  - **Fix (frontend only)**: Every display message now has a consistent `createdAt` (ISO string). useChat messages use `initialMessages[i].timestamp` when available, else current time; dashboard-appended and widget-appended messages get `new Date().toISOString()` at creation. After merging, the display list is sorted by `createdAt` ascending so the newest message is always at the bottom.
  - **Other**: Auto-scroll effect now depends on `appendedByParent` so the view scrolls to bottom when the dashboard appends after Complete/Skip. Tool-call indicator lookup uses `message.id` to find the useChat message (required after sort changed order).
- **Files touched**: `src/components/dashboard/ChatSidebar.tsx` (DisplayMessage.createdAt, merge + sort, scroll deps, render by id), `src/app/dashboard/page.tsx` (appendedByDashboard items include `createdAt`), `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/dashboard/README.md`, `docs/chat-router/README.md`.
- **Motivation**: Database stored messages correctly; the bug was purely in how the frontend merged and rendered multiple message arrays without timestamp-based ordering.
- **Risks / notes**: No change to DB storage or fetch. If a source omits `createdAt`, it is assigned at merge time so ordering remains well-defined.
- **Related docs**: `ARCHITECTURE.md` (ChatSidebar), `docs/dashboard/README.md` (chat sidebar, Complete/Skip flow), `docs/chat-router/README.md` (Frontend Integration).

### 2026-02-10 – Timeline “Past” section and timezone-aware today/overdue

- **Agent / context**: Cursor AI – Feature: add a “Past” section to the Timeline view so completed tasks from previous days no longer appear under TODAY; use user timezone for today/past/overdue.
- **Summary**:
  - **Past section**: Tasks with `scheduledDate < today` (in user TZ) and `status === 'completed'` are grouped into a new `past` array. Section order is now Past → Overdue → Today → Tomorrow → This Week → Next Week → Later → Unscheduled.
  - **Today fix**: “Today” shows only tasks where `scheduledDate` equals today’s date in the user’s timezone (no more completed/skipped tasks from past days in TODAY). Overdue = past-date and not completed (pending/skipped).
  - **UI**: Past section is hidden by default. A top-of-timeline button “↑ Show past tasks (N)” toggles visibility with a smooth max-height transition. Past section header uses same style as TODAY/TOMORROW; past task cards use `opacity-60` when collapsed.
- **Files touched**: `src/types/task.types.ts` (TaskGroups.past), `src/lib/tasks/task-service.ts` (groupTasksByDate with userTimezone, past/overdue/today logic via getDateStringInTimezone), `src/components/dashboard/TimelineView.tsx` (showPast state, toggle, Past section, isPast styling), `src/app/dashboard/page.tsx` (findTaskById and checklist optimistic update include past), `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/dashboard/README.md`.
- **Motivation**: Completed tasks from last Monday were incorrectly shown under TODAY; overdue was correct. User timezone was not used for “today” in grouping, causing wrong sections for non-UTC users.
- **Risks / notes**: `groupTasksByDate` now takes `userTimezone`; week boundaries (weekDays, nextWeek) are derived from today/tomorrow in user TZ via date-string helpers. API response shape gains `tasks.past`; existing clients that ignore unknown keys are fine.
- **Related docs**: `ARCHITECTURE.md` (task-service, TimelineView), `docs/dashboard/README.md` (grouping, Timeline).

### 2026-02-08 – regenerate_schedule: clearer output, dependency respect, logging

- **Agent / context**: Cursor AI – Improvement: when Harvey regenerates the schedule, output should be clear (what changed, why), dependencies must be respected (part 1 before part 2), and detailed logging should help debugging.
- **Summary**:
  - **Dependencies (remaining scope)**: `greedyReschedule` now sorts tasks by dependency first (topological sort on `depends_on` task IDs), then priority, then date. Dependent tasks are never scheduled before their dependencies. Full rebuild already used `assignTasksToSchedule`, which respects dependencies via `sortIndicesByDependencies` in task-scheduler.
  - **Clear explanation**: Tool result includes a concise `message` (e.g. "Rescheduled 5 task(s); 2 completed kept. 3 task(s) moved to new days. New completion date: Wed Feb 12 (was Mon Feb 10).") and optional `change_summary` (rescheduled_count, moved_count, completion_date_before/after) so Harvey can give a brief, clear recap. System prompt instructs Harvey to use the tool result for a 2–3 sentence recap after regenerate_schedule.
  - **Detailed logging**: Console logs during regeneration: scope and task count; for each task (remaining scope) old day → new day and whether it moved; for full_rebuild the ordered list of scheduled task blocks; final recap line. Helps debugging and future improvements.
- **Files touched**: `src/lib/chat/tools/regenerateSchedule.ts`, `src/lib/chat/types.ts` (RegenerateScheduleResult, RegenerateScheduleChangeSummary), `src/lib/chat/assembleContext.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/chat-router/README.md`
- **Motivation**: Users were confused after "I've rebuilt the schedule" with no indication of what changed; sometimes part 2 was scheduled before part 1 (dependency violation in remaining scope); no visibility into what was moved for debugging.
- **Risks / notes**: Recap message is kept short to limit token cost and avoid long chat replies. If a task has invalid or circular `depends_on`, it is appended at end of order and a warning is logged.
- **Related docs**: `ARCHITECTURE.md` (regenerateSchedule, task-scheduler), `docs/chat-router/README.md` (Tools).

### 2026-02-08 – Success criteria generation for chat-added tasks and onboarding

- **Agent / context**: Cursor AI – Feature: ensure tasks added via chat get 2–4 success criteria; align onboarding to 2–4 criteria per task.
- **Summary**:
  - **Chat add_task**: When Harvey calls the `add_task` tool, the backend now calls Claude (Sonnet) to generate 2–4 specific, measurable success criteria from the task title and description. Criteria are stored in `Task.successCriteria` (JSON array of `{ id, text, done }`) so chat-added tasks match the quality of onboarding-generated tasks.
  - **New module**: `src/lib/chat/generateSuccessCriteria.ts` – `generateSuccessCriteria(title, description?)` returns criteria or `[]` on error; used only by `executeAddTask`.
  - **Onboarding**: Schedule generation prompt and parser updated so each task has **2–4** success criteria instead of a single SUCCESS line. Prompt asks for bullet list under `SUCCESS:`; `parseTaskBlock` collects all lines until `HOURS:` and passes the multi-line string to `convertSuccessCriteriaToJson`.
- **Files touched**: `src/lib/chat/generateSuccessCriteria.ts` (new), `src/lib/chat/tools/addTask.ts`, `src/lib/schedule/schedule-generation.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/chat-router/README.md`, `docs/dashboard/README.md`
- **Motivation**: Tasks created during onboarding already had success criteria; tasks added via chat did not. Inconsistent task quality; users expect checklist items in the task detail view for chat-added tasks too. Onboarding was only creating one criterion per task; product requirement is 2–4 specific, measurable criteria per task.
- **Risks / notes**: `generateSuccessCriteria` uses a separate Claude call (Sonnet) per add_task; latency and cost increase slightly. On failure we still create the task with no criteria. Onboarding output format change is backward-compatible with `convertSuccessCriteriaToJson` (multi-line string).
- **Related docs**: `ARCHITECTURE.md` (lib/chat, schedule-generation), `docs/chat-router/README.md` (Tools).

### 2026-02-08 – Reduce API costs for MVP testing (Haiku + context trim)

- **Agent / context**: Cursor AI – Cost reduction for project chat so testing is viable with limited credits.
- **Summary**:
  - **Model**: Project chat (`/api/chat/project`) switched from `claude-sonnet-4-20250514` to `claude-haiku-4-5-20251001`. Onboarding chat and schedule generation remain on Sonnet.
  - **History**: `MAX_HISTORY_MESSAGES` reduced from 15 to 10 so fewer conversation turns are sent per request.
  - **Schedule window**: System prompt now includes only **today + next 7 days** of tasks (plus unscheduled). Tasks beyond that window are omitted from the schedule section; a line “(N tasks beyond this window)” is added when N > 0 so Harvey is aware.
  - **Compact task format**: Task lines in the prompt use a short format (e.g. `Feb 9 20:00–22:00 | id:abc | Title | 2h | pending | →dep1`) and date headers use short form (e.g. “Mon Feb 9”) to reduce tokens.
- **Files touched**: `src/app/api/chat/project/route.ts`, `src/lib/chat/assembleContext.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/chat-router/README.md`
- **Motivation**: Lower cost per message during MVP testing (~$0.50 remaining). Haiku is much cheaper; smaller context reduces input tokens further. Quality remains sufficient for testing.
- **Risks / notes**: This is **temporary for MVP**. When moving to paid users ($10–15/month), consider switching project chat back to Sonnet for higher quality. Increase `MAX_HISTORY_MESSAGES` and/or expand the schedule window if needed after testing.
- **Related docs**: `ARCHITECTURE.md` (chat/project route, assembleContext), `docs/chat-router/README.md` (Context Assembly).

### 2026-02-08 – Fix Harvey 1-day timezone offset in chat context

- **Agent / context**: Cursor AI – Bug fix: Harvey was reporting wrong dates (e.g. "overdue from yesterday", "Monday 10th" when it was Monday 9th) because "today" and task dates were computed in UTC instead of the user's timezone.
- **Summary**:
  - **Timezone helpers** (`src/lib/timezone.ts`): Added `getDateStringInTimezone(utcDate, timeZone)` (YYYY-MM-DD in TZ) and `formatDateLongInTimezone(utcDate, timeZone)` (e.g. "Monday, February 9th, 2026") for consistent date handling in user TZ.
  - **Context assembly** (`src/lib/chat/assembleContext.ts`): `computeTaskStats(tasks, userTimezone?)` now takes optional user timezone; "today" and today's tasks use the user's local date. `formatAllTasks` groups and labels schedule by date in user TZ. System prompt now includes explicit "Today's date in user's timezone: YYYY-MM-DD" and "Current time in user's timezone: HH:MM", and schedule section states "(all dates and times in {timezone})".
  - **Tools** (`suggestNextAction.ts`, `getProgressSummary.ts`): "Today", overdue, and current/next task logic use user timezone; `get_progress_summary` "today" and "this_week" filters use user TZ. Current vs next task in `suggest_next_action` uses `getHourDecimalInTimezone` for in-progress window.
- **Files touched**: `src/lib/timezone.ts`, `src/lib/chat/assembleContext.ts`, `src/lib/chat/tools/suggestNextAction.ts`, `src/lib/chat/tools/getProgressSummary.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/chat-router/README.md`
- **Motivation**: Database stores UTC; UI already displayed in user TZ. The system prompt and tool results were still UTC-based, causing Claude to infer wrong days and incorrectly label tasks as overdue or "yesterday".
- **Risks / notes**: None. Database and UI unchanged; only context and tool return values are timezone-aware.
- **Related docs**: `ARCHITECTURE.md` (assembleContext, timezone), `docs/chat-router/README.md` (Context Assembly).

**Recap of changes**

| Area | Change |
|------|--------|
| `src/lib/timezone.ts` | Added `getDateStringInTimezone`, `formatDateLongInTimezone`. |
| `assembleContext.ts` | `computeTaskStats(tasks, userTimezone?)`; today and todayTasks in user TZ; `formatAllTasks` groups by user-TZ date with long headers; prompt gets "Today's date" / "Current time" lines and schedule timezone label. |
| `suggestNextAction.ts` | todayStr and todayTasks from `getDateStringInTimezone`; overdue compare in user TZ; current/next task uses `getHourDecimalInTimezone` for start/end. |
| `getProgressSummary.ts` | User timezone loaded; "today" and "this_week" filters use `getDateStringInTimezone` and week bounds in user TZ. |

**Testing to perform**

1. **"What should I do next?"** – With tasks scheduled for today (in your timezone), Harvey should not say tasks are "overdue from yesterday". Ask and confirm today's tasks and wording.
2. **Day of week** – Confirm Harvey says the correct local date (e.g. "Monday 9th February" when it is Monday 9th in your timezone).
3. **Progress summary** – Ask "How am I doing today?" and "How am I doing this week?" and confirm counts match the dashboard for your local today/week.
4. **Different timezone** – If possible, set user timezone to another zone (e.g. America/New_York) and repeat; dates and "today" should follow that zone.

### 2026-02-08 – Auto-refresh dashboard after tool execution

- **Agent / context**: Cursor AI – Feature request: dashboard should auto-refresh tasks when Harvey executes a tool (add_task, modify_schedule, regenerate_schedule, etc.) without manual page reload.
- **Summary**:
  - Fixed `hasToolCall()` in ChatSidebar: it was checking for `p.type === 'tool-invocation'`, but AI SDK v6 uses `part.type.startsWith('tool-')` (e.g. `tool-add_task`) or `part.type === 'dynamic-tool'`.
  - Updated `onFinish` to scan all assistant messages for tool calls (not just the last one), so multi-step flows where the final message is text-only still trigger a refetch.
  - Dashboard already passed `onTasksChanged={fetchTasks}` and ChatSidebar already invoked it in `onFinish`; the fix was purely in the detection logic.
- **Files touched**: `src/components/dashboard/ChatSidebar.tsx`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/chat-router/README.md`
- **Motivation**: Users had to manually reload the page to see task changes made via chat. Auto-refresh improves UX so changes appear immediately in both timeline and calendar views.
- **Risks / notes**: Refetch happens after any tool call (including read-only tools like `get_progress_summary`); harmless but slightly wasteful. Could later optimize to only refetch on mutating tools.
- **Related docs**: `ARCHITECTURE.md` (ChatSidebar), `docs/chat-router/README.md` (Frontend Integration)

### 2026-02-07 – Feature 2: Cursor AI work context PDF (generated)

- **Agent / context**: Codex (GPT-5.2) — user requested a full-context explanation of the “Feature 2: Post-Onboarding Chat Router” work attributed to Cursor AI.
- **Summary**:
  - Generated a detailed PDF report that inventories the Feature 2 working-tree changes (created/untracked files + modified tracked files), explains runtime flow, and summarizes how each new backend tool works.
  - Noted an important repo state: as of `HEAD` (`68e2595`, 2026-02-07), the Feature 2 implementation is **not committed**; it exists as local modifications and untracked files (per `git status`).
- **Files created**:
  - `output/pdf/feature-2-post-onboarding-chat-router-cursor-ai-context-2026-02-07.pdf`
- **Files touched**:
  - `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md` (doc updates required by repo instructions)
- **Motivation**: Provide a durable, shareable artifact capturing “what changed, where, and how it works” for Feature 2.
- **Risks / notes**: The PDF reflects the current local state; if the Feature 2 work is later amended or committed differently, regenerate the report.
- **Related docs**: `AI_AGENT_CHANGELOG.md` (Feature 2 entry), `docs/chat-router/README.md`, `ARCHITECTURE.md`.

### 2026-02-07 – Post-schedule welcome message from Harvey

- **Agent / context**: Cursor AI – Add an automatic message from Harvey after schedule generation so users know they can chat with him.
- **Summary**: After successfully creating tasks, the generate-schedule API now appends an assistant message to the Discussion: "Here's your schedule! Take a look and let me know if anything needs adjusting — you can ask me to move tasks, add new ones, or change your availability anytime." This message appears in the dashboard chat sidebar when the user arrives.
- **Files touched**: `src/app/api/schedule/generate-schedule/route.ts`
- **Motivation**: Users had no prompt that the sidebar chat was interactive; the message makes it clear they can discuss changes with Harvey.

### 2026-02-07 – Feature 2: Post-Onboarding Chat Router

- **Agent / context**: Cursor AI – Implement Feature 2: make the chat sidebar functional after schedule generation. Harvey becomes a living project coach that can modify schedules, update constraints, add tasks, and give personalized advice.
- **Summary**:
  - **Schema migration**: Added 6 fields to Task (actualDuration, completionNotes, skipReason, skipNotes, startedAt, batchNumber), 2 fields to Project (projectNotes, generationCount), and 2 fields to Discussion (type, taskId). Ran `prisma db push`.
  - **Context assembly**: Created `src/lib/chat/assembleContext.ts` — builds a dynamic system prompt for every message with live project context (tasks, stats, constraints, notes). Harvey's personality, capabilities, and instructions are embedded.
  - **7 tool execute functions** in `src/lib/chat/tools/`:
    - `modifySchedule.ts` — move/resize tasks with conflict and dependency checking
    - `updateConstraints.ts` — modify availability (permanent recurring or one-off date blocks)
    - `addTask.ts` — create new tasks with automatic slot-finding
    - `suggestNextAction.ts` — structured data for "what should I do now?" queries
    - `getProgressSummary.ts` — completion stats by period (today/this_week/all)
    - `regenerateSchedule.ts` — greedy reschedule (remaining) or full rebuild via Claude
    - `updateProjectNotes.ts` — timestamped notes Harvey remembers about the user
  - **New API route**: `POST /api/chat/project` — streaming endpoint using Vercel AI SDK `streamText()` with `tool()` definitions, `createUIMessageStream`, and `createUIMessageStreamResponse`. Same auth pattern as onboarding. Persists messages to Discussion on finish.
  - **Interactive ChatSidebar**: Transformed from read-only display to live chat using `useChat` from `@ai-sdk/react` with `DefaultChatTransport`. Features: streaming messages, typing indicator, auto-scroll, auto-resize textarea, tool call indicators, task refetch callback.
  - **Dashboard integration**: Updated `page.tsx` to pass `initialMessages`, `onTasksChanged={fetchTasks}` to ChatSidebar.
  - **Shared types**: Created `src/lib/chat/types.ts` with ContextData, TaskStats, and tool result types.
- **Files created**:
  - `src/lib/chat/types.ts`
  - `src/lib/chat/assembleContext.ts`
  - `src/lib/chat/tools/modifySchedule.ts`
  - `src/lib/chat/tools/updateConstraints.ts`
  - `src/lib/chat/tools/addTask.ts`
  - `src/lib/chat/tools/suggestNextAction.ts`
  - `src/lib/chat/tools/getProgressSummary.ts`
  - `src/lib/chat/tools/regenerateSchedule.ts`
  - `src/lib/chat/tools/updateProjectNotes.ts`
  - `src/app/api/chat/project/route.ts`
- **Files modified**:
  - `src/prisma/schema.prisma` (new fields on Task, Project, Discussion)
  - `src/components/dashboard/ChatSidebar.tsx` (read-only → interactive chat)
  - `src/app/dashboard/page.tsx` (new props for ChatSidebar)
- **Database changes**: 10 new columns across 3 tables (Task, Project, Discussion). No data migration needed — all new fields have defaults or are nullable.
- **Packages**: zod was already installed. No new packages added.
- **Motivation**: After onboarding + schedule generation, the chat was dead. This feature turns Harvey into a living coach users can interact with to manage their project.
- **Risks / notes**:
  - Tool execution is single-step (no `maxSteps` in AI SDK v6 — tools auto-loop). If Claude calls a tool, the SDK handles the tool result → Claude response loop automatically.
  - `regenerate_schedule` with `full_rebuild` scope calls Claude for task generation, which can take 10-20 seconds. The streaming response keeps the connection alive.
  - `update_constraints` parsing is heuristic-based (extracts day names from description). Complex constraint changes may need clarification from the user.
  - One-off blocks are stored in `contextData.one_off_blocks` — past blocks are not cleaned up automatically (they're filtered out of the system prompt display).
- **Related docs**: `src/lib/chat/README.md` (new), `ARCHITECTURE.md` (should be updated with chat router section).

### 2026-02-07 – Early project title & description extraction during onboarding

- **Agent / context**: Cursor AI – Quick win: extract and store project_title and project_description from onboarding conversation as soon as they are available.
- **Summary**:
  - Added `extractProjectInfo()` in `src/lib/ai/project-extraction.ts` — lightweight Claude call to extract project_title and project_description from conversation text (same pattern as constraint extraction).
  - Chat route `onFinish` (onboarding context): after saving messages, if project has default title or no description, runs extraction and updates Project via `updateProject()`.
  - Extended onboarding prompt with brief note that we extract project_title and project_description.
- **Files touched**: `src/lib/ai/project-extraction.ts` (new), `src/app/api/chat/route.ts`, `src/lib/ai/prompts.ts`, `AI_AGENT_CHANGELOG.md`, `ARCHITECTURE.md`, `docs/onboarding/README.md`
- **Motivation**: Low-effort, high-leverage setup. Gives Harvey stronger context immediately, improves future conversations (post-onboarding chat, schedule regeneration), avoids backfill/migration later.
- **Risks / notes**: Extraction runs once per message until title and description are populated. No schema change — Project model already has title and description. Extraction failures are logged but do not block chat.
- **Related docs**: `ARCHITECTURE.md` (`src/lib/ai/`, `src/app/api/chat/`), `docs/onboarding/README.md` (Early Project Info Extraction section).

### 2026-02-07 – Schedule constraint extraction: use user constraints instead of defaults

- **Agent / context**: Cursor AI – fix schedule generation ignoring user constraints and falling back to defaults when constraint JSON was truncated or repair failed.
- **Summary**:
  - Constraint extraction was truncated at 1000 tokens; repair added `}` before `]` and did not close truncated string values, so parse and repair both failed and the app returned default constraints.
  - Increased extraction `max_tokens` to 4096 so full constraint JSON (long blocked/available lists) is usually returned.
  - In `repairJSON`, close brackets before braces (innermost first), and add a closing `"` when the end of the text looks like a truncated string value, so truncated responses still parse.
  - When the response looks truncated (does not end with `}\s*` or `]\s*}\s*`), skip the “first `{` to last `}`” slice and pass the full text into repair so missing `"]}` can be added.
- **Files touched**: `src/lib/schedule/schedule-generation.ts`
- **Motivation**: Schedules must respect the user’s blocked/available time and schedule duration; avoid silent fallback to defaults.
- **Related docs**: `docs/task-generation/README.md`, `ARCHITECTURE.md` (`src/lib/schedule/`).

### 2026-02-07 – Validate depends_on: never store dependency on a future task

- **Agent / context**: Cursor AI – fix rare bug where a task could have depends_on containing a task scheduled after it.
- **Summary**:
  - When resolving depends_on, we now only persist dependency IDs whose scheduled time is ≤ this task’s scheduled time. Any dependency scheduled after this task is dropped and a WARNING is logged (task titles, ids, dates).
  - In the scheduler, when topological sort leaves remaining nodes (cycle or invalid ref), we now log a WARNING before appending them so we can spot bad dependency graphs.
- **Files touched**: `src/app/api/schedule/generate-schedule/route.ts`, `src/lib/schedule/task-scheduler.ts`
- **Motivation**: Ensure we never store “task depends on future task”; make the cause visible in logs when it would have happened.
- **Related docs**: Same as Task dependencies entry below.

### 2026-02-07 – Task dependencies (depends_on) and cascade skip

- **Agent / context**: Cursor AI – Quick win: tasks can declare dependencies on other tasks; Harvey respects them during scheduling and cascade-skips downstream when a task is skipped.
- **Summary**:
  - **Schema**: Replaced `Task.dependencies` (Json) with `Task.depends_on` (String[]), an array of task IDs. Migration `20260207120000_add_task_depends_on` drops `dependencies` and adds `depends_on`.
  - **Schedule generation**: Claude outputs optional `DEPENDS_ON: 1, 3` (1-based task indices) per task. Parser fills `ParsedTask.depends_on`. Scheduler orders tasks by dependency (topological sort) then priority. When creating DB tasks, dependencies are resolved to task IDs and persisted on each task.
  - **Skip behavior**: When a task is set to `skipped`, the task service finds all tasks whose `depends_on` includes that task ID and sets them to `skipped` (cascade). PATCH `/api/tasks/[taskId]` response can include `downstreamSkippedIds` so the client can show e.g. “Build authentication was also skipped because it depended on this task.”
  - **Types**: `ParsedTask.depends_on` (optional number[]), `DashboardTask.dependsOn` (optional string[]). New helper `getDownstreamDependentTaskIds()` in task-service.
- **Files touched**:
  - `src/prisma/schema.prisma` – Task.depends_on
  - `src/prisma/migrations/20260207120000_add_task_depends_on/migration.sql`
  - `src/types/api.types.ts` – ParsedTask.depends_on
  - `src/types/task.types.ts` – DashboardTask.dependsOn
  - `src/lib/schedule/schedule-generation.ts` – prompt DEPENDS_ON, parseTaskBlock
  - `src/lib/schedule/task-scheduler.ts` – sortIndicesByDependencies, use in assignTasksToSchedule
  - `src/app/api/schedule/generate-schedule/route.ts` – create tasks one-by-one, resolve and set depends_on
  - `src/lib/tasks/task-service.ts` – getDownstreamDependentTaskIds, cascade skip in updateTask, transformToDashboardTask
  - `src/app/api/tasks/[taskId]/route.ts` – return downstreamSkippedIds in response
  - `docs/task-generation/README.md`, `ARCHITECTURE.md`
- **Motivation**: So Harvey knows that e.g. “Build authentication” must come after “Set up database,” and when the user skips the latter, Harvey can skip or move the former and explain why.
- **Risks / notes**: Run `npx prisma generate` and apply migration. Existing tasks have no `depends_on` (empty array). Rescheduling (reset then regenerate) will populate dependencies for new schedules.
- **Related docs**: `ARCHITECTURE.md` (Task model, schedule generation, task-service), `docs/task-generation/README.md` (Task Dependencies section).

### 2026-02-07 – Fix task labels bug and clean up workarounds

- **Agent / context**: Claude Code – fix `Unknown argument label` error in schedule generation.
- **Summary**:
  - **Root cause**: Prisma client needed regeneration AND import path was incorrect.
  - Regenerated Prisma client with `npx prisma generate` to include `label` field.
  - Removed complex `isTaskLabelSupported()` workaround function from route.ts (was flaky and unnecessary).
  - Simplified task record creation to always include label.
  - Fixed import path in `task-service.ts`: changed from `.prisma/client` to `@prisma/client` to resolve TypeScript type resolution issues.
  - Fixed unrelated chat route error: `maxTokens` → `maxOutputTokens` for Vercel AI SDK compatibility.
  - Fixed `onData` callback type in onboarding page with proper type assertion.
- **Files touched**:
  - `src/app/api/schedule/generate-schedule/route.ts` – removed workaround, simplified code
  - `src/lib/tasks/task-service.ts` – fixed Prisma import path
  - `src/app/api/chat/route.ts` – fixed maxOutputTokens parameter
  - `src/app/onboarding/page.tsx` – fixed onData callback type
- **Motivation**: The previous Codex agent added a workaround that didn't fully solve the issue. The actual fixes were: regenerating Prisma client and fixing the import path.
- **Risks / notes**: Build passes. Server needs restart to pick up changes.
- **Related docs**: `docs/task-generation/README.md` (Task Labels section).

### 2026-02-07 – Guard schedule generation when Prisma client is stale

- **Agent / context**: Codex – fix repeated `Unknown argument label` during schedule creation.
- **Summary**:
  - Added runtime check for `Task.label` support in Prisma client.
  - Skip label persistence when client is stale, preventing createMany failures.
- **Files touched**:
  - `src/app/api/schedule/generate-schedule/route.ts`
- **Motivation**: Allow schedule generation to complete even if Prisma client wasn’t regenerated yet.
- **Risks / notes**: Labels won’t persist until Prisma client is regenerated and server restarted.
- **Related docs**: `docs/task-generation/README.md` (Task Labels section).

### 2026-02-07 – Regenerate Prisma client for task labels

- **Agent / context**: Codex – fix schedule generation error for new `label` field.
- **Summary**:
  - Regenerated Prisma client so `Task.label` is recognized by `createMany` during schedule generation.
- **Files touched**:
  - `node_modules/.prisma/client` (generated)
- **Motivation**: Resolve runtime error: `Unknown argument label` when creating schedule tasks.
- **Risks / notes**: Generated client only; no source changes.
- **Related docs**: `ARCHITECTURE.md` (Prisma schema/migrations).

### 2026-02-07 – Smoother streaming (natural ChatGPT-like feel)

- **Agent / context**: Cursor AI – user feedback: streaming felt jerky/robotic.
- **Summary**:
  - Added `smoothStream()` to chat API with word-by-word chunking.
  - `delayInMs: null` (no artificial delay) for responsive flow.
  - Words buffer and release as complete units instead of token fragments.
- **Files touched**: `src/app/api/chat/route.ts`, `docs/streaming-chat/README.md`
- **Motivation**: Make streaming feel natural like ChatGPT, with higher effective refresh.
- **Related docs**: `docs/streaming-chat/README.md` (Smooth Streaming section).

### 2026-02-07 – Streaming chat with Vercel AI SDK

- **Agent / context**: Cursor AI – Feature 1: migrate chat from request/response to streaming.
- **Summary**:
  - Replaced chat API with streaming endpoint using `streamText()`, `createUIMessageStream()`, `createUIMessageStreamResponse()`.
  - Updated onboarding page to use `useChat` hook from `@ai-sdk/react` with `DefaultChatTransport`.
  - Harvey's messages now appear word-by-word (streaming) like ChatGPT/Claude.
  - Single backend pattern with `context` parameter (onboarding, project-chat, task-chat) for future chat features.
  - Constraint extraction remains a separate non-streamed call in schedule generation (unchanged).
- **Files touched**:
  - `src/app/api/chat/route.ts` – rewritten for streaming
  - `src/app/onboarding/page.tsx` – switched to `useChat`
  - `src/components/onboarding/ChatMessage.tsx` – progressive streaming display
  - `docs/streaming-chat/README.md` – new feature documentation
  - `docs/onboarding/README.md` – updated flow
  - `ARCHITECTURE.md` – chat route and component descriptions
  - `package.json` – added `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`
- **Motivation**: Provide streaming UX for all chat; future features (post-onboarding chat, task-chat, etc.) inherit streaming automatically.
- **Risks / notes**: ChatSidebar (dashboard) is read-only and unchanged. Verify onboarding flow end-to-end (chat → Build schedule → loading → dashboard).
- **Related docs**: `docs/streaming-chat/README.md`, `ARCHITECTURE.md` (API routes, components).

### 2026-02-06 – Add task labels with AI assignment and UI badges

- **Agent / context**: Codex – implemented quick-win task labels across generation, storage, and dashboard UI.
- **Summary**:
  - Added `label` to the Task model, including a Prisma migration.
  - Extended Claude task generation/parsing to output labels and persisted them with schedule generation.
  - Rendered label pills on task cards and in the task modal, with normalized fallback to `Planning`.
- **Files touched**:
  - `src/prisma/schema.prisma`
  - `src/prisma/migrations/20260206235507_add_task_label/migration.sql`
  - `src/types/api.types.ts`
  - `src/types/task.types.ts`
  - `src/lib/schedule/schedule-generation.ts`
  - `src/app/api/schedule/generate-schedule/route.ts`
  - `src/lib/tasks/task-service.ts`
  - `src/components/dashboard/TaskCategoryBadge.tsx`
  - `src/components/dashboard/TaskTile.tsx`
  - `src/components/dashboard/TaskModal.tsx`
  - `docs/task-generation/README.md`
  - `ARCHITECTURE.md`
- **Motivation**: Provide a fast, consistent way to categorize tasks with color-coded labels.
- **Risks / notes**: Existing tasks without labels now default to `Planning`. TODO left to support dynamic label/color mapping in the future.
- **Related docs**: `ARCHITECTURE.md` (Dashboard components), `docs/task-generation/README.md` (Task Labels section).

### 2026-02-05 – Add feature docs for auth, onboarding, dashboard

- **Agent / context**: Codex – documentation request for additional features.
- **Summary**:
  - Added feature documentation under `docs/` for auth, onboarding, and dashboard flows.
  - Updated `ARCHITECTURE.md` to reference the new documentation folder.
- **Files touched**:
  - `docs/task-generation/README.md`
  - `docs/auth/README.md`
  - `docs/onboarding/README.md`
  - `docs/dashboard/README.md`
  - `ARCHITECTURE.md`
- **Motivation**: Provide clear, repo-grounded feature explanations for other agents and humans.
- **Risks / notes**: Documentation-only change; no runtime behavior changed.
- **Related docs**: `ARCHITECTURE.md` (Top-level structure), `docs/` (feature docs).

### 2026-02-05 – Initialize architecture and AI agent changelog docs

- **Agent / context**: Cursor AI assistant – initial documentation setup request.
- **Summary**:
  - Created `ARCHITECTURE.md` as the main architecture and project-structure overview.
  - Created `AI_AGENT_CHANGELOG.md` to track future AI-driven code changes.
- **Files touched**:
  - `ARCHITECTURE.md`
  - `AI_AGENT_CHANGELOG.md`
- **Motivation**: Provide a clear, central reference for how the codebase is organized and a dedicated log for AI-made changes to aid debugging and future maintenance.
- **Related docs**: `ARCHITECTURE.md` (entire document).
