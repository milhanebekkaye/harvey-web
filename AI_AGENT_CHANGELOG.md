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
