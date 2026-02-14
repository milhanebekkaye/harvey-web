## Harvey Web – Codebase Overview

**Purpose of this document**

- **Single source of truth**: This file is the main entry point for understanding how the Harvey web app is structured.
- **For humans and AI agents**: Both engineers and AI assistants should use this document to orient themselves before making changes.
- **Always keep updated**: Whenever you introduce a new feature, module, or significant refactor, update the relevant section here.

The project is a **Next.js (App Router) + TypeScript** application, using **Prisma** for database access, **Supabase** for authentication, and **Anthropic Claude** for AI features.

---

## Top-level structure

Root of the repository:

- **`.env.example`**: Example environment variables required by the app (e.g. database URLs, API keys). Copy to `.env.local` and fill in real values for local development.
- **`.gitignore`**: Files and folders that Git should ignore (build artifacts, local env files, etc.).
- **`components.json`**: Configuration for UI component tooling (often used by component libraries or generators).
- **`eslint.config.mjs`**: ESLint configuration for linting the codebase (JavaScript/TypeScript/React rules).
- **`next.config.ts`**: Next.js configuration (custom build config, experimental flags, etc.).
- **`output/`**: Local-generated artifacts (not application source). Includes `output/pdf/` for generated PDF reports/summaries.
- **`package-lock.json`**: Exact dependency tree lockfile for npm. Do not edit manually.
- **`package.json`**: Project metadata, dependencies, and scripts (e.g. `dev`, `build`, `lint`, `prisma:*`).
- **`postcss.config.mjs`**: PostCSS configuration (used by Tailwind and other CSS tooling).
- **`prisma.config.ts`**: Central Prisma configuration, typically wiring Prisma to the schema and runtime environment.
- **`public/`**: Static assets served directly by Next.js (images, SVGs, etc.).
- **`docs/`**: Documentation of the project (how work files, features, etc.).
- **`README.md`**: Generic Next.js README from `create-next-app`. For detailed internals, prefer this `ARCHITECTURE.md`.
- **`src/`**: All application source code (Next.js app, components, domain logic, types).
- **`prisma/`**: Prisma schema and database migrations for this project.
- **`tailwind.config.ts`**: Tailwind CSS configuration (design tokens, theme extensions, plugins).
- **`tsconfig.json`**: TypeScript compiler configuration for the project.

> Note: `node_modules/` and nested `.prisma/` directories contain generated or third‑party code and are not documented in detail here. Treat them as implementation details of dependencies.

---

## `public/` – Static assets

Static files served from the root of the site:

- **`file.svg`**: Generic file icon used in the UI.
- **`globe.svg`**: Globe illustration, likely used in onboarding or marketing sections.
- **`next.svg`**: Next.js logo SVG (default asset from the template).
- **`vercel.svg`**: Vercel logo SVG.
- **`window.svg`**: Window/desktop-like graphic, used in UI/marketing sections.

These assets are referenced via paths like `/file.svg` from React components.

---

## `src/` – Application source

### Overview

`src/` contains:

- **`app/`**: Next.js App Router entrypoints (pages, layouts, API routes).
- **`components/`**: Reusable React components grouped by feature (auth, dashboard, onboarding).
- **`lib/`**: Domain logic, services, integrations (AI, auth, DB, scheduling).
- **`node_modules/.prisma/`**: Generated Prisma client (do not edit).
- **`prisma/`**: Prisma schema and migrations (project-local, not the generated client).
- **`types/`**: Shared TypeScript types for API, auth, chat, tasks, and users.

---

## `src/app/` – Next.js App Router

Core Next.js application structure.

- **`layout.tsx`**: Root layout component for the entire app. Defines HTML structure, global providers, and shared UI wrappers.
- **`globals.css`**: Global CSS imported by the root layout (Tailwind base styles, global resets, custom global styles).
- **`favicon.ico`**: Browser tab icon.
- **`page.tsx`**: Root `/` route (landing page). Typically serves marketing or entry experience for the app.

