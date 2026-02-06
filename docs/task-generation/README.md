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
4. `extractConstraints(conversationText)` calls Claude with `EXTRACTION_SYSTEM_PROMPT` and parses JSON into `ExtractedConstraints`.
5. `generateTasks(conversationText, constraints)` builds a dynamic system prompt and calls Claude to produce task text.
6. `parseTasks(claudeResponse)` converts Claude output into `ParsedTask[]` and optional milestones.
7. API stores constraints in `Project.contextData`.
8. `calculateStartDate(constraints, userTimezone)` picks a schedule start date.
9. `assignTasksToSchedule(tasks, constraints, startDate, durationWeeks)` assigns tasks to time slots and splits them as needed.
10. API maps scheduled blocks into `Task` records and bulk inserts them via Prisma.
11. API returns `{ success, taskCount, milestones }`.

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
  - Calls Claude with `EXTRACTION_SYSTEM_PROMPT`, aggressively isolates JSON, attempts repair, and returns `ExtractedConstraints`.
  - On parsing failure after repair, returns defaults.
- `repairJSON(jsonText)`
  - Heuristic cleanup for Claude JSON issues: removes trailing commas, fixes some unclosed strings, closes braces/brackets.
- `generateTasks(conversationText, constraints)`
  - Calculates available hours, builds the task generation prompt, calls Claude, and returns raw task text.
- `parseTasks(claudeResponse)`
  - Splits response into task blocks, extracts milestones, and returns `{ tasks, milestones }`.
- `parseTaskBlock(block)`
  - Parses one task block into `ParsedTask` fields: title, description, success, hours, priority.
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
- `buildAvailabilityMap(constraints)`
  - Builds day -> time slots map from `available_time`, preserving overnight slots as continuous spans.
- `calculateStartDate(constraints, userTimezone)`
  - Chooses start date using `preferences.start_preference` and user timezone.
  - Defaults to tomorrow, or next Monday if today is Fri/Sat/Sun.
- `assignTasksToSchedule(tasks, constraints, startDate, durationWeeks)`
  - Core scheduling loop. Sorts tasks by priority, then fills available slots day by day.
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

## Gaps / Not found in repo
- UI entry point that triggers `POST /api/schedule/generate-schedule` is not documented in the files above.
- Any background job, queue, or retry system for schedule generation is not present in the files above.
