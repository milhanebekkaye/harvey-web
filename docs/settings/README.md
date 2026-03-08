# Settings Page

The Settings page lets users view and edit all constraints and preferences that Harvey uses for scheduling. It is Feature B of the MVP Launch Sprint.

## Access

- **Route**: `/dashboard/settings`
- **Entry point**: Settings gear icon in the dashboard header (top right of the chat sidebar). Clicking it navigates to the full-page Settings view.

## Page structure

- **Save UX**: When there are unsaved changes, a **sticky top bar** (frosted, at top) shows “You have unsaved changes” with **Discard** and **Save Changes** buttons. The header Save button was removed; save/discard are only in the bar. Layout: header with title, subtitle, and user profile card (name, email, Pro/Free from `/api/user/me`); tab bar (Schedule | Preferences | Harvey's Notes with count); tab content. Dirty state is derived by comparing current `data` to `savedSnapshot` (set on load and after successful save).

1. **Work Schedule** – User life constraints (stored on **User**)
   - **Per-block days and times**: each “work block” has its own **days** (Mon–Sun checkboxes) and **start/end time**. Example: Block 1 = Mon 9–12 and 15–17, Block 2 = Thu 8–13. “Add work block” adds a new row (default Mon–Fri 9–5); each block has Remove.
   - Legacy format (single workDays + startTime/endTime) is still accepted and shown as one block with those days.
   - Commute morning: duration (minutes) + start time (optional)
   - Commute evening: duration (minutes) + start time (optional)

2. **Availability Windows** – User availability (stored on **User**.availabilityWindows)
   - Week-view grid: work hours (grey), commute (lighter grey), availability blocks (green/blue by type). When overlapping blocks share a cell, personal is preferred for the displayed color. Cells where both work schedule and a project block overlap show a diagonal stripe overlay (sky-blue).
   - **Click-to-select** (only in add mode): Click "+ Add block" (or "Add your first availability block") to enter add mode; then click an empty cell to set start, another cell in the same day to set end; type popover (Project / Personal) adds the block. Cancel link on the hint banner or Escape exits add mode. Single-cell click creates a 1-hour block. Form-based add remains available in add mode.
   - List of blocks: day, start, end, type (work | personal); add / edit / delete; displayed newest first. Form-based “+ Add block” remains available.
   - Total hours per week
   - Empty state when no blocks

3. **Preferences**
   - **Energy pattern** (User.energy_peak): Morning / Afternoon / Evening
   - **Rest days** (User.rest_days): Days the user doesn’t want to work on the project
   - **Preferred session length** (User.preferred_session_length): 15 / 30 / 60 / 90 / 120 min or Custom
   - **Communication style** (User.communication_style): Direct & Brief / Encouraging / Detailed

4. **Project**
   - “View Project Details” button → placeholder “Coming soon – Feature C in progress” (Task C will replace with real navigation).

## Data flow

- **On load**: `GET /api/settings` returns `{ user, project }`. User includes workSchedule, commute, preferred_session_length, communication_style, timezone. Project (if any) includes schedule_duration_days, exclusions. User includes availabilityWindows, energy_peak, rest_days. No blocked_time is stored or returned. Response is stored in `data` and `savedSnapshot` (used for unsaved-changes detection).
- **On save**: “Save Changes” in the sticky bar sends `POST /api/settings/update` with the full form payload. Backend updates **User** (workSchedule, commute, preferred_session_length, communication_style, availabilityWindows, energy_peak, rest_days) and **Project** (schedule_duration_days, exclusions only). After success, a background refetch updates `data` and `savedSnapshot`. No schedule rebuild; changes apply to the next generation or rescheduling.

## Where data is stored

| Section / Field              | Stored in                    |
|------------------------------|------------------------------|
| Work schedule, commute       | **User**.workSchedule, **User**.commute |
| Availability windows         | **User**.availabilityWindows |
| Energy peak, rest days       | **User**.energy_peak, **User**.rest_days |
| Session length, communication style | **User**.preferred_session_length, **User**.communication_style |
| Schedule duration, exclusions | **Project**.schedule_duration_days, **Project**.exclusions |

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the overall “User = life constraints, Project = project allocations” split.

## Files

- **Page**: `src/app/dashboard/settings/page.tsx`
- **API**: `src/app/api/settings/route.ts` (GET), `src/app/api/settings/update/route.ts` (POST)
- **Components**: `src/components/settings/WorkScheduleSection.tsx`, `AvailabilitySection.tsx`, `PreferencesSection.tsx` (each supports an optional `variant` for the card/grid layout). Settings page does not use StickyUnsavedBar (save/discard in top bar).
- **Types**: `src/types/settings.types.ts`

## Validation

- Times in 24h format. For availability blocks: end time must not equal start time. **Overnight blocks** (end &lt; start, e.g. Friday 23:00 – 02:00) are allowed and mean “until that time on the next calendar day”.
- Availability blocks: **overlapping blocks are allowed**. The scheduler and total-available-hours logic normalize (merge) overlapping blocks per day before use, so overlapping entries in the UI are accepted and not double-counted.
- Work schedule: either legacy `workDays` + `startTime`/`endTime`, or `blocks` array. Each block in `blocks` has `days` (0–6), `startTime`, `endTime`; end &gt; start; two blocks that share a day must not have overlapping times.
- Preferences: `energy_peak` must be one of `mornings`, `afternoons`, `evenings` when provided.

## Availability blocks data model (including overnight)

- Each block is stored as a single object: `{ day, start, end, type? }`. `day` is the **start** day (e.g. `"friday"`).
- **User.availabilityWindows**: Single source for scheduling. Windows can be **fixed** or **flexible** (extraction uses `window_type` and `flexible_hours`). Settings availability blocks are fixed only; flexible windows from onboarding are used by the scheduler (slot capacity = flexible_hours). Schedule generation and tools build constraints from User + Project only; contextData is no longer used.
- **Same-day**: `end` &gt; `start` (e.g. Monday 14:00–16:00). Renders as one segment on that day.
- **Overnight**: `end` ≤ `start` (e.g. Friday 23:00 – 02:00). Stored as one block; in the week grid it is shown split across two days: `[day] start–24:00` and `nextDay(day) 00:00–end`. Day order is Monday → Tuesday → … → Sunday → Monday.
- Edge cases: 22:00–00:00 is treated as overnight (segment until 24:00 on start day; next-day segment 0–0 is effectively empty). Full overnight (e.g. 00:00–23:59) is valid and spans the whole next day.

## Work schedule data model (per-block days)

- **Legacy**: `{ workDays, startTime, endTime }` — one block for all selected days. Still accepted and displayed as one block row.
- **Per-block days**: `{ blocks: [ { days: number[], startTime, endTime }, ... ] }` — each block applies only to its selected days (e.g. Mon/Wed 9–12, Thu 8–13). Overlap check: two blocks that share at least one day must not have overlapping times.
- Scheduling and grid use all blocks to build blocked slots per day.

## Persistence and logging

- **Save**: “Save Changes” in the sticky top bar sends the full payload. `available_time` is sorted by day then start time before writing. `preferences` (including `energy_peak`) is merged with existing contextData.preferences.
- **API logging** (for debugging): `POST /api/settings/update` logs received body (has_available_time, available_time_count, preferences, projectId) and, when updating project, logs saved available_time count and preferences. Settings page in development logs the payload before send.

## No project

If the user has no active project (e.g. hasn’t completed onboarding), GET /api/settings returns `project: null`. The Availability section is replaced by a short message: “Complete onboarding to add availability blocks.” User-level fields (work schedule, commute, session length, communication style) can still be edited and saved.
