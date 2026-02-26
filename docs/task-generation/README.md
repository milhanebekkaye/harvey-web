# Task Generation and Scheduling (Harvey Web)

## What this feature is about
This feature turns an onboarding conversation into a concrete, time-slotted task schedule. It extracts scheduling constraints, generates a detailed task breakdown with Claude, parses tasks, assigns them into available time slots, and persists them to the database.

## Files involved (and where to find them)
- `src/app/api/schedule/generate-schedule/route.ts`
  - API route that orchestrates the full flow: auth, load discussion, extract constraints, generate tasks, schedule, and write tasks to DB.
- `src/app/api/schedule/reset-schedule/route.ts`
  - API route that deletes all tasks for a project (used to reset a generated schedule).
- `src/lib/schedule/schedule-generation.ts`
  - Constraint extraction prompt, task generation prompt, Claude calls, task parsing, and success-criteria conversion.
- `src/lib/schedule/task-scheduler.ts`
  - Slot assignment pipeline: Claude-powered scheduling with hard validation/retry and deterministic fallback.
- `src/lib/schedule/assignment-post-processor.ts`
  - Post-processes scheduled assignments before DB write: enforces part consecutiveness and dependency ordering by reordering slot data only.
- `src/lib/ai/claude-client.ts`
  - Anthropic client configuration used by the schedule generation utilities.
- `src/types/api.types.ts`
  - Types for ExtractedConstraints, ParsedTask, GenerateScheduleRequest/Response, StoredMessage, TimeBlock.
- `src/prisma/schema.prisma`
  - Data models involved: `User` (timezone), `Project` (contextData), `Discussion` (messages), `Task` (scheduled fields).

If you expect UI entry points or additional services to trigger this flow, they are not documented in these files.

## Feature flow (end-to-end)
1. Client calls `POST /api/schedule/generate-schedule` with `{ projectId }`.
2. API authenticates the user via Supabase server client.
3. API loads the **Discussion** and the full **Project** and **User** from the database.
4. API converts discussion messages to conversation text (for task generation context only).
5. **Constraints from DB (no re-extraction)**: `buildConstraintsFromProjectAndUser(project, user)` builds `ExtractedConstraints` from already-persisted fields (e.g. `project.contextData`, `project.availabilityWindows` or User windows, `project.phases`, `user.energy_peak`, `user.preferred_session_length`, etc.). The onboarding flow is responsible for extraction and saving to Project/User; when the user clicks "Build my schedule", we **do not** call `extractConstraints` or re-parse the conversation for constraints — this avoids overwriting what the user already sees in the Project Shadow panel.
6. API saves a scheduling subset of the built constraints to `Project.contextData` (so Settings/tools see `available_time`).
7. `generateTasks(conversationTextFull, constraints)` uses the **full** conversation as context; Claude produces task text.
8. `parseTasks(claudeResponse)` converts Claude output into `ParsedTask[]` and optional milestones.
9. **Start date**: If `project.schedule_start_date` is set, the API uses it (normalized to the calendar day); otherwise `calculateStartDate(constraints, userTimezone)` picks a schedule start date (tomorrow/next Monday from preferences or default).
10. `assignTasksWithClaude(tasks, constraints, startDate, durationWeeks, userTimezone, userBlocked, options?)` handles slot assignment with a hybrid flow: (a) build slot map with existing `buildAvailabilityMap` (unchanged), (b) serialize tasks/slots and call Claude Haiku, (c) validate hard constraints algorithmically (task/slot IDs, overlaps, dependencies, split continuity, duration integrity), (d) retry once with explicit violations if needed, (e) fallback to deterministic `assignTasksToSchedule` on second failure. API logs **SchedulerOptions** and each task record with `energy_required`, `preferred_slot`, `is_flexible`.
11. **Post-process** scheduled assignments via `enforceSchedulingConstraints(assignments, tasks, userTimezone)` from `src/lib/schedule/assignment-post-processor.ts` to enforce split-part consecutiveness and dependency ordering (reordering slot data only); then map to task records and persist.
12. API maps scheduled blocks into `Task` records and bulk inserts them via Prisma; resolves **depends_on** to task IDs. **Dependency validation** uses window bounds for flexible tasks (dependency’s latest end ≤ this task’s earliest start) so same-day flexible-before-fixed is not incorrectly dropped.
13. API persists **milestones** and **schedule_duration_days** on the project. Milestones are displayed on the **Project Details** page when non-empty.
14. **Post-generation coaching message** (Session 2): API builds a scheduling context and calls **generateScheduleCoachingMessage(context)** to produce a 3–4 sentence Harvey message (distribution, choices, what to focus on first). That message is saved as the project discussion's initial message; on Claude failure a fallback greeting is used.
15. API returns `{ success, taskCount, milestones }`.