Additional route groups:

- **`loading/page.tsx`**: A route that provides a loading/placeholder experience, likely displayed while the main experience or data loads.
- **`onboarding/page.tsx`**: `/onboarding` route. Split layout: 40% chat (left), 60% Shadow Panel (right). After each Harvey response, triggers extraction in the background via `POST /api/onboarding/extract` when `projectId` exists; stores result in `shadowFields` state and passes it to **ProjectShadowPanel**. **Feature D Step 6**: Weighted extraction progress (0–100), minimum-required fields check, and completion-marker detection drive a three-state “Build My Schedule” button (disabled / Stage 1 with confirmation modal / Stage 2 direct to schedule). Button lives at bottom of right column; confirmation modal “Build now or keep chatting?” for Stage 1. Extraction is non-blocking; errors are logged only.
- **`signin/page.tsx`**: `/signin` route. Handles email-based sign-in and integration with Supabase auth.
- **`dashboard/page.tsx`**: `/dashboard` route. Main authenticated user experience; shows tasks, timeline, calendar, and chat sidebar using dashboard components.
- **`dashboard/settings/page.tsx`**: `/dashboard/settings` route. Full-page Settings: work schedule, availability windows, preferences, and Project link. Data from GET `/api/settings`; save via POST `/api/settings/update`. See `docs/settings.md`. Complete/Skip use optimistic UI (timeline and chat message update immediately; PATCH runs in background; revert on failure). **Daily check-in**: on load, when the user has an active project and existing tasks, triggers a contextual check-in message (rate-limited to every 3 hours or new calendar day via localStorage); the message streams at the bottom of the chat and is persisted with `messageType: 'check-in'`.
- **`dashboard/project/[projectId]/page.tsx`**: `/dashboard/project/[projectId]` route. **Project Details page** (Feature C): view and edit project-level context (description, goals, deadline, project type, skill level, tools & stack, weekly hours, motivation). Server component fetches project via `getProjectById`; client form persists via PATCH `/api/projects/[projectId]`. See `docs/project-details-feature.md`.
- **`dashboard/project/[projectId]/loading.tsx`**: Loading state shown while the project details page is loading.

Auth callback:

- **`auth/callback/route.ts`**: Server route handling authentication callbacks (e.g. OAuth redirects). Finishes login, sets session, and redirects to the appropriate page.

### API routes – `src/app/api/`

These are server-side route handlers (Next.js Route Handlers). Each `route.ts` implements HTTP methods (`GET`, `POST`, etc.) for a particular resource.

- **`chat/route.ts`**
  - Endpoint under `/api/chat`.
  - Streaming chat: uses Vercel AI SDK (`streamText`, `createUIMessageStream`, `createUIMessageStreamResponse`) with `@ai-sdk/anthropic`.
  - Accepts `messages`, `projectId`, `context` (onboarding | project-chat | task-chat).
  - Saves messages to Discussion on stream finish. Project title/description and other fields are extracted by the client-triggered `POST /api/onboarding/extract` after each message. See `docs/streaming-chat/README.md` and `docs/onboarding/README.md`.

- **`onboarding/extract/route.ts`**
  - Endpoint under `/api/onboarding/extract`.
  - **Feature D (Shadow Panel) Step 2 + 3**: Extraction + persistence. POST body: `{ projectId }`. Authenticates user, verifies project ownership, loads onboarding discussion via `getOnboardingDiscussion`, builds full conversation text, calls Anthropic Haiku (CLAUDE_CONFIG.model) with a structured extraction prompt, parses and validates JSON. **Merge logic**: only non-null extracted fields are written (no overwriting with null). Uses `updateUser` and `updateProject` to persist; returns `{ success: true, extracted: { user, project }, saved: { user, project } }`. See `docs/onboarding/README.md`.

