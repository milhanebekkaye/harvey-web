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