**Scheduling details (current)**: **available_time** can include **flexible** blocks (`flexible_hours` or `window_type === 'flexible'`). For flexible slots, **capacity = flexible_hours** (slot end = start + flexible_hours, never the boundary end); tasks get `window_start`/`window_end`/`is_flexible`. Primary scheduling is now Claude-powered (`assignTasksWithClaude`) with strict validation and one retry. If Claude output remains invalid, deterministic `assignTasksToSchedule` runs as fallback and still applies the Session 4 heuristics (slot-type matching, 15-minute gap, 30-minute split minimum, ramp-up day 1, non-emergency before emergency, weekend inclusion, cross-day dependency checks, split continuation handling).

Reset flow:
1. Client calls `POST /api/schedule/reset-schedule` with `{ projectId }`.
2. API deletes all `Task` records for that project.

## Function reference (what each function does)

### `src/lib/schedule/schedule-generation.ts`
- `buildTaskGenerationPrompt(constraints, availableHoursPerWeek)`
  - Builds a system prompt that instructs Claude to output tasks with titles, descriptions, success criteria, hours, and priority.
  - Includes schedule duration, available hours, skill level, and exclusions.
- `calculateTotalAvailableHours(constraints)`
  - Sums `available_time` blocks into a weekly hour total.
- `stripMarkdownCodeBlocks(text)`
  - Removes ```json/``` wrappers from Claude responses.
- `getDefaultConstraints()`
  - Returns a 2-week default constraint set with weekday evenings and full weekend availability.
- `extractConstraints(conversationText)`
  - Calls Claude with extended `EXTRACTION_SYSTEM_PROMPT` (max_tokens 4096). Returns scheduling fields plus enrichment. Used **only during onboarding** (e.g. after each message via `POST /api/onboarding/extract`). The **generate-schedule** route does **not** call this; it uses `buildConstraintsFromProjectAndUser(project, user)` so constraints come from DB only and the Project Shadow panel is not overwritten.
- `repairJSON(jsonText)`
  - Heuristic cleanup for Claude JSON: removes trailing commas, closes truncated final string value if needed, then adds missing `]` before `}` (brackets before braces) so user constraints are preferred over defaults when output is cut off.
- `generateTasks(conversationText, constraints)`
  - Calculates available hours, builds the task generation prompt, calls Claude, and returns raw task text.
- `parseTasks(claudeResponse)`
  - Splits response into task blocks, extracts milestones, and returns `{ tasks, milestones }`.
- `parseTaskBlock(block)`
  - Parses one task block into `ParsedTask` fields: title, description, success, hours, priority, label, depends_on (optional 1-based indices), **energy_required** (optional "high"|"medium"|"low"), **preferred_slot** (optional "peak_energy"|"normal"|"flexible"). Task title is cleaned: leading and trailing `**` from markdown are stripped so titles do not show artifacts like "…user journey**".
- `convertSuccessCriteriaToJson(successString)`
  - Converts a bullet list string into `{ id, text, done }[]` for database storage.

### `src/lib/schedule/task-scheduler.ts`
- `parseTimeToHours(timeStr)`
  - Converts `HH:MM` into decimal hours.