- **`chat/project/route.ts`**
  - Endpoint under `/api/chat/project`.
  - **Post-onboarding project chat**: streaming endpoint with 7 AI tools for schedule management. Uses **Claude Haiku** (`claude-haiku-4-5-20251001`) during MVP testing to reduce cost; can be switched back to Sonnet for paid users (see `AI_AGENT_CHANGELOG.md`).
  - Sends only the last **10 messages** as conversation history (reduced from 15 for cost).
  - Uses `assembleProjectChatContext()` to build a dynamic system prompt with live DB data (tasks, constraints, stats, notes). Schedule in the prompt is limited to today + next 7 days with a compact task format to reduce tokens.
  - Tools: `modify_schedule`, `update_constraints`, `add_task`, `suggest_next_action`, `get_progress_summary`, `regenerate_schedule`, `update_project_notes`.
  - Claude decides whether to call a tool (Category A) or respond conversationally (Category B).
  - Persists messages to Discussion (type: "project") on stream finish.
  - See `docs/chat-router/README.md` for full architecture docs.

- **`chat/checkin/route.ts`**
  - Endpoint under `/api/chat/checkin`.
  - **Daily check-in**: generates a contextual 2–3 sentence greeting for returning users. POST body: `{ projectId }`. Uses `assembleCheckInContext()` (time of day, today’s tasks, yesterday’s summary, streak, recent skipped tasks) and `streamText()` with a concise system prompt. Response is streaming plain text; the client persists the message to the project discussion with `messageType: 'check-in'`. Rate limiting is client-side via localStorage (3 hours or new calendar day per project). See `docs/checkin/README.md`.

- **`discussions/[projectId]/route.ts`**
  - Endpoint under `/api/discussions/[projectId]`.
  - Manages AI or human discussions tied to a specific project (identified by `projectId`).
  - Likely uses `src/lib/discussions/discussion-service.ts` and `src/lib/projects/project-service.ts`.

- **`schedule/generate-schedule/route.ts`**
  - Endpoint under `/api/schedule/generate-schedule`.
  - Generates or regenerates a task schedule for a given project/user.
  - Relies heavily on `src/lib/schedule/schedule-generation.ts` and `src/lib/schedule/task-scheduler.ts`.

- **`schedule/reset-schedule/route.ts`**
  - Endpoint under `/api/schedule/reset-schedule`.
  - Resets or clears an existing schedule (e.g. when user wants to restart planning).

- **`tasks/route.ts`**
  - Endpoint under `/api/tasks`.
  - Handles list/create operations for tasks (e.g. `GET` for fetching tasks, `POST` for creating).
  - Uses `src/lib/tasks/task-service.ts` for domain logic.

- **`settings/route.ts`**
  - GET `/api/settings`. Returns current user (workSchedule, commute, preferred_session_length, communication_style, timezone) and active project (id, contextData.available_time, contextData.preferences) for the Settings page.
- **`settings/update/route.ts`**
  - POST `/api/settings/update`. Persists Settings form: User (workSchedule, commute, preferred_session_length, communication_style) and Project.contextData (available_time, preferences). No blocked_time. Validates times and overlapping blocks.

- **`projects/[projectId]/route.ts`**
  - GET `/api/projects/[projectId]`. Returns the project for the authenticated user (ownership checked). Used by Project Details page and for refetch after save.
  - PATCH `/api/projects/[projectId]`. Partial update of project (title, description, goals, status, target_deadline, skill_level, tools_and_stack, project_type, weekly_hours_commitment, motivation). Validates types and ranges (e.g. weekly_hours 1–168, status active/paused/completed). Uses `project-service.getProjectById` and `project-service.updateProject`.

- **`tasks/[taskId]/route.ts`**
  - Endpoint under `/api/tasks/[taskId]`.
  - Handles single-task operations (fetch, update, delete) based on `taskId`. PATCH returns the updated task and optionally **progressToday** (same shape as GET `/api/progress/today`) when `?returnProgressToday=true`, so the completion feedback widget can avoid a separate GET.

