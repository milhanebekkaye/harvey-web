# Settings Page

The Settings page lets users view and edit all constraints and preferences that Harvey uses for scheduling. It is Feature B of the MVP Launch Sprint.

## Access

- **Route**: `/dashboard/settings`
- **Entry point**: Settings gear icon in the dashboard header (top right of the chat sidebar). Clicking it navigates to the full-page Settings view.

## Page structure

1. **Work Schedule** – User life constraints (stored on **User**)
   - **Per-block days and times**: each “work block” has its own **days** (Mon–Sun checkboxes) and **start/end time**. Example: Block 1 = Mon 9–12 and 15–17, Block 2 = Thu 8–13. “Add work block” adds a new row (default Mon–Fri 9–5); each block has Remove.
   - Legacy format (single workDays + startTime/endTime) is still accepted and shown as one block with those days.
   - Commute morning: duration (minutes) + start time (optional)
   - Commute evening: duration (minutes) + start time (optional)

2. **Availability Windows** – Project allocations (stored on **Project.contextData**)
   - Week-view grid: work hours (grey), commute (lighter grey), availability blocks (green/blue by type)
   - List of blocks: day, start, end, type (work | personal); add / edit / delete
   - Total hours per week
   - Empty state when no blocks

3. **Preferences**
   - **Energy pattern** (Project.contextData.preferences.energy_peak): Morning / Afternoon / Evening
   - **Rest days** (Project.contextData.preferences.rest_days): Days the user doesn’t want to work on the project
   - **Preferred session length** (User.preferred_session_length): 15 / 30 / 60 / 90 / 120 min or Custom
   - **Communication style** (User.communication_style): Direct & Brief / Encouraging / Detailed

4. **Project**
   - “View Project Details” button → placeholder “Coming soon – Feature C in progress” (Task C will replace with real navigation).

## Data flow

- **On load**: `GET /api/settings` returns `{ user, project }`. User includes workSchedule, commute, preferred_session_length, communication_style, timezone. Project (if any) includes contextData.available_time and contextData.preferences. No blocked_time is stored or returned.
- **On save**: Single “Save” button sends `POST /api/settings/update` with the full form payload. Backend updates **User** (workSchedule, commute, preferred_session_length, communication_style) and **Project.contextData** (available_time, preferences only). No schedule rebuild; changes apply to the next generation or rescheduling.

## Where data is stored

| Section / Field              | Stored in                    |
|------------------------------|------------------------------|
| Work schedule, commute       | **User**.workSchedule, **User**.commute |
| Availability blocks           | **Project**.contextData.available_time |
| Energy peak, rest days       | **Project**.contextData.preferences     |
| Session length, communication style | **User**.preferred_session_length, **User**.communication_style |

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the overall “User = life constraints, Project = project allocations” split.

## Files

- **Page**: `src/app/dashboard/settings/page.tsx`
- **API**: `src/app/api/settings/route.ts` (GET), `src/app/api/settings/update/route.ts` (POST)
- **Components**: `src/components/settings/WorkScheduleSection.tsx`, `AvailabilitySection.tsx`, `PreferencesSection.tsx`
- **Types**: `src/types/settings.types.ts`

## Validation

- Times in 24h format. For availability blocks: end time must not equal start time. **Overnight blocks** (end &lt; start, e.g. Friday 23:00 – 02:00) are allowed and mean “until that time on the next calendar day”.
- Availability blocks: no overlapping blocks; validated on client and server. Overlap is computed per calendar day: overnight blocks are expanded into segments (e.g. Friday 23:00–02:00 → Friday 23:00–24:00 and Saturday 00:00–02:00), and overlaps are checked on these segments.
- Work schedule: either legacy `workDays` + `startTime`/`endTime`, or `blocks` array. Each block in `blocks` has `days` (0–6), `startTime`, `endTime`; end &gt; start; two blocks that share a day must not have overlapping times.
- Preferences: `energy_peak` must be one of `mornings`, `afternoons`, `evenings` when provided.

## Availability blocks data model (including overnight)

- Each block is stored as a single object: `{ day, start, end, type? }`. `day` is the **start** day (e.g. `"friday"`).
- **Same-day**: `end` &gt; `start` (e.g. Monday 14:00–16:00). Renders as one segment on that day.
- **Overnight**: `end` ≤ `start` (e.g. Friday 23:00 – 02:00). Stored as one block; in the week grid it is shown split across two days: `[day] start–24:00` and `nextDay(day) 00:00–end`. Day order is Monday → Tuesday → … → Sunday → Monday.
- Edge cases: 22:00–00:00 is treated as overnight (segment until 24:00 on start day; next-day segment 0–0 is effectively empty). Full overnight (e.g. 00:00–23:59) is valid and spans the whole next day.

## Work schedule data model (per-block days)

- **Legacy**: `{ workDays, startTime, endTime }` — one block for all selected days. Still accepted and displayed as one block row.
- **Per-block days**: `{ blocks: [ { days: number[], startTime, endTime }, ... ] }` — each block applies only to its selected days (e.g. Mon/Wed 9–12, Thu 8–13). Overlap check: two blocks that share at least one day must not have overlapping times.
- Scheduling and grid use all blocks to build blocked slots per day.

## Persistence and logging

- **Save**: Single “Save” button sends the full payload. `available_time` is sorted by day then start time before writing. `preferences` (including `energy_peak`) is merged with existing contextData.preferences.
- **API logging** (for debugging): `POST /api/settings/update` logs received body (has_available_time, available_time_count, preferences, projectId) and, when updating project, logs saved available_time count and preferences. Settings page in development logs the payload before send.

## No project

If the user has no active project (e.g. hasn’t completed onboarding), GET /api/settings returns `project: null`. The Availability section is replaced by a short message: “Complete onboarding to add availability blocks.” User-level fields (work schedule, commute, session length, communication style) can still be edited and saved.