- `formatHoursToTime(hours)`
  - Converts decimal hours into `HH:MM`.
- `getDayName(date)`
  - Returns lowercase day name for a date.
- `getNextMonday(fromDate)`
  - Returns the next Monday (always in the future).
- `addDays(date, days)`
  - Adds a number of days to a date.
- `createDateTime(date, hours)`
  - Converts a date and decimal hours into a full datetime; supports hours >= 24 for overnight slots.
- `buildAvailabilityMap(constraints, userBlocked?, energyPeak?)`
  - Builds day → time slots map from `available_time`. Fixed blocks are reduced by User work/commute. Blocks with **flexible_hours** create slots whose capacity = flexible_hours (no subtraction). When **energyPeak** is provided, each slot gets a **slotType** (peak_energy | normal | flexible | emergency) for smart matching. Preserves overnight slots as continuous spans.
- `calculateStartDate(constraints, userTimezone)`
  - Chooses start date using `preferences.start_preference` and user timezone.
  - Defaults to tomorrow, or next Monday if today is Fri/Sat/Sun.
- `assignTasksWithClaude(tasks, constraints, startDate, durationWeeks, userTimezone?, userBlocked?, options?)`
  - Primary slot-assignment path. Builds the slot map (unchanged), serializes tasks + slots, calls Claude Haiku for JSON scheduling, validates hard constraints, retries once on validation failure, and falls back to deterministic `assignTasksToSchedule` if still invalid.
- `assignTasksToSchedule(tasks, constraints, startDate, durationWeeks, userTimezone?, userBlocked?, options?)`
  - Deterministic fallback scheduler. **Week structure**: Iterates from **start_date** for `durationWeeks * 7` days (day 0 = start_date, day 1 = next day, …). It does **not** align to calendar week boundaries (e.g. if start_date is Tuesday, the first week is Tue–Mon, not Mon–Sun). Logs `Schedule order (start_date forward)` so logs reflect this. Orders tasks by phase (active-first heuristic when phases are present), then dependency layer, then priority (high first), then energy_required (high first). Fills slots in two passes: non-emergency first, then emergency. Picks tasks that match slot type (preferred_slot) when possible; 15-minute gap between tasks in the same window; minimum fragment 30 minutes when splitting. **Dependency gate**: every dependency must already be scheduled and fully completed before a dependent can start, even across different days. **Split-part sequencing**: when a task is split into Part 1, Part 2, Part 3, etc., Part N+1 is only placed in slots that start **after** Part N ends (same day or later); all parts keep the original task's priority. **Continuation priority**: if a task already has at least one scheduled part and continuation is eligible at the current slot, that continuation is selected before any new task. **options** (Session 4): energyPeak, preferredSessionLength, userNotes, projectNotes, projectGoals, projectMotivation, phases, rampUpDay1 (max 2 tasks on day 1, prefer medium/low when notes mention motivation issues).
  - Returns scheduled tasks and unscheduled task indices with totals.
- `getTaskScheduleData(taskIndex, scheduledTasks)`
  - Returns the first scheduled block for a given task for DB use.

### `src/lib/schedule/assignment-post-processor.ts`
- `enforceSchedulingConstraints(assignments, tasks, userTimezone)`
  - Runs after slot assignment and before DB write. **Step 1**: Enforces part consecutiveness — split task parts (same taskIndex, partNumber > 1) are reordered so no other task's assignment is interleaved between Part N and Part N+1 (by swapping slot data). **Step 2**: Enforces dependency ordering — processes tasks in topological order; when a task is scheduled before a dependency, reassigns slots so all of the dependency's parts get the earliest slots and all of the dependent's parts get the latest, preserving part order within each task; reverts if the dependency's new position would violate its own dependencies. **Step 3**: Logs any remaining violations with `[PostProcessor]` prefix (read-only). Pure synchronous logic; returns the same array reference (mutates slot data in place). Additive: if the schedule is already correct, assignments are unchanged.