- **`tasks/[taskId]/checklist/route.ts`**
  - Endpoint under `/api/tasks/[taskId]/checklist`.
  - Manages per-task checklist items (e.g. marking subtasks complete/incomplete).
  - Works together with the `TaskChecklistItem` UI component and `task-service`.

- **`progress/today/route.ts`**
  - Endpoint under `/api/progress/today`.
  - Returns today’s task counts (completed, skipped, pending, total), **userTimezone** (from User model), and **nextTask** (first pending today or nearest upcoming pending task). Used by the completion feedback widget to build the Harvey acknowledgment message after the user answers “how long did it take?”.

---

## `src/components/` – UI components

Shared React components grouped by feature.

### `src/components/auth/`

Auth-related UI used on sign-in/sign-up flows:

- **`AuthButtons.tsx`**: High-level auth button group (e.g. “Continue with Email”, “Continue with Provider”). Encapsulates auth triggers.
- **`AuthError.tsx`**: Displays authentication-related error messages in a consistent style.
- **`EmailLoginForm.tsx`**: Form component for logging in with email/password or magic link.
- **`EmailSignupForm.tsx`**: Form component for user registration via email, likely tied into Supabase auth.

### `src/components/dashboard/`

Dashboard UI for authenticated users:

- **`index.ts`**: Barrel file re-exporting dashboard components for simpler imports.
- **`CalendarView.tsx`**: Visual calendar representation of tasks/schedule.
- **`ChatSidebar.tsx`**: Interactive chat sidebar using `useChat` from `@ai-sdk/react`. Posts to `/api/chat/project` for live conversation with Harvey. **Project pill** (purple, below header): shows project title; click opens **ProjectDropdownMenu** (Project Details, User Settings, placeholders for Archive/Switch Project). Merges message sources (initial/useChat, dashboard-appended after Complete/Skip or check-in, widget-appended feedback, and optional `streamingCheckIn` for live check-in text); every message has a consistent `createdAt` (ISO string) and the merged list is sorted by `createdAt` ascending so the newest message is always at the bottom. Supports `messageType: 'check-in'` for styling (e.g. `data-message-type="check-in"`). Shows streaming messages, typing indicator, tool call indicators. Auto-scrolls to bottom when messages or appended lists or streaming check-in change. Calls `onTasksChanged` in `onFinish` when any assistant message contains a tool invocation (AI SDK v6: `part.type.startsWith('tool-')` or `dynamic-tool`), triggering dashboard task refetch so timeline/calendar show updates immediately without manual reload.
- **`ProjectDropdownMenu.tsx`**: Dropdown menu below the project pill in the chat sidebar. Options: Project Details (link to `/dashboard/project/[projectId]`), User Settings (link to `/dashboard/settings`), and disabled placeholders for Archive Project / Switch Project. Closes on outside click or item click.
- **`EditableField.tsx`**: Reusable inline-editable field. Types: text, textarea, date, select, tags, number. Display mode by default with placeholder when empty; click to edit; pencil icon on hover; optional maxLength, options (select), min/max/step (number), maxTags (tags). Used by Project Details form.
- **`ProjectDetailsForm.tsx`**: Client form for the Project Details page. Two cards (Project Info: description, goals, target deadline, project type; Your Context: skill level, tools & stack, weekly hours, motivation). Editable title at top; status badge; Back to Dashboard and User Settings links; Save Changes when dirty; PATCH to `/api/projects/[projectId]`; toast and unsaved-changes guard (beforeunload + confirm on navigation).
- **`chat/CompletionFeedbackWidget.tsx`**: Inline widget shown after “how long did it take?” when the user completes a task. User picks duration (less/same/more, optional minutes). On submit: single PATCH with `?returnProgressToday=true` (response includes progressToday, avoiding a separate GET; fallback to GET `/api/progress/today` if absent). The acknowledgment message compares the **completed task’s scheduled date** to **today** (in the user’s timezone from the progress response): if same day → “That’s X/Y tasks done today”; if overdue → “You’re catching up — good job finishing that one”; if future → “You’re ahead of schedule — nice work.” In all cases the message ends with “Next up: [task]” (today or nearest upcoming pending) or “You’re all clear for now.”
- **`TaskCategoryBadge.tsx`**: Styled badge indicating task label (Coding, Research, Design, Marketing, Communication, Personal, Planning).
- **`TaskChecklistItem.tsx`**: UI for a single checklist item within a task (checkbox, label, status).
- **`TaskDetails.tsx`**: Detailed view of a selected task (description, status, success criteria, etc.).
- **`TaskModal.tsx`**: Modal dialog for creating or editing a task.
- **`TaskStatusBadge.tsx`**: Badge displaying a task’s current status (e.g. Todo, In Progress, Done).
- **`TaskTile.tsx`**: Compact card/tile representation of a task, used in lists or board views.
- **`TimelineView.tsx`**: Timeline visualization of tasks and schedule over time. Sections (top to bottom): Past (collapsible, completed tasks from previous days), Overdue, Today, Tomorrow, week days, Next Week, Later, Unscheduled. Past is hidden by default with a “Show past tasks (N)” toggle; grouping uses the user’s timezone (see `task-service`). Expanded task detail uses the same task object from the list (no extra fetch on click).
- **`ViewToggle.tsx`**: Control for toggling between different dashboard views (e.g. Calendar vs Timeline).

