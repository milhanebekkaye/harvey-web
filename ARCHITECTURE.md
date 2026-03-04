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
- **`src/prisma/`**: Prisma schema and migrations (see `schema.prisma`). Core models: User, Project, Discussion, Task. **API cost tracking**: User has optional `subscription_start_date`; `ApiUsageLog` stores per-call token/cost; `UserUsageSummary` stores per-user, per–billing-period aggregates (unique on userId + periodStart). See `docs/cost-audit.md`.
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
- **`onboarding/welcome/page.tsx`**: `/onboarding/welcome` route. Uses **AuthPageLayout** + **WelcomeNameCard** (penguin avatar). Shown right after auth for new users who have no name set. Collects first name via PATCH `/api/user/name`, then redirects to `/onboarding/intro`.
- **`onboarding/intro/page.tsx`**: `/onboarding/intro` route. Screen 2: **multi-slide** client component (3 slides). Same full-page rainbow gradient. One slide visible; horizontal transition (current exits left, next from right). Top: Harvey logo (auth-style), 24px padding. **Slide 0**: Generic layout (text card + image card, problem + illustration). **Slide 1 (HARVEY'S ANSWER)**: Side-by-side — left 45% glass text card, right 45% glass image card with screenshot-chat.png. **Slide 2 (THE DETAILS)**: Full-bleed — screenshot-timeline.png absolute right (68%), text absolute top-left (28% width, no card), penguin (penguin-scarf.png) bottom-left; no mockup frame. Bottom: progress dots + CTA “Next →” / “I'm ready →”; slide 2 CTA redirects to `/onboarding/questions`. User name from Supabase session for slide 0 headline.
- **`onboarding/questions/page.tsx`**: `/onboarding/questions` route. Screen 3: four questions (reason, current work, work style, biggest challenge). Same aurora/glass layout; 80×80 avatar, 4 progress dots, one question at a time with slide animation. On completion, PATCH `/api/user/onboarding` then redirect to `/onboarding`.
- **`onboarding/page.tsx`**: `/onboarding` route. **Reload persistence (Batch 4)**: On mount, calls `GET /api/onboarding/restore` (optional `?projectId=` from URL). If restore returns `completed`, redirects to `/dashboard`. If restore returns `projectId` + messages, renders chat with those messages and runs extraction to fill the shadow panel; otherwise renders with Harvey’s greeting. Prevents duplicate projects on refresh. Split layout: 40% chat (left), 60% Shadow Panel (right). No top-of-page progress bar; the only progress indicator is the completion bar inside **ProjectShadowPanel**. After each Harvey response, triggers extraction via `POST /api/onboarding/extract` with `previousConfidence` (current `harveyConfidence`); stores result in `shadowFields` and `missingBlockingFields`. Raw `harveyConfidence` drives button logic; **maxHarveyConfidence** (floor: never decreases) is passed to the panel and modal for display. Chat request body includes `currentConfidence: harveyConfidence` so Harvey only gives the recap when score ≥ 80. **Build My Schedule button**: disabled when field completeness &lt; 40% or any blocking field is missing (`missingBlockingFields`); Stage 1 when can build but confidence &lt; 80% and no completion marker; Stage 2 when can build and (confidence ≥ 80% or completion marker). **Batch 5**: Progress shows Harvey's confidence (`completion_confidence`). Button “Build My Schedule” button (disabled / Stage 1 with confirmation modal / Stage 2 direct to schedule). Button lives at bottom of right column; confirmation modal “Build now or keep chatting?” for Stage 1. Extraction is non-blocking; errors are logged only.
- **`signin/page.tsx`**: `/signin` route. Uses **AuthPageLayout** + **SigninCard** (small Harvey logo); handles email-based sign-in and integration with Supabase auth.
- **`dashboard/page.tsx`**: `/dashboard` route. Main authenticated user experience; shows tasks, timeline, calendar, and chat sidebar using dashboard components.
- **`dashboard/settings/page.tsx`**: `/dashboard/settings` route. Full-page Settings: work schedule, availability windows, preferences, and Project link. Data from GET `/api/settings`; save via POST `/api/settings/update`. **StickyUnsavedBar** at bottom when dirty (Save / Discard); `savedSnapshot` tracks last persisted state for hasChanges. See `docs/settings.md`. Complete/Skip use optimistic UI (timeline and chat message update immediately; PATCH runs in background; revert on failure). **Daily check-in**: on load, when the user has an active project and existing tasks, triggers a contextual check-in message (rate-limited to every 3 hours or new calendar day via localStorage); the message streams at the bottom of the chat and is persisted with `messageType: 'check-in'`.
- **`dashboard/project/[projectId]/page.tsx`**: `/dashboard/project/[projectId]` route. **Project Details page** (Feature C): view and edit project-level context (description, goals, deadline, project type, skill level, tools & stack, weekly hours, motivation). Server component fetches project via `getProjectById`; client form persists via PATCH `/api/projects/[projectId]`. See `docs/project-details-feature.md`.
- **`dashboard/project/[projectId]/loading.tsx`**: Loading state shown while the project details page is loading.

Auth callback:

- **`auth/callback/route.ts`**: Server route handling authentication callbacks (OAuth and magic-link redirects). Exchanges code for session, creates DB user if missing, then chooses redirect: if an explicit `next` query param is present, redirects there; otherwise if the user has **any project** (`prisma.project.count` for that user > 0), redirects to `/dashboard`; else if the user has **no name** (null or empty in DB), redirects to `/onboarding/welcome`; else if the user has **name but no onboarding_reason**, redirects to `/onboarding/questions`; else redirects to `/onboarding`.

### API routes – `src/app/api/`

These are server-side route handlers (Next.js Route Handlers). Each `route.ts` implements HTTP methods (`GET`, `POST`, etc.) for a particular resource.

- **`auth/check-email/route.ts`**
  - Endpoint under `POST /api/auth/check-email`.
  - Body: `{ email: string }`. Returns `{ exists: true }` or `{ exists: false }` based on whether the email exists in the app’s `users` table (via `getUserByEmail`). Does not require authentication; used by the magic-link login form to avoid sending links to non-users. No user data is exposed.

- **`user/name/route.ts`**
  - Endpoint under `PATCH /api/user/name`. Auth required. Body: `{ name: string }`. Updates the current user’s `name` in the `users` table via `updateUser`. Used by `/onboarding/welcome` after new users set their first name.

- **`user/onboarding/route.ts`**
  - Endpoint under `PATCH /api/user/onboarding`. Auth required. Body: `{ onboarding_reason?, current_work?, work_style?, biggest_challenge? }`. Updates the current user’s onboarding-question fields via `updateUser`. Used by `/onboarding/questions` on completion.

- **`chat/route.ts`**
  - Endpoint under `/api/chat`.
  - Streaming chat: uses Vercel AI SDK (`streamText`, `createUIMessageStream`, `createUIMessageStreamResponse`) with `@ai-sdk/anthropic`.
  - Accepts `messages`, `projectId`, `context` (onboarding | project-chat | task-chat).
  - **Onboarding prompt**: When `context === 'onboarding'`, the system prompt is built by `ONBOARDING_SYSTEM_PROMPT(todayFormatted, knownInfo, missingFieldsGuidance, currentConfidence, todayISO?, tomorrowISO?)`. Request body may include `currentConfidence` (0–100, default 0); prompt injects a "CURRENT COMPLETION SCORE" block: if score &lt; 80 Harvey must not give the recap; if ≥ 80 he may. **Date**: `todayFormatted` and optional `todayISO`/`tomorrowISO` (user TZ) for **CRITICAL DATE COLLECTION RULES** (Harvey must call `show_date_picker` in the same response as the deadline/start-date question; see `prompts.ts`). **Onboarding tools**: When `context === 'onboarding'`, a single tool `show_date_picker` (field: deadline | start_date, label, min_date) is registered; the client detects tool invocations across the last 5 assistant messages and multiple AI SDK part types (`tool-invocation`, `tool_use`, `tool-show_date_picker`, etc.) and shows the date picker; if Harvey asks for a date in text but does not call the tool, a **text fallback** (regex on last assistant message) still shows the widget. **Debug logging**: When onboarding, the route logs tools passed to `streamText`, todayISO/tomorrowISO, and prompt presence of DATE COLLECTION RULES / show_date_picker; `onFinish` logs response message parts and whether any part is a tool call. **Known info**: `generateKnownInfoSummary(project, user)` when `projectId` is present; first message uses "Starting fresh". **Missing fields**: When `projectId` exists, `computeMissingFields` and `buildMissingFieldsGuidance` inject dynamic guidance so Harvey asks for blocking/enriching fields naturally.
  - Saves messages to Discussion on stream finish. Project title/description and other fields are extracted by the client-triggered `POST /api/onboarding/extract` after each message. See `docs/streaming-chat/README.md` and `docs/onboarding/README.md`.
  - **Date convention**: Date-only values (deadline, schedule start) are stored at noon UTC to avoid off-by-one display in timezones ahead of UTC; see `src/lib/utils/date-utils.ts` (`toNoonUTC`, `formatDateForDisplay`).

- **`onboarding/extract/route.ts`**
  - Endpoint under `/api/onboarding/extract`.
  - **Feature D (Shadow Panel) Step 2 + 3, Batch 5**: Extraction + persistence. POST body: `{ projectId, previousConfidence?: number }`. Authenticates user, verifies project ownership, loads onboarding discussion, builds conversation text. **Step 2 (delta extraction)**: The route builds `lastMessages = messages.slice(-3)`, `conversationTextDelta`, and `currentExtractedState` from DB; the Claude call sends only the extraction prompt (with `{{CURRENT_EXTRACTED_STATE}}` filled) plus `conversationTextDelta` (last 3 messages), not the full conversation. **Confidence**: Haiku is hard-capped at 75 (prompt: “0–75 ONLY. Never return 80 or above.”). Response clamped to 0–75, then per-turn cap `min(75, previousConfidence + 15)`. The 80+ range is reserved for Harvey’s recap in chat (detected by phrase match in `onFinish`); only that path sets “Harvey is ready!”. Parses/validates JSON; merge logic: only non-null extracted fields written. **After save**: `computeMissingFields`; returns `missingBlockingFields`, `missingEnrichingFields`, `completion_confidence`. Response: `{ success: true, extracted, saved, completion_confidence, missingBlockingFields, missingEnrichingFields }`. See `docs/onboarding/README.md`.

- **`onboarding/restore/route.ts`**
  - Endpoint under `GET /api/onboarding/restore`. **Feature D Batch 4 (reload persistence)**. Optional query `projectId`. Auth required. If `projectId` given: load that project’s onboarding discussion (ownership verified). If not: find user’s active projects (status=active, createdAt desc), first with an onboarding discussion. Returns `{ restore: true, projectId, messages, completed? }` or `{ restore: false }`. If any assistant message contains completion marker, sets `completed: true` for client redirect. Used on onboarding page mount to restore conversation after refresh.
- **`onboarding/update-field/route.ts`**
  - Endpoint under `/api/onboarding/update-field`.
  - **Feature D (Shadow Panel) Step 7**: Inline field updates. PATCH body: `{ projectId, scope: 'user' | 'project', field, value }`. Authenticates via Supabase, validates project ownership with `getProjectById(projectId, user.id)`, updates a single field via `updateUser` or `updateProject`. For `target_deadline` and `schedule_start_date`, date-only strings (YYYY-MM-DD) are converted with `toNoonUTC`; full ISO strings with `new Date(value)`. Used by the Shadow Panel Edit/Save flow.

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

- **`chat/task/route.ts`**
  - Endpoint under `POST /api/chat/task`. **Per-task chat (Step 4)**: streaming endpoint for task-specific Harvey. Body: `{ messages: UIMessage[], taskId: string, projectId?: string }`. Resolves projectId from task if omitted; verifies ownership. Loads task discussion via `getTaskDiscussion` (404 if none). Uses **buildTaskChatContext(taskId, userId)** for system prompt (five layers: project, current task, dependencies, schedule, behavioral patterns). Last 20 messages as history. Streams with **Claude Sonnet** (`claude-sonnet-4-20250514`), no tools. Persists user message before stream and assistant message in onFinish. See **Context builders** below and `docs/per-task-chat/README.md`.

- **`discussions/[projectId]/route.ts`**
  - Endpoint under `/api/discussions/[projectId]`.
  - Manages AI or human discussions tied to a specific project (identified by `projectId`).
  - Returns stored message metadata used by sidebar rendering, including optional widget payloads and `answered` for feedback widgets.
  - Likely uses `src/lib/discussions/discussion-service.ts` and `src/lib/projects/project-service.ts`.

- **`discussions/[projectId]/messages/route.ts`**
  - Endpoint under `POST /api/discussions/[projectId]/messages`.
  - Appends one message to the project discussion and supports optional `widgetAnswer` metadata (`{ widgetType, taskId }`).
  - When `widgetAnswer` is provided, it marks the matching feedback widget message (`completion_feedback` or `skip_feedback`) as `answered: true` in the same discussion JSON write as the appended message.

- **`discussions/task/route.ts`**
  - **Per-task chat (Step 2 + 3)**. `POST /api/discussions/task`: body `{ taskId, projectId }` — create or return existing task discussion. On first creation, triggers a **one-time Haiku call** (`generateTaskOpeningMessage` in `src/lib/discussions/generate-task-opening-message.ts`) to generate a task-specific opening message; **TaskContext** includes task title, description, estimated duration, label, dependencies (title + status), unlocks count, project title/goals. Message stored in DB; subsequent opens load from DB with no extra API call. On API or task fetch failure, a fallback opening message is used and discussion is still created. `GET /api/discussions/task?taskId=` — fetch task discussion by taskId; returns `{ discussion }` or `{ discussion: null }`. Auth and project ownership required.

- **`discussions/task/messages/route.ts`**
  - **Per-task chat (Step 2)**. `POST /api/discussions/task/messages`: body `{ discussionId, content }` — append user message to task discussion. TaskChatView uses `POST /api/chat/task` for sending (which persists user + assistant); this endpoint remains for other clients or legacy use.

- **`discussions/task/list/route.ts`**
  - **Per-task chat (Step 2)**. `GET /api/discussions/task/list?projectId=` — returns all task-type discussions for the project (with task title/label). Used on dashboard load to repopulate open task chats after refresh. Skips discussions whose task was deleted.

- **`schedule/generate-schedule/route.ts`**
  - Endpoint under `/api/schedule/generate-schedule`.
  - Loads Project and User from DB, then builds constraints via **buildConstraintsFromProjectAndUser** (no re-extraction); conversation text is used only as context for task generation, so the Project Shadow panel is not overwritten when the user clicks "Build my schedule".
  - Calls **assignTasksWithClaude** from `src/lib/schedule/task-scheduler.ts` for slot assignment: Claude Haiku proposes assignments, local validation enforces hard constraints, one retry is attempted on violations, then deterministic `assignTasksToSchedule` is used as fallback. After slot assignment, the API runs **enforceSchedulingConstraints** from `src/lib/schedule/assignment-post-processor.ts` to enforce split-part consecutiveness and dependency ordering (by reordering slot data) before writing tasks.
  - **Position assignment**: After enforcement, tasks are grouped by `scheduledDate` (date string); within each day the array is already ordered by date → startTime. Each task is assigned a 1-based **position** for that day and persisted so list/timeline sort is deterministic (`scheduledDate` → `position` → `priority`).
  - **Flexible task window storage**: For flexible tasks, **window_start** and **window_end** are set from **scheduledTask.windowStart** and **scheduledTask.windowEnd** (the availability window boundaries from the scheduler, e.g. "09:00", "17:00"), not from the computed slot start/end times. DB write and dependency resolution are unchanged. Logs SchedulerOptions and task records for debugging.

- **`schedule/reset-schedule/route.ts`**
  - Endpoint under `/api/schedule/reset-schedule`.
  - Resets or clears an existing schedule (e.g. when user wants to restart planning).

- **`tasks/route.ts`**
  - Endpoint under `/api/tasks`.
  - **GET**: Authenticates user, resolves active project via `getGroupedTasks`, returns `tasks`, `projectId`, `projectTitle`, and **availableTime** (from `project.contextData.available_time`) for list-view drag reorder window lookup. Returns 401 when unauthenticated; dashboard redirects to `/signin` on 401 and to `/onboarding` on NO_PROJECT (404).
  - Uses `src/lib/tasks/task-service.ts` for domain logic.

- **`tasks/tip/route.ts`**
  - Endpoint under `POST /api/tasks/tip`.
  - Timeline View Step 4 route for Harvey tip generation. Body: `{ taskId }`.
  - Authenticates with Supabase, validates that the task belongs to a project owned by the current user, then checks cached `Task.harveyTip` first.
  - If no cached tip exists: loads task + project context (`title`, `goals`), fetches dependency statuses (`depends_on`), calls Claude Haiku (`claude-haiku-4-5-20251001`, max tokens 100), and persists the result to `Task.harveyTip`.
  - Tip generation is timeline-triggered (on active card load/refresh), not task-generation-triggered.
  - Never returns 500; always responds `200` with `{ tip }`, using fallback tip text on any error.

- **`timeline/route.ts`**
  - Endpoint under `/api/timeline`.
  - GET route for Timeline View. Resolves project (query `projectId` or active project), validates ownership, then returns:
    - `lastCompletedTask`
    - `activeTask` (oldest pending/skipped by scheduled date)
    - `upcomingTasks` (next two pending from now, timezone-aware)
    - `dependencies` and `dependentTasks` for the active task card.
  - Uses `src/lib/timeline/get-timeline-data.ts`.

- **`settings/route.ts`**
  - GET `/api/settings`. Returns current user (workSchedule, commute, preferred_session_length, communication_style, timezone) and active project (id, contextData.available_time, contextData.preferences) for the Settings page.
- **`settings/update/route.ts`**
  - POST `/api/settings/update`. Persists Settings form: User (workSchedule, commute, preferred_session_length, communication_style) and Project.contextData (available_time, preferences). No blocked_time. Validates times; overlapping availability blocks are allowed (scheduler normalizes them per day).

- **`projects/[projectId]/route.ts`**
  - GET `/api/projects/[projectId]`. Returns the project for the authenticated user (ownership checked). Used by Project Details page and for refetch after save.
  - PATCH `/api/projects/[projectId]`. Partial update of project (title, description, goals, status, target_deadline, skill_level, tools_and_stack, project_type, weekly_hours_commitment, task_preference, motivation). Validates types and ranges (e.g. weekly_hours 1–168, status active/paused/completed). `project_type` accepts any string or null (no fixed enum). Uses `project-service.getProjectById` and `project-service.updateProject`.

- **`tasks/[taskId]/route.ts`**
  - Endpoint under `/api/tasks/[taskId]`.
  - Handles single-task operations (fetch, update, delete) based on `taskId`. PATCH supports task field updates (including `status` and `successCriteria` checklist JSON), returns the updated task, and optionally **progressToday** (same shape as GET `/api/progress/today`) when `?returnProgressToday=true`, so the completion feedback widget can avoid a separate GET.

- **`tasks/[taskId]/checklist/route.ts`**
  - Endpoint under `/api/tasks/[taskId]/checklist`.
  - Manages per-task checklist items (e.g. marking subtasks complete/incomplete).
  - Works together with the `TaskChecklistItem` UI component and `task-service`.

- **`tasks/reorder/route.ts`**
  - Endpoint under `POST /api/tasks/reorder`.
  - **List view drag-and-drop**: Updates a task’s position and optionally date/window after reorder. Body: `taskId`, `newDate` (YYYY-MM-DD), `isFlexible`, `windowStart`, `windowEnd`, `destinationSiblingsOrder` (task IDs for destination day in new order), `sourceSiblingsOrder` (task IDs for source day after removal; empty if same day). Authenticates user, updates the dragged task (position from index in destinationSiblingsOrder, scheduledDate, is_flexible, window_start/end; when flexible, scheduledStartTime/scheduledEndTime set to null), then bulk-updates positions (1-based) for all IDs in destinationSiblingsOrder and, if non-empty, sourceSiblingsOrder. Used by TimelineView when `onReorder` is provided.

- **`progress/today/route.ts`**
  - Endpoint under `/api/progress/today`.
  - Returns today’s task counts (completed, skipped, pending, total), **userTimezone** (from User model), and **nextTask** (first pending today or nearest upcoming pending task). Used by the completion feedback widget to build the Harvey acknowledgment message after the user answers “how long did it take?”.

---

## `src/components/` – UI components

Shared React components grouped by feature.

### `src/components/auth/`

Auth-related UI used on sign-in/sign-up flows:

- **`AuthPageLayout.tsx`**: Shared layout for auth-style pages: aurora gradient background, glass card container, decorative gradient blobs. Used by the signin page and by onboarding welcome (WelcomeNameCard). Optional `bottomSection` for content below the card (e.g. signin footer links).
- **`SigninCard.tsx`**: Card content for the **signin page only**: small Harvey logo (sparkle icon, size-12), brand name “Harvey”, header (title/subtitle), error display, and children slot for auth forms (AuthButtons, EmailSignupForm, EmailLoginForm). Footer with terms. Used inside AuthPageLayout on `/signin`.
- **`AuthButtons.tsx`**: High-level auth button group (e.g. “Continue with Email”, “Continue with Provider”). Encapsulates auth triggers.
- **`AuthError.tsx`**: Displays authentication-related error messages in a consistent style.
- **`EmailLoginForm.tsx`**: Form component for logging in with email/password or magic link.
- **`EmailSignupForm.tsx`**: Form component for user registration via email, likely tied into Supabase auth.

### `src/components/ui/`

Shared UI primitives used across features:

- **`MarkdownMessage.tsx`**: Shared markdown renderer (uses `react-markdown` + `remark-gfm`). Provides compact markdown styles (bold/italic, bullet + numbered lists, inline code, fenced code blocks with horizontal scroll, safe external links) using Harvey color accents. Used in onboarding, project chat, and per-task chat assistant bubbles (user bubbles remain plain text), and in **TaskDetails** for task description in timeline/list expanded card and calendar modal.
- **`StickyUnsavedBar.tsx`**: Sticky bar fixed at bottom (z-[60]) shown when a form has unsaved changes. Displays “You have unsaved changes” and Discard / Save Changes buttons. Used by Project Details form and Settings page; each page supplies `hasChanges`, `saving`, `onSave`, and `onDiscard`.

### `src/components/dashboard/`

Dashboard UI for authenticated users:

- **`index.ts`**: Barrel file re-exporting dashboard components for simpler imports.
- **`ChatSidebar.tsx`**: Shell for project and task conversations. Renders dynamic header (Harvey AI or task title + "Task Chat"), conversations toggle (opens **ConversationNavPanel**), optional dim overlay, and either **ProjectChatView** or **TaskChatView** based on `activeConversation` (dashboard state). All project chat logic (useChat, messages, rebuild) lives in ProjectChatView. See **Per-task chat** below and `docs/per-task-chat.md`.
- **`ConversationNavPanel.tsx`**: Overlay panel to switch conversations: Pinned "Project Chat", TASKS list (from `openTaskChats`), and static user row. No History section. Step 1: UI only; Step 2 will wire persistence.
- **`ProjectChatView.tsx`**: Project chat body: project pill + **ProjectDropdownMenu**, project context chip, rebuild button, check-in error, message list (useChat → `/api/chat/project`), and input. Merges message sources (initial/useChat, dashboard-appended, widget-appended, streaming check-in); supports `messageType: 'check-in'`; calls `onTasksChanged` when assistant message contains tool invocation. Assistant bubbles render with **MarkdownMessage**; user bubbles remain plain text. Feedback widgets are hidden when the stored message has `answered: true`. Rebuild modal lives here.
- **`TaskChatView.tsx`**: Per-task chat body: back link to project chat, task metadata, task discussion loading (`GET /api/discussions/task?taskId=`), streaming replies via `useChat` (`POST /api/chat/task`), in-memory cache, and input. Assistant bubbles render with **MarkdownMessage**; user bubbles remain plain text.
- **`ProjectDropdownMenu.tsx`**: Dropdown menu below the project pill in the chat sidebar. Options: Project Details (link to `/dashboard/project/[projectId]`), User Settings (link to `/dashboard/settings`), and disabled placeholders for Archive Project / Switch Project. Closes on outside click or item click.
- **`EditableField.tsx`**: Reusable inline-editable field. Types: text, textarea, date, select, tags, number. Display mode by default with placeholder when empty; click to edit; pencil icon on hover; optional maxLength, options (select), min/max/step (number), maxTags (tags). Used by Project Details form.
- **`ProjectDetailsForm.tsx`**: Client form for the Project Details page. Two cards (Project Info: description, goals, target deadline, project type; Your Context: skill level, tools & stack, weekly hours, motivation). Editable title at top; status badge; Back to Dashboard and User Settings links; **StickyUnsavedBar** at bottom when dirty (Save / Discard); PATCH to `/api/projects/[projectId]`; toast and unsaved-changes guard (beforeunload + confirm on navigation).
- **`chat/CompletionFeedbackWidget.tsx`**: Inline widget shown after “how long did it take?” when the user completes a task. User picks duration (less/same/more, optional minutes). On submit: single PATCH with `?returnProgressToday=true` (response includes progressToday, avoiding a separate GET; fallback to GET `/api/progress/today` if absent). The acknowledgment message compares the **completed task’s scheduled date** to **today** (in the user’s timezone from the progress response): if same day → “That’s X/Y tasks done today”; if overdue → “You’re catching up — good job finishing that one”; if future → “You’re ahead of schedule — nice work.” In all cases the message ends with “Next up: [task]” (today or nearest upcoming pending) or “You’re all clear for now.” The widget’s user-answer append call includes `widgetAnswer` metadata so the original widget message is marked answered in persistence.
- **`TaskCategoryBadge.tsx`**: Styled badge indicating task label (Coding, Research, Design, Marketing, Communication, Personal, Planning).
- **`TaskChecklistItem.tsx`**: UI for a single checklist item within a task (checkbox, label, status).
- **`TaskDetails.tsx`**: Detailed view of a selected task (description, status, success criteria, etc.). Task description is rendered with **MarkdownMessage** (markdown formatting) in timeline expanded card, list view expanded card, and calendar modal.
- **`TaskModal.tsx`**: Modal dialog for creating or editing a task.
- **`TaskStatusBadge.tsx`**: Badge displaying a task’s current status (e.g. Todo, In Progress, Done).
- **`TaskTile.tsx`**: Compact card/tile representation of a task, used in lists or board views. Supports `isActiveConversation` for per-task chat indicator (parent wrapper shows purple glow + chat badge when that task’s chat is open). Optional **dragHandleProps** and **isDragging** for list-view drag-and-drop: when provided, a GripVertical handle is shown on the left (default variant only); when `isDragging` the card uses reduced opacity.
- **`ProjectTimelineView.tsx`**: Thin dashboard wrapper around `src/components/timeline/TimelineView.tsx`; accepts `projectId` and action callbacks (`onComplete`, `onSkip`, `onAskHarvey`).
- **Per-task chat (Step 4)**: Dashboard state `isPanelOpen`, `activeConversation` ('project' | task id), `openTaskChats` (includes optional `discussionId`). "Ask Harvey" calls `POST /api/discussions/task` and stores discussionId. **TaskChatView** loads discussion via `GET /api/discussions/task?taskId=` and sends messages through streaming `POST /api/chat/task` (user + assistant persisted by API). On dashboard load, `GET /api/discussions/task/list` repopulates `openTaskChats` for refresh persistence. See `docs/per-task-chat/README.md`.
- **`TimelineView.tsx`**: Timeline visualization of tasks and schedule over time. Sections (top to bottom): Overdue, Today, Tomorrow, week days (rolling 7-day window), Later, Unscheduled, Past (collapsible at end). Past is hidden by default with a “Show past tasks (N)” toggle; grouping uses the user’s timezone (see `task-service`). Expanded task detail uses the same task object from the list (no extra fetch on click). **Drag-and-drop reordering**: When the dashboard passes `onReorder`, `availableWindows`, and `allTasks`, the list uses **@dnd-kit** (DndContext, SortableContext, useSortable, DragOverlay). Only the GripVertical handle starts a drag (PointerSensor `activationConstraint: { distance: 8 }`). Same-day reorder updates positions and converts fixed tasks to flexible with that day’s availability window; cross-day reorder sets the task’s scheduledDate and window to the destination day and recomputes positions for both days. **Dependency hard block**: Before applying a drop, the client checks that the dragged task’s dependencies remain before it and that tasks depending on it remain after it; on violation a toast is shown and the drop is cancelled. Reorder is persisted via `POST /api/tasks/reorder`; then the dashboard refetches tasks.
- **`ViewToggle.tsx`**: Control for toggling between dashboard views (List vs Timeline).

### `src/components/timeline/`

Dedicated Timeline View module (Step 4 complete):
See `docs/timeline-view.md` for feature-level behavior and API contracts.

- **`TimelineView.tsx`**: Timeline shell for right-pane timeline mode. Fetches `/api/timeline`, handles edge states, wires optimistic success-criteria save (`PATCH /api/tasks/[taskId]`), and passes data to card components.
- **`TimelineRail.tsx`**: Vertical rail wrapper (purple/grey gradient line with child card slots).
- **`CompletedTaskCard.tsx`**: Completed slot card with green check marker.
- **`ActiveTaskCard.tsx`**: Expanded active card (description via **MarkdownMessage**, success criteria, dependencies, Harvey tip slot, action buttons). Manages tip state and calls `POST /api/tasks/tip` on mount/refresh.
- **`SuccessCriteriaList.tsx`**: Interactive checklist list used inside ActiveTaskCard.
- **`HarveysTip.tsx`**: Tip UI slot with Harvey avatar; shows in-content loading spinner while generating and disables refresh during requests.
- **`UpcomingTaskCard.tsx`**: Collapsed upcoming task slot card.
- **`index.ts`**: Barrel exports for timeline module components.

### `src/components/settings/`

Settings page sections (Feature B):

- **`WorkScheduleSection.tsx`**: Work days (Mon–Sun), work start/end time, optional commute (morning/evening duration + start). Reads/writes User only.
- **`AvailabilitySection.tsx`**: Week-view grid (work grey, commute lighter, availability blocks colored by type), list of blocks (displayed newest first) with add/edit/delete, total hours per week, empty state. Reads/writes Project.contextData.available_time; displays User work/commute for grid.
- **`PreferencesSection.tsx`**: Energy pattern, rest days, preferred session length (presets + custom), communication style. User and Project preferences.

### `src/components/onboarding/`

Components used on the onboarding/chat-style experience:

- **`index.ts`**: Barrel file re-exporting onboarding components (includes **WelcomeNameCard**).
- **`WelcomeNameCard.tsx`**: Card content for the **onboarding welcome page only** (`/onboarding/welcome`): penguin avatar (160×160), “What should Harvey call you?”, first-name input, “Let’s go →” CTA. On submit: PATCH `/api/user/name`, then redirect to `/onboarding/questions`. Used inside AuthPageLayout. Logo/avatar is independent of the signin page (SigninCard uses the small Harvey sparkle icon).
- **`ChatAvatar.tsx`**: Avatar component representing the AI assistant or user in chat messages.
- **`ChatInput.tsx`**: Input area for sending messages or onboarding responses.
- **`ChatMessage.tsx`**: Render of a single chat message bubble (user or AI). Supports streaming: shows content progressively or loading dots. Assistant bubbles render with **MarkdownMessage**; user bubbles remain plain text.
- **`OnboardingCTA.tsx`**: Call-to-action component used during onboarding (buttons, prompts).
- **`OnboardingHeader.tsx`**: Header section for onboarding pages (title, subtitle, progress).
- **`OnboardingProgress.tsx`**: Visual indicator of user’s progress through onboarding steps (“Setting up your project” / progress bar). Not currently used on the onboarding page (only the Shadow Panel completion bar is shown).
- **`ProjectShadowPanel.tsx`**: **Feature D (Shadow Panel)**. Live-updating panel showing extracted user/project fields (Project Info, Your Schedule, Preferences). Used on the onboarding page (60% width); receives `shadowFields`, `isLoading`, `progress` (0–100), optional `projectId` and `onFieldUpdate`. Header (title, completion bar, “Extracting…” indicator) is fixed at the top; only the body scrolls. **Step 6**: Header shows “Completion {progress}%” and a progress bar; “Build My Schedule” button is rendered below the panel by the parent. **Step 7**: Inline editing: one field in edit mode at a time, per-field Save/Cancel, `PATCH /api/onboarding/update-field`; work schedule and availability windows have dedicated edit UIs. **Project Phases** (when present): displayed after motivation, before project notes; supports three extraction formats (array, `{ phases: [] }`, `{ phase_1: {} }`); editable (name, description, status dropdown, add/remove phases); save preserves format. **userNotes** and **projectNotes** are bullet lists (split on “.”); edit via textarea with “separate points with periods” placeholder.

---

## `src/lib/` – Domain logic and services

This directory holds non-UI logic: integrations, services, scheduling, and utilities.

### `src/lib/ai/`

- **`claude-client.ts`**: Helpers for Claude (`isIntakeComplete`, `cleanResponse`, `formatMessagesForClaude`). Non-streaming chat uses `getChatCompletion`; streaming chat uses Vercel AI SDK (`@ai-sdk/anthropic`) in the API route.
- **`models.ts`**: Central model IDs (`MODELS`) and pricing (`MODEL_PRICING` $/million tokens). `computeCostUsd(model, inputTokens, outputTokens)` for cost calculation. See `docs/cost-audit.md`.
- **`usage-logger.ts`**: Async `logApiUsage({ userId, feature, model, inputTokens, outputTokens })`. Writes to `ApiUsageLog` and upserts `UserUsageSummary` (30-day period from user `subscription_start_date` or `createdAt`). Never throws; failures are logged only. **Wired** into all Anthropic call sites: non-streaming (Phase 3) and all four streaming routes (Phase 4 — usage from `result.usage` in onFinish or when stream completes).
- **`prompts.ts`**: All prompt templates and system instructions for AI interactions. **Onboarding**: `ONBOARDING_SYSTEM_PROMPT(todayFormatted, knownInfo, missingFieldsGuidance)` returns the system prompt with unambiguous date at the top ("TODAY IS: Monday, February 17, 2026. All scheduling starts from today."), known-info summary, and dynamic missing-fields guidance; `generateKnownInfoSummary(projectData, userData)` builds the summary of already-extracted fields so Harvey doesn’t re-ask. `COMPLETION_MARKER` is still used for intake-complete detection.
- **`project-extraction.ts`**: Extracts `project_title` and `project_description` from onboarding conversation via Claude. Used in chat route `onFinish` during onboarding to populate Project model early; mirrors the constraint extraction pattern.

### `src/lib/onboarding/`

- **`missing-fields.ts`**: Two-tier missing-fields logic for onboarding. **Blocking fields** (description, availabilityWindows, tools_and_stack, skill_level) must be filled before "Build my schedule" activates; **enriching fields** (preferred_session_length, weekly_hours_commitment) Harvey asks about naturally. `computeMissingFields(projectId, userId)` loads fresh project and user from DB and returns `{ blocking, enriching }`; `tools_and_stack` is treated as missing when only vague terms (e.g. "web app") are present. `buildMissingFieldsGuidance(blocking, enriching)` produces the guidance string injected into the onboarding system prompt. Used by the chat route (for prompt) and the extract route (for response `missingBlockingFields` / `missingEnrichingFields`).

### `src/lib/auth/`

- **`auth-service.ts`**: High-level authentication service functions (sign-in, sign-out, session retrieval). Bridges UI and Supabase/Supabase SSR.
- **`supabase-server.ts`**: Server-side helpers for using Supabase with Next.js (e.g. getting a Supabase client on the server, reading cookies).
- **`supabase.ts`**: Client-side Supabase initialization (browser usage).

### `src/lib/db/`

- **`prisma.ts`**: Prisma client initialization. Exports a singleton Prisma client used across the app for database operations.
- **`test-connection.ts`**: Small utility to test the database connection (e.g. health checks, debugging local DB connectivity).

### `src/lib/discussions/`

- **`discussion-service.ts`**: Service layer for discussion entities (create/fetch discussions, append messages, link them to projects). Used by `/api/discussions/[projectId]`, `/api/discussions/task`, and task list/messages routes. Exposes **getTaskDiscussion(projectId, userId, taskId)** and **listTaskDiscussions(projectId, userId)** for per-task chat. Task discussion creation (POST /api/discussions/task) uses **generateTaskOpeningMessage** (Haiku) for the initial message; see `src/lib/discussions/generate-task-opening-message.ts` and TaskContext shape.

### `src/lib/projects/`

- **`project-service.ts`**: Service layer for project entities (create, update, fetch projects). Provides a clean interface over Prisma models.

### `src/lib/schedule/`

- **`schedule-generation.ts`**: Core logic for generating a schedule based on tasks, timelines, and AI suggestions. **calculateTotalAvailableHours** uses **normalizeAvailabilityBlocks** (from task-scheduler) so overlapping availability blocks are not double-counted. **parseTaskBlock** strips leading and trailing `**` from task titles (markdown cleanup). **buildConstraintsFromProjectAndUser** (Session 2) prefers **User.availabilityWindows** over contextData.available_time when present so **flexible_hours** from extraction is used. **generateScheduleCoachingMessage(context)** (Session 2) calls Claude to produce a 3–4 sentence post-schedule coaching message; used as the project discussion’s initial message (with fallback on failure). Each generated task includes **2–4 success criteria** (prompt and parser output multi-line SUCCESS section; `convertSuccessCriteriaToJson` turns it into the JSON checklist format) and **scheduling metadata** (Session 4: ENERGY_REQUIRED, PREFERRED_SLOT). **Constraint extraction** (`extractConstraints`): single Claude call returns scheduling fields (schedule_duration_weeks, available_time, preferences, exclusions), **User life constraints** (work_schedule, commute), and enrichment (target_deadline, skill_level, tools_and_stack, phases, project_notes, preferred_session_length, communication_style, user_notes, energy_peak, etc.). **buildConstraintsFromProjectAndUser** maps User.availabilityWindows to `available_time` (with window_type and label for slot typing); **flexible** windows produce blocks with flexible_hours; **fixed** windows produce normal start/end blocks; returns **energy_peak** from User. **buildTaskGenerationPrompt** injects USER CONTEXT (including energy_peak and user_notes), PROJECT PHASES, PROJECT NOTES, SCHEDULING METADATA rules, plus SPECIFICITY, SESSION LENGTH, and DEADLINE PACING. The generate-schedule route writes **User** (workSchedule, commute, preferred_session_length, communication_style, userNotes, energy_peak) and **Project.contextData** (available_time, preferences, schedule_duration_weeks, exclusions, one_off_blocks only — **no blocked_time**). See "Constraints data: User vs Project" below.
- **`task-scheduler.ts`**: Scheduler engine (Claude-first with deterministic fallback). **normalizeAvailabilityBlocks(blocks)** merges overlapping availability blocks per day; **buildAvailabilityMap(constraints, userBlocked, energyPeak)** uses normalized `available_time` and builds slots from it; blocks are flexible when `flexible_hours > 0` or `window_type === 'flexible'`. For flexible slots, **capacity = flexible_hours** and slot end = start + flexible_hours (never boundary end). Assigns each slot a **slotType** (Session 4: peak_energy | normal | flexible | emergency) via **getSlotType(…)** — weekend → flexible; label contains "emergency"/"late_night" or overnight 22:00–02:00 → emergency (Session 2); when energy_peak is set, slots in that time of day → peak_energy. **assignTasksWithClaude** serializes tasks and date-specific slots, calls Claude Haiku for JSON assignments, validates hard constraints (real task indices, known slots, overlap/slot conflicts, dependency ordering, split continuity, and task-level duration totals). `hoursAssigned` can be lower than slot capacity (partial slot usage); duration integrity is checked by summing `hoursAssigned` across each task. It retries once with explicit violations, then falls back to **assignTasksToSchedule** if still invalid. **assignTasksToSchedule** remains the deterministic engine and iterates from **start_date** for duration_weeks×7 days (no calendar-week alignment). **Cross-day dependency ordering**: **canPlaceTaskInSlot** requires each dependency to already be scheduled and fully finished (latest dependency end across all days must be strictly before the candidate slot start). **Split-part sequencing**: when a task is split (Part 1, Part 2, …), Part N+1 is only placed in slots that start **after** Part N ends (earliestStartForContinuation); all parts keep the original task's priority. **Consecutive parts**: after assigning Part 1, **scheduleRemainingPartsConsecutively** immediately places Part 2, Part 3, … in the next available slot(s). If a split task still has remaining parts later in the loop, **continuation priority** ensures it is selected before new tasks as soon as its earliest continuation start is reached. Slot usage is derived from **getSlotUsedState** (timezone-aware) so the main loop and the consecutive scheduler share the same view of used capacity. Accepts optional **SchedulerOptions** (energyPeak, preferredSessionLength, userNotes, projectNotes, projectGoals, projectMotivation, phases, rampUpDay1). Tasks are ordered by **sortIndicesByDependenciesThenPriorityAndEnergy** (phase heuristic first when `options.phases` is present, then dependency layer, then priority high first, then energy_required high first). Slots are tried in two passes: non-emergency first, then emergency. When filling a slot, **pickTaskForSlot** prefers a task whose preferred_slot matches the slot type; **breathing room**: 15-minute gap between consecutive tasks in the same window; minimum split fragment 30 minutes. **rampUpDay1**: when notes indicate "losing motivation" / "lacking motivation", day 1 gets max 2 tasks and prefers medium/low energy. **getTaskScheduleData** and **getEffectiveAvailableTimeBlocks** unchanged. Day-by-day iteration includes weekends; **ScheduleResult** includes **weekendHoursUsed**, **weekendHoursAvailable**, and per-assignment **slotType** for the post-generation coaching message.

**Constraints data: User vs Project**

- **User** (life constraints, shared across all projects): `workSchedule` (workDays; either legacy startTime/endTime or `blocks`: array of { startTime, endTime } for multiple blocks per day), `commute` (morning/evening duration + startTime), `timezone`, `preferred_session_length`, `communication_style`, **`energy_peak`** (Session 4: "morning" | "afternoon" | "evening" — when the user is most productive). Work and commute are facts about the user's life and do not change per project.
- **Project** (enrichment and schedule): **schedule_start_date** (DateTime?, optional first day of schedule; used by generate-schedule when set; null → default to tomorrow/next Monday). **Project.contextData** (project-specific allocations): `available_time` (when the user allocates time to *this* project; optional `type`: 'work' | 'personal'), `preferences` (e.g. energy_peak, rest_days), `schedule_duration_weeks`, `exclusions`, `one_off_blocks`. **Blocked time is not stored in contextData** — it is derived on-the-fly from User.workSchedule and User.commute when building the availability map (task-scheduler, regenerate_schedule, add_task, smart-reschedule).

### `src/lib/tasks/`

- **`task-service.ts`**: Service layer for task entities (CRUD operations, checklist operations, status transitions). **Task list order**: `getTasksForProject` uses `orderBy: [scheduledDate asc, position asc, priority asc]`; tasks with null `position` (legacy) sort after those with position. **Task grouping** (`groupTasksByDate(tasks, userTimezone)`) uses the user’s timezone for “today” so that Past (completed tasks from previous days), Overdue (past-date, not completed), and Today (scheduledDate = today in user TZ) are correct; within each day bucket tasks are sorted by **position** (nulls last) then by **startTime** for legacy tasks. A rolling 7-day window (today through today+6) gives named day sections (e.g. Sunday → Mon–Fri of next week get labels). weekDays = day after tomorrow through today+6; Later = >7 days out. When a task is set to **skipped**, all tasks that depend on it (via `depends_on`) are cascade-skipped. **getTodayProgress(userId)** returns today’s completed/skipped/pending counts, **userTimezone**, and **nextTask** (first pending today, or if none, the nearest upcoming pending task by date). Used by `/api/progress/today` and the completion feedback widget. Used heavily by task-related API routes and dashboard UI.

### `src/lib/timeline/`

- **`get-timeline-data.ts`**: Timeline data assembly. Exposes `getTimelineData(projectId, userId)` and performs timeline-specific queries for last completed task, active task, dependency metadata, and next two upcoming pending tasks from current time (user timezone aware). **Active task**: all pending tasks with scheduledDate are fetched (no DB order), then sorted in JS with **`compareTasksChronologically()`**. Sort rule: by **effective start time** (fixed = scheduledStartTime, flexible = window_start as decimal hours); across days = scheduledDate asc. Same day: flexible vs fixed uses **gap** = earliest fixed start on that day − flexible start; if gap ≥ flexible duration (hours) then flexible first, else fixed first (earliest fixed is from the full list passed into the comparator). Among flexible: dependency order then createdAt; among fixed: scheduledStartTime asc. Legacy: is_flexible ?? false. First element after sort is the active candidate; if it has unmet dependencies, the earliest unmet (same comparator) is chosen. **Upcoming**: same comparator and dependency-aware reorder. TaskForSort includes estimatedDuration, window_start, window_end for gap calculation. Audit logs: `[TIMELINE] Tasks fetched`, `[TIMELINE] Tasks after sort`, `[TIMELINE] Active task selected` (see `docs/timeline-view/README.md`).

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

### `src/lib/context-builders/` – Task chat context

- **`build-task-chat-context.ts`**: Builds the system prompt for per-task chat (`POST /api/chat/task`). **buildTaskChatContext(taskId, userId)** returns a string with five sections: (1) **Project context** — project title, description, goals, deadline, tech stack, skill level, weekly hours (from Project + User); (2) **Current task** — title, label, status, estimated duration, scheduled date, description, success criteria; (3) **Dependencies** — tasks this task depends on (with status), incomplete dependencies, and tasks this task unlocks; (4) **Schedule context** — recent work (last 7 days, up to 5 tasks) and upcoming tasks (next 5 pending); (5) **Behavioral patterns** — time estimation accuracy by label (ratio actual/estimated, 2+ data points) and skip patterns (most common skip reason from skipped tasks). Queries run fresh on every call (no caching). On Prisma failure returns a minimal fallback prompt (task title + "context temporarily unavailable") and never throws.

### `src/lib/users/`

- **`user-actions.ts`**: Higher-level user actions (e.g. onboarding completion, preference updates) that may span multiple services or tables.
- **`user-service.ts`**: Direct user entity operations (create, fetch by ID/email, update). Raw SQL read/update (getUserByIdRaw, updateUser) includes **energy_peak** so schedule generation and onboarding extract can persist and load it.

### `src/lib/utils.ts` – General utilities

- **`utils.ts`**: Grab-bag of shared helper functions (formatting, date utilities, type guards, etc.) used across different parts of the app.

### `src/lib/checkin/` – Daily check-in context

- **`checkin-context.ts`**: Assembles context for the daily check-in message: time of day (morning/afternoon/evening in user timezone), today’s pending/in-progress tasks with titles and times, yesterday’s completion summary (completed/skipped/total), current streak (consecutive days with at least one completion), and recently skipped tasks (last 2 days). Used by `POST /api/chat/checkin`.

### `src/lib/timezone.ts` – Timezone helpers

- **`timezone.ts`**: Utilities for user-timezone-aware date/time handling. Database stores UTC; this module provides `getDateStringInTimezone` (YYYY-MM-DD in a given IANA timezone), `formatDateLongInTimezone` (long date for prompts), `getHourDecimalInTimezone`, `formatTimeInTimezone`, and `localTimeInTimezoneToUTC` for saving. Used by chat context assembly, chat tools, and check-in context so "today", overdue, and schedule dates are correct for the user's timezone.

---

## `src/prisma/` – Prisma schema and migrations

> Note: There is also a generated Prisma client under `src/node_modules/.prisma/`. That generated code should not be modified directly.

- **`schema.prisma`**: Source of truth for the database schema (models such as User, Project, Task, Schedule, Discussion, etc.). Changes here are applied to the DB via migrations. The **User** model includes `timezone`, **life constraints** (`workSchedule` Json: workDays, startTime, endTime; `commute` Json: morning/evening duration + startTime), `availabilityWindows` Json (array of windows; each can be **fixed** = exact time block or **flexible** = X hours within a boundary via `window_type`, `flexible_hours`), and enrichment: `preferred_session_length`, `communication_style`, `userNotes Json?`. The **Project** model includes `contextData Json?` (project allocations only: schedule_duration_weeks, **available_time**, preferences, exclusions, one_off_blocks — **blocked_time is not stored**; scheduling derives it from User), enrichment fields (`target_deadline`, `skill_level`, etc.), `projectNotes Json?`, `generationCount Int`, **`milestones Json?`** (array of milestone objects from schedule generation; displayed on Project Details page), **`schedule_duration_days Int?`** (calendar days the schedule spans; TODO: move to Schedule/Batch model when Feature 8 multi-generation ships), and **`schedule_start_date DateTime?`** (optional first day of schedule; generate-schedule uses it when set, else defaults to tomorrow/next Monday). The **Task** model includes **`position Int?`** (per-day sort order, 1-based; null = legacy, sort by scheduledStartTime), `depends_on String[]`, `batchNumber Int`, for flexible-scheduled tasks: **`window_start`**, **`window_end`** (String? — store **availability window boundaries** e.g. "09:00"/"17:00", not computed slot times), `is_flexible` (Boolean), and (Session 4) **`energy_required`** (String?: "high"|"medium"|"low"), **`preferred_slot`** (String?: "peak_energy"|"normal"|"flexible"). **Sort order** for task lists: `scheduledDate` → `position` → `priority`. The **Discussion** model includes `type String` (default "project"; values "onboarding" | "project" | "task"), `taskId String?`, and optional **`task Task?`** relation (onDelete: Cascade). The **Task** model has **`discussions Discussion[]`** (inverse). Per-task chat (Step 2) uses type "task" and taskId to store one discussion per task.

- **`migrations/`**: Auto-generated migration history:
  - **`20260221064457_add_task_discussion_type/`**
    - **`migration.sql`**: Adds Discussion–Task relation (task Task?, Task.discussions). Per-task chat Step 2.
  - **`20260217153250_add_energy_peak_and_task_scheduling_metadata/`**
    - **`migration.sql`**: Adds User.energy_peak (TEXT), Task.energy_required (TEXT), Task.preferred_slot (TEXT). Session 4 smart scheduler.
  - **`20260223103000_add_task_harvey_tip_cache/`**
    - **`migration.sql`**: Adds `Task.harveyTip` (TEXT, nullable) to cache timeline-generated Harvey tips after first generation.
  - **`20260217160000_add_project_milestones_and_schedule_duration_days/`**
    - **`migration.sql`**: Adds Project fields `milestones` (JSONB), `schedule_duration_days` (Integer). Persisted after schedule generation; milestones shown on Project Details page.
  - **`20260217185648_add_project_schedule_start_date/`**
    - **`migration.sql`**: Adds Project field `schedule_start_date` (DateTime?). First day of schedule; used by generate-schedule when set (Session 1 data fixes).
  - **`20260217135426_add_task_flexible_fields/`**
    - **`migration.sql`**: Adds Task fields `window_start`, `window_end` (String?), `is_flexible` (Boolean, default false) for flexible-scheduled tasks.
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
- **`timeline.types.ts`**: Types for timeline mode payloads (completed/active/upcoming tasks, dependencies, and timeline card data contracts).
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