### `src/app/api/schedule/generate-schedule/route.ts`
- `POST(request)`
  - Orchestrates the whole feature. See end-to-end flow above.
  - **Step 5** loads constraints from DB via `buildConstraintsFromProjectAndUser(project, user)` (no re-extraction). Logs: `Step 5: Loading constraints from DB (no re-extraction) ✅` and `Loaded: energy_peak=…, skill_level=…, weekly_hours=…, windows=…`.
  - Includes a safeguard that skips generation if tasks already exist for the project.
  - Creates one `Task` record per scheduled block, appending "(Part N)" when a task is split.
  - Logs **SchedulerOptions** and each task record with `energy_required`, `preferred_slot`, `is_flexible` for debugging.

### `src/app/api/schedule/reset-schedule/route.ts`
- `POST(req)`
  - Deletes all tasks for the given projectId.

## Data models used (from Prisma schema)
- `User.timezone` is used to compute the schedule start date.
- `Project.contextData` stores extracted constraints JSON.
- `Discussion.messages` stores the onboarding conversation (`StoredMessage[]`).
- `Task` stores generated tasks and scheduling times (`scheduledDate`, `scheduledStartTime`, `scheduledEndTime`).
- `Task.depends_on` is a string array of task IDs this task depends on; used for ordering and cascade skip.
- `Task.label` stores the AI-assigned label used for task badge color.

## Task Dependencies
Tasks can declare dependencies on other tasks so Harvey knows e.g. that "Build authentication" must come after "Set up database."

- **Storage**: `Task.depends_on` is a `String[]` of task IDs this task depends on.
- **Generation**: Claude may output an optional line per task: `DEPENDS_ON: 1, 3` (1-based indices of tasks in the generated list). The parser fills `ParsedTask.depends_on`. For slot assignment, dependencies are converted to 0-based indices for Claude input and re-validated algorithmically (task earliest start must be strictly after dependency latest end). When creating DB tasks, dependency indices are resolved to task IDs and saved on each task.
- **Rescheduling**: Claude slot assignment is accepted only if dependency validation passes; otherwise it retries then falls back to deterministic scheduling, which also enforces dependencies.
- **Skip behavior**: When a task is set to **skipped**, the task service finds all tasks whose `depends_on` includes that task’s ID and sets them to **skipped** (cascade). The PATCH `/api/tasks/[taskId]` response may include `downstreamSkippedIds` so the client can show e.g. “You skipped ‘Set up database.’ ‘Build authentication’ depends on it, so it was skipped too.”

## Task Labels
Each generated task includes a `label` assigned by Claude during schedule generation. Labels are stored on `Task.label` and surfaced in the dashboard as a colored pill on task cards and in the calendar modal header.

Allowed labels and colors:
- Coding → Blue
- Research → Green
- Design → Purple
- Marketing → Orange
- Communication → Yellow
- Personal → Grey
- Planning → Pink

If a label is missing or invalid, it defaults to `Planning`.

## Task scheduling metadata (Session 4)

Each generated task can include two scheduling metadata fields used by the smart scheduler:

- **energy_required**: `"high"` | `"medium"` | `"low"` — cognitive load (high = deep focus, medium = moderate focus, low = can be distracted).
- **preferred_slot**: `"peak_energy"` | `"normal"` | `"flexible"` — ideal window type (peak_energy = user's best time of day, normal = standard windows, flexible = anywhere).

Claude outputs these as **ENERGY_REQUIRED:** and **PREFERRED_SLOT:** lines in each task block. The scheduler uses **User.energy_peak** ("morning"|"afternoon"|"evening") to classify slots; tasks with preferred_slot matching a slot's type are placed there when possible. Slots are typed as peak_energy, normal, flexible, or emergency (late_night/emergency windows, used only when capacity is exhausted).

## Gaps / Not found in repo
- UI entry point that triggers `POST /api/schedule/generate-schedule` is not documented in the files above.
- Any background job, queue, or retry system for schedule generation is not present in the files above.