### `src/components/settings/`

Settings page sections (Feature B):

- **`WorkScheduleSection.tsx`**: Work days (Mon–Sun), work start/end time, optional commute (morning/evening duration + start). Reads/writes User only.
- **`AvailabilitySection.tsx`**: Week-view grid (work grey, commute lighter, availability blocks colored by type), list of blocks with add/edit/delete, total hours per week, empty state. Reads/writes Project.contextData.available_time; displays User work/commute for grid.
- **`PreferencesSection.tsx`**: Energy pattern, rest days, preferred session length (presets + custom), communication style. User and Project preferences.

### `src/components/onboarding/`

Components used on the onboarding/chat-style experience:

- **`index.ts`**: Barrel file re-exporting onboarding components.
- **`ChatAvatar.tsx`**: Avatar component representing the AI assistant or user in chat messages.
- **`ChatInput.tsx`**: Input area for sending messages or onboarding responses.
- **`ChatMessage.tsx`**: Render of a single chat message bubble (user or AI). Supports streaming: shows content progressively or loading dots.
- **`OnboardingCTA.tsx`**: Call-to-action component used during onboarding (buttons, prompts).
- **`OnboardingHeader.tsx`**: Header section for onboarding pages (title, subtitle, progress).
- **`OnboardingProgress.tsx`**: Visual indicator of user’s progress through onboarding steps.
- **`ProjectShadowPanel.tsx`**: **Feature D (Shadow Panel)**. Live-updating panel showing extracted user/project fields (Project Info, Your Schedule, Preferences). Used on the onboarding page (60% width); receives `shadowFields`, `isLoading`, and `progress` (0–100). **Step 6**: Header shows “Completion {progress}%” and a progress bar; “Build My Schedule” button is rendered below the panel by the parent.

---

## `src/lib/` – Domain logic and services

This directory holds non-UI logic: integrations, services, scheduling, and utilities.

### `src/lib/ai/`

- **`claude-client.ts`**: Helpers for Claude (`isIntakeComplete`, `cleanResponse`, `formatMessagesForClaude`). Non-streaming chat uses `getChatCompletion`; streaming chat uses Vercel AI SDK (`@ai-sdk/anthropic`) in the API route.
- **`prompts.ts`**: All prompt templates and system instructions for AI interactions (e.g. how Harvey should respond, task breakdown prompts, schedule generation prompts).
- **`project-extraction.ts`**: Extracts `project_title` and `project_description` from onboarding conversation via Claude. Used in chat route `onFinish` during onboarding to populate Project model early; mirrors the constraint extraction pattern.

