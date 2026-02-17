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
  - Scheduling algorithm that assigns tasks to dates/time slots, handles splits, and calculates start dates.
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
3. API loads the `Discussion` for the project, then formats messages as `ROLE: content` blocks.
4. **Extraction** (last 15 messages only): `extractConstraints(conversationTextForExtraction)` calls Claude with extended prompt; parses JSON into `ExtractedConstraints` (scheduling + enrichment). API saves scheduling subset to `Project.contextData`; writes enrichment to Project and User via `updateProject`/`updateUser` (only defined values; failures non-fatal).
5. `generateTasks(conversationTextFull, constraints)` uses **full** conversation; Claude produces task text.
6. `parseTasks(claudeResponse)` converts Claude output into `ParsedTask[]` and optional milestones.
7. `calculateStartDate(constraints, userTimezone)` picks a schedule start date.
8. `assignTasksToSchedule(tasks, constraints, startDate, durationWeeks)` assigns tasks to time slots and splits them as needed. **available_time** can include **flexible** blocks (optional `flexible_hours`); for those, slot capacity = flexible_hours (not end − start) and work/commute are not subtracted. Tasks assigned to flexible slots get `scheduledStartTime`/`scheduledEndTime` = null and `window_start`/`window_end`/`is_flexible` set; the timeline shows "During work hours · Xh" (or morning/afternoon/evening).
9. API maps scheduled blocks into `Task` records and bulk inserts them via Prisma.
10. API returns `{ success, taskCount, milestones }`.

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
  - Calls Claude with extended `EXTRACTION_SYSTEM_PROMPT` (max_tokens 4096). Returns scheduling fields plus enrichment (target_deadline, skill_level, tools_and_stack, project_type, weekly_hours_commitment, motivation, phases, project_notes, preferred_session_length, communication_style, user_notes). Strips markdown; parses or repairs JSON; on failure returns defaults. The **caller** (generate-schedule route) passes only the last 15 messages for extraction; full conversation is used for `generateTasks`.
- `repairJSON(jsonText)`
  - Heuristic cleanup for Claude JSON: removes trailing commas, closes truncated final string value if needed, then adds missing `]` before `}` (brackets before braces) so user constraints are preferred over defaults when output is cut off.
- `generateTasks(conversationText, constraints)`
  - Calculates available hours, builds the task generation prompt, calls Claude, and returns raw task text.
- `parseTasks(claudeResponse)`
  - Splits response into task blocks, extracts milestones, and returns `{ tasks, milestones }`.
- `parseTaskBlock(block)`
  - Parses one task block into `ParsedTask` fields: title, description, success, hours, priority, label, depends_on (optional 1-based indices).
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
- `buildAvailabilityMap(constraints, userBlocked?)`
  - Builds day → time slots map from `available_time`. Fixed blocks are reduced by User work/commute. Blocks with **flexible_hours** create slots whose capacity = flexible_hours (no subtraction). Preserves overnight slots as continuous spans.
- `calculateStartDate(constraints, userTimezone)`
  - Chooses start date using `preferences.start_preference` and user timezone.
  - Defaults to tomorrow, or next Monday if today is Fri/Sat/Sun.
- `assignTasksToSchedule(tasks, constraints, startDate, durationWeeks)`
  - Core scheduling loop. Orders tasks by dependencies only (topological sort); no priority re-sort, so dependency order is preserved. Then fills available slots day by day.
  - Splits tasks when they do not fit in a slot; minimum split block is 1 hour; ignores slots under 30 minutes remaining.
  - Returns scheduled tasks and unscheduled task indices with totals.
- `getTaskScheduleData(taskIndex, scheduledTasks)`
  - Returns the first scheduled block for a given task for DB use.

### `src/app/api/schedule/generate-schedule/route.ts`
- `POST(request)`
  - Orchestrates the whole feature. See end-to-end flow above.
  - Includes a safeguard that skips generation if tasks already exist for the project.
  - Creates one `Task` record per scheduled block, appending "(Part N)" when a task is split.

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
- **Generation**: Claude may output an optional line per task: `DEPENDS_ON: 1, 3` (1-based indices of tasks in the generated list). The parser fills `ParsedTask.depends_on`; the scheduler orders tasks by **dependency only** (topological sort). We do **not** re-sort by priority after that, so dependency order is never broken (e.g. "Build authentication" always after "Set up database"). When creating DB tasks, dependency indices are resolved to task IDs and saved on each task.
- **Rescheduling**: The scheduler never schedules a task before its dependencies. When the user resets and regenerates, the new schedule respects dependencies.
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

## Gaps / Not found in repo
- UI entry point that triggers `POST /api/schedule/generate-schedule` is not documented in the files above.
- Any background job, queue, or retry system for schedule generation is not present in the files above.