### `src/lib/auth/`

- **`auth-service.ts`**: High-level authentication service functions (sign-in, sign-out, session retrieval). Bridges UI and Supabase/Supabase SSR.
- **`supabase-server.ts`**: Server-side helpers for using Supabase with Next.js (e.g. getting a Supabase client on the server, reading cookies).
- **`supabase.ts`**: Client-side Supabase initialization (browser usage).

### `src/lib/db/`

- **`prisma.ts`**: Prisma client initialization. Exports a singleton Prisma client used across the app for database operations.
- **`test-connection.ts`**: Small utility to test the database connection (e.g. health checks, debugging local DB connectivity).

### `src/lib/discussions/`

- **`discussion-service.ts`**: Service layer for discussion entities (create/fetch discussions, append messages, link them to projects). Used by the `/api/discussions/[projectId]` route and possibly UI.

### `src/lib/projects/`

- **`project-service.ts`**: Service layer for project entities (create, update, fetch projects). Provides a clean interface over Prisma models.

### `src/lib/schedule/`

- **`schedule-generation.ts`**: Core logic for generating a schedule based on tasks, timelines, and AI suggestions. Each generated task includes **2–4 success criteria** (prompt and parser output multi-line SUCCESS section; `convertSuccessCriteriaToJson` turns it into the JSON checklist format). **Constraint extraction** (`extractConstraints`): single Claude call returns scheduling fields (schedule_duration_weeks, available_time, preferences, exclusions), **User life constraints** (work_schedule, commute), and enrichment (target_deadline, skill_level, etc.). The generate-schedule route writes **User** (workSchedule, commute, preferred_session_length, communication_style, userNotes) and **Project.contextData** (available_time, preferences, schedule_duration_weeks, exclusions, one_off_blocks only — **no blocked_time**). See "Constraints data: User vs Project" below.
- **`task-scheduler.ts`**: Pure scheduling algorithms. **assignTasksToSchedule** builds availability from `available_time` and optionally subtracts **User** work/commute (`userBlocked`). **getEffectiveAvailableTimeBlocks** returns available_time minus User work/commute for tools (regenerate_schedule, add_task, smart-reschedule). Orders tasks by dependency (topological sort) then priority.

**Constraints data: User vs Project**

- **User** (life constraints, shared across all projects): `workSchedule` (workDays; either legacy startTime/endTime or `blocks`: array of { startTime, endTime } for multiple blocks per day), `commute` (morning/evening duration + startTime), `timezone`, `preferred_session_length`, `communication_style`. Work and commute are facts about the user's life and do not change per project.
- **Project.contextData** (project-specific allocations): `available_time` (when the user allocates time to *this* project; optional `type`: 'work' | 'personal'), `preferences` (e.g. energy_peak, rest_days), `schedule_duration_weeks`, `exclusions`, `one_off_blocks`. **Blocked time is not stored in contextData** — it is derived on-the-fly from User.workSchedule and User.commute when building the availability map (task-scheduler, regenerate_schedule, add_task, smart-reschedule).

### `src/lib/tasks/`

- **`task-service.ts`**: Service layer for task entities (CRUD operations, checklist operations, status transitions). **Task grouping** (`groupTasksByDate(tasks, userTimezone)`) uses the user’s timezone for “today” so that Past (completed tasks from previous days), Overdue (past-date, not completed), and Today (scheduledDate = today in user TZ) are correct. When a task is set to **skipped**, all tasks that depend on it (via `depends_on`) are cascade-skipped. **getTodayProgress(userId)** returns today’s completed/skipped/pending counts, **userTimezone**, and **nextTask** (first pending today, or if none, the nearest upcoming pending task by date). Used by `/api/progress/today` and the completion feedback widget. Used heavily by task-related API routes and dashboard UI.

### `src/lib/chat/`

- **`assembleContext.ts`**: Builds the dynamic system prompt for post-onboarding chat. Queries DB for project, user, and tasks, computes stats (including "today's tasks" in the user's timezone), then limits the schedule section to **today + next 7 days** (plus unscheduled) and uses a **compact task line format** to reduce tokens. Includes a **Project Context** section (type, phase, deadline, skill level, stack, weekly commitment, motivation — omit nulls), **What Harvey knows about this project** (projectNotes as bullets), and **What Harvey knows about this person** (userNotes as bullets). Generates a detailed system prompt with Harvey's personality, constraints, schedule, stats, and tool usage instructions. Uses `src/lib/timezone.ts` for date-in-timezone helpers. Rebuilt for every message.
- **`generateSuccessCriteria.ts`**: Generates 2–4 success criteria for a task using Claude (Sonnet) from title and optional description. Returns JSON array `{ id, text, done }[]` for `Task.successCriteria`. Used by `add_task` so chat-added tasks get the same checklist quality as onboarding tasks.
- **`types.ts`**: Shared TypeScript types for the chat system (ContextData, TaskStats, tool result types).
- **`README.md`**: Documentation for the chat router system, including how to add new tools.
- **`tools/modifySchedule.ts`**: Move/resize tasks with conflict detection and dependency validation.
- **`tools/updateConstraints.ts`**: Modify user availability (permanent recurring or one-off date-specific blocks).
- **`tools/addTask.ts`**: Create new tasks with automatic slot-finding and **2–4 AI-generated success criteria** (via `generateSuccessCriteria`) so criteria appear in the task detail view.
- **`tools/suggestNextAction.ts`**: Returns structured data about current/next/overdue tasks for Claude to reason about.
- **`tools/getProgressSummary.ts`**: Simple completion statistics by period (today, this_week, all).
- **`tools/regenerateSchedule.ts`**: Greedy reschedule of pending/skipped tasks (remaining) or full rebuild via Claude (full_rebuild). **Dependencies**: Remaining scope sorts tasks by `depends_on` (topological order) so dependents are never scheduled before their dependencies; full rebuild uses `assignTasksToSchedule`, which already respects dependencies. Returns a concise `message` and optional `change_summary` (moved count, completion date before/after) so Harvey can give a clear 2–3 sentence recap. Logs to console during regeneration (which tasks moved, old → new dates, completion date) for debugging.
- **`tools/updateProjectNotes.ts`**: Timestamped notes Harvey stores about user preferences and patterns.

### `src/lib/users/`

- **`user-actions.ts`**: Higher-level user actions (e.g. onboarding completion, preference updates) that may span multiple services or tables.
- **`user-service.ts`**: Direct user entity operations (create, fetch by ID/email, update).

### `src/lib/utils.ts` – General utilities

- **`utils.ts`**: Grab-bag of shared helper functions (formatting, date utilities, type guards, etc.) used across different parts of the app.

### `src/lib/checkin/` – Daily check-in context

- **`checkin-context.ts`**: Assembles context for the daily check-in message: time of day (morning/afternoon/evening in user timezone), today’s pending/in-progress tasks with titles and times, yesterday’s completion summary (completed/skipped/total), current streak (consecutive days with at least one completion), and recently skipped tasks (last 2 days). Used by `POST /api/chat/checkin`.

### `src/lib/timezone.ts` – Timezone helpers

- **`timezone.ts`**: Utilities for user-timezone-aware date/time handling. Database stores UTC; this module provides `getDateStringInTimezone` (YYYY-MM-DD in a given IANA timezone), `formatDateLongInTimezone` (long date for prompts), `getHourDecimalInTimezone`, `formatTimeInTimezone`, and `localTimeInTimezoneToUTC` for saving. Used by chat context assembly, chat tools, and check-in context so "today", overdue, and schedule dates are correct for the user's timezone.

---

## `src/prisma/` – Prisma schema and migrations

> Note: There is also a generated Prisma client under `src/node_modules/.prisma/`. That generated code should not be modified directly.

- **`schema.prisma`**: Source of truth for the database schema (models such as User, Project, Task, Schedule, Discussion, etc.). Changes here are applied to the DB via migrations. The **User** model includes `timezone`, **life constraints** (`workSchedule` Json: workDays, startTime, endTime; `commute` Json: morning/evening duration + startTime), `availabilityWindows` Json (legacy/optional), and enrichment: `preferred_session_length`, `communication_style`, `userNotes Json?`. The **Project** model includes `contextData Json?` (project allocations only: schedule_duration_weeks, **available_time**, preferences, exclusions, one_off_blocks — **blocked_time is not stored**; scheduling derives it from User), enrichment fields (`target_deadline`, `skill_level`, etc.), `projectNotes Json?`, and `generationCount Int`. The **Task** model includes `depends_on String[]` and `batchNumber Int`. The **Discussion** model includes `type String` ("project" | "onboarding" | "task") and `taskId String?`.

- **`migrations/`**: Auto-generated migration history:
  - **`20260211120000_add_project_user_enrichment_fields/`**
    - **`migration.sql`**: Adds User enrichment (`preferred_session_length`, `communication_style`, `userNotes`), Project enrichment (`target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`, `phases`); converts `projectNotes` from TEXT to JSONB (existing string → single-entry array).
  - **`20260203144248_change_success_criteria_to_json/`**
    - **`migration.sql`**: SQL statements for changing a `success_criteria` field to a JSON type (or similar).
  - **`20260203144607_change_success_criteria_to_json/`**
    - **`migration.sql`**: Follow-up migration adjusting or fixing the same field.
  - **`migration_lock.toml`**: Lockfile used by Prisma Migrate to coordinate applied migrations.

Migrations are applied via Prisma CLI commands (see `package.json` scripts or your own workflow).

---

## `src/types/` – Shared TypeScript types

Type definitions for different aspects of the app:

- **`api.types.ts`**: Types for API request/response shapes (e.g. payloads for `/api/chat`, `/api/tasks`, `/api/schedule`).
- **`auth.types.ts`**: Types for authentication flows (session, user, tokens, auth state).
- **`chat.types.ts`**: Types used in chat flows (message roles, content structures, conversation metadata).
- **`task.types.ts`**: Types describing tasks, checklists, task statuses, categories, and scheduling metadata.
- **`user.types.ts`**: Types for user entities, profiles, onboarding state, and preferences.

These types should be reused across UI, services, and API routes to keep the app type-safe and consistent.

---

## `src/node_modules/.prisma/` – Generated Prisma client

This directory is generated by Prisma and contains:

- **`client.*` files**: JavaScript and TypeScript entrypoints for the Prisma client.
- **`default.*`, `edge.*`, `runtime/`**: Different runtime targets and bundling variants.
- **`schema.prisma`**: A copy of the schema used internally by the generated client.
- **`*.wasm` and related loaders**: Compiled WebAssembly modules that speed up query compilation.

**Do not edit files in this directory manually.** They are regenerated via Prisma CLI (`prisma generate`) and should be treated as build artifacts.

---

## How to keep this document up to date

When you:

- Add a new **route/page** → Update the relevant section under `src/app/`.
- Add a new **component** → Add a short entry under the appropriate feature directory in `src/components/`.
- Introduce or change a **service or lib module** → Update `src/lib/` sections to describe its responsibilities.
- Modify the **database schema** → Document new/changed models under `src/prisma/` and reference how they are used in services.

Treat this file as a **living map** of the codebase. Keeping it accurate will significantly improve onboarding, debugging, and collaboration for both humans and AI agents.
