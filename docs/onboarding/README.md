# Onboarding (Chat Intake, Discussion Storage)

## What this feature is about
Onboarding is a chat-style intake where Harvey gathers project details and scheduling constraints. Harvey is guided (via the onboarding system prompt) to naturally surface motivation, technical background and tools, phases vs single deadline, what success looks like and by when, and how long the user can focus in one sitting — these topics emerge in conversation rather than as a checklist. Messages are stored in a `Discussion` record and later used to generate tasks and schedules; at schedule generation, a single extraction call populates both scheduling constraints and Project/User enrichment from the conversation.

## Files involved (and where to find them)
- `src/app/onboarding/page.tsx`
  - Onboarding chat UI and main state machine (messages, typing, completion, CTA). **Feature D (Shadow Panel)**: Split layout 40% chat / 60% Shadow Panel. No top-of-page progress bar; the only progress indicator is the completion bar inside **ProjectShadowPanel**. After every Harvey response, triggers extraction in the background (`POST /api/onboarding/extract`), stores result in `shadowFields` state and passes it to **ProjectShadowPanel**. **Step 6**: Weighted extraction progress (`calculateExtractionProgress`), minimum-fields check (`hasMinimumFields`), and completion-marker detection drive a three-state “Build My Schedule” button (disabled / Stage 1 with confirmation modal / Stage 2 direct); button at bottom of right column. Extraction runs only when `projectId` exists (set via stream `onData`); failures are logged and do not block the flow.
- `src/components/onboarding/ProjectShadowPanel.tsx`
  - **Feature D (Shadow Panel) Step 5 + 6 + 7**. Live-updating panel showing extracted user/project in three sections: Project Info, Your Schedule, Preferences. **Step 6**: Receives `progress` (0–100); header shows “Completion {progress}%” and a progress bar; header is **sticky** at the top when scrolling (completion bar and “Extracting…” stay visible). **Step 7**: Inline editing: optional `projectId` and `onFieldUpdate(scope, field, value)`; Edit button on each filled field; one field in edit mode at a time; Save/Cancel per field; Escape cancels. Work schedule and availability windows use dedicated edit UIs (day selection, time inputs, add/remove blocks). **userNotes** and **projectNotes** are displayed as bullet lists (split on “.”); edit via textarea with “separate points with periods” placeholder. Renders only non-null fields; phases and commute are display-only.
- `src/app/api/onboarding/update-field/route.ts`
  - **Feature D Step 7**. `PATCH /api/onboarding/update-field`. Body: `{ projectId, scope: 'user' | 'project', field, value }`. Auth required; project ownership verified. Updates a single user or project field via `updateUser` / `updateProject`. Used by the Shadow Panel when the user saves an edited field.
- `src/components/onboarding/ChatMessage.tsx`
  - Renders chat bubbles and message list.
- `src/components/onboarding/ChatInput.tsx`
  - Text input with auto-expanding textarea and submit handling.
- `src/components/onboarding/OnboardingProgress.tsx`
  - Progress header and progress bar (“Setting up your project”). Not used on the onboarding page; only the Shadow Panel completion bar is shown.
- `src/components/onboarding/OnboardingCTA.tsx`
  - “Build my schedule” CTA and loading state.
- `src/components/onboarding/OnboardingHeader.tsx`
  - Reusable header section component.
- `src/components/onboarding/index.ts`
  - Barrel exports for onboarding components.
- `src/app/api/chat/route.ts`
  - Main onboarding chat API that calls Claude and persists messages.
- `src/app/api/discussions/[projectId]/route.ts`
  - Fetches discussion history for a project (used in dashboard sidebar).
- `src/lib/discussions/discussion-service.ts`
  - Discussion CRUD and message appends.
- `src/lib/projects/project-service.ts`
  - Project creation and retrieval.
- `src/lib/users/user-service.ts`
  - Ensures DB user exists during first chat message.
- `src/lib/ai/claude-client.ts`
  - Claude API wrapper used for the chat responses.
- `src/lib/ai/prompts.ts`
  - Onboarding system prompt (Harvey’s behavior).
- `src/types/api.types.ts`
  - `ChatRequest`, `ChatResponse`, `StoredMessage` types.
- `src/types/chat.types.ts`
  - UI chat message types and helpers.
- `src/prisma/schema.prisma`
  - `Project` and `Discussion` models.

## Feature flow (end-to-end)
1. User visits `/onboarding`.
2. `OnboardingPage` initializes with Harvey’s greeting message.
3. User sends a message; UI calls `POST /api/chat` (streaming) with `{ messages, projectId?, context }` via `useChat`.
4. `Chat API` authenticates user via Supabase.
5. First message:
   - Ensures DB `User` exists.
   - Creates `Project` with default title.
   - Creates `Discussion` linked to project.
6. Subsequent messages:
   - Loads existing discussion by `projectId`.
7. API streams Claude response via Vercel AI SDK (`streamText`).
8. API appends user + assistant messages into `Discussion.messages` when stream completes.
9. Client receives streamed text and `projectId` (via transient data). `isComplete` and `hasCompletionMarker` are set when response contains `PROJECT_INTAKE_COMPLETE`. Extraction progress (0–100) is computed from weighted extracted fields; minimum required fields (title, description or goals, availability, weekly hours) enable the “Build” button.
10. **Build My Schedule button (Step 6)** in the right column: (1) Disabled until minimum fields are present; (2) Stage 1 when can build but progress &lt; 80% and no completion marker — click opens “Build now or keep chatting?” modal; (3) Stage 2 when progress ≥ 80% or completion marker — click goes directly to schedule. When `isComplete`, left column also shows the legacy “Build my schedule” CTA.
11. CTA or “Build Anyway” / Stage 2 button navigates to `/loading?projectId=...` (schedule generation starts there).

## Function reference (what each function does)

### `src/app/onboarding/page.tsx`
- `handleSendMessage(content)`
  - Calls `sendMessage({ text: content })` from `useChat`. Response streams word-by-word; `isComplete` and `hasCompletionMarker` set via `onFinish` when last message contains `PROJECT_INTAKE_COMPLETE`.
- `handleBuildSchedule()`
  - Closes confirmation modal if open, then redirects to `/loading` with `projectId` for schedule generation.
- `handleStage1Click()` / `handleKeepChatting()`
  - Stage 1 button opens confirmation modal; “Keep Chatting” closes it.
- (No top progress bar: only the Shadow Panel completion bar is shown; see `calculateExtractionProgress` and ProjectShadowPanel.)
- `calculateExtractionProgress(fields)`
  - Returns 0–100 from weighted extracted fields (title, description/goals, availability, weekly_hours, deadline, project_type, skill_level, tools_and_stack, motivation, phases, workSchedule, commute, preferred_session_length, communication_style, timezone, userNotes, projectNotes).
- `hasMinimumFields(fields)`
  - True when project has title, (description or goals), and weekly_hours_commitment > 0, and user has non-empty availabilityWindows.
- **Step 7**: Passes `projectId` and `onFieldUpdate` to **ProjectShadowPanel**. `onFieldUpdate(scope, field, value)` merges the updated field into `shadowFields` so the panel reflects the change without refetching.

### `src/app/api/chat/route.ts`
- `POST(request)`
  - Authenticates user.
  - Creates/loads project + discussion.
  - Streams Claude response via `streamText` + `createUIMessageStream`.
  - Saves messages to discussion when stream completes.
  - Sends `projectId` via transient data for client continuation.

### `src/app/api/discussions/[projectId]/route.ts`
- `GET(request, { params })`
  - Validates ownership and returns conversation messages for the project.

### `src/lib/discussions/discussion-service.ts`
- `createDiscussion(data)`
  - Creates a discussion with optional initial message.
- `getDiscussionByProjectId(projectId, userId)`
  - Returns most recent discussion for a project (ownership enforced).
- `appendMessages(discussionId, messages)`
  - Appends one or more messages into JSON array and updates `updatedAt`.
- `getMessages(discussionId)`
  - Returns messages only.

### `src/lib/projects/project-service.ts`
- `createProject(data)`
  - Creates a project for a user.
- `getProjectById(projectId, userId)`
  - Fetches project with ownership validation.
- `updateProject(projectId, userId, data)`
  - Updates project; data may include title, description, goals, and enrichment fields (target_deadline, skill_level, tools_and_stack, project_type, weekly_hours_commitment, motivation, phases, projectNotes).

### `src/lib/ai/claude-client.ts`
- `getChatCompletion(systemPrompt, messages)` – used by non-streaming flows (e.g. schedule generation).
- `isIntakeComplete(response)`
  - Checks for completion marker.
- `cleanResponse(response)`
  - Strips completion marker from response.

## Data models used (from Prisma schema)
- `Project`: created on first message; holds `title`, `description`, `goals`, `contextData` (schedule constraints), and enrichment fields (`target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`, `phases`, `projectNotes`). Enrichment is populated at schedule generation from the same extraction that fills `contextData`.
- `User`: holds `preferred_session_length`, `communication_style`, `userNotes` (populated at schedule generation).
- `Discussion`: `messages` is a JSON array of `{ role, content, timestamp }`.

## Early project title & description extraction

During onboarding, after each chat message is saved, the chat API runs a lightweight extraction to populate `Project.title` and `Project.description` as soon as they can be inferred from the conversation.

- **Where**: `src/lib/ai/project-extraction.ts` — `extractProjectInfo(conversationText)`
- **When**: Chat route `onFinish`, only when `context === 'onboarding'` and project has default title ("Untitled Project") or no description
- **How**: Claude analyzes the full conversation and returns `{ project_title, project_description }` as JSON; values are stored via `updateProject()`
- **Why**: Low-effort, high-leverage setup. Post-onboarding chat, project shadow, and schedule regeneration can reuse these fields without backfill

## Onboarding extraction endpoint (Feature D – Shadow Panel, Step 2 + 3)

- **Route**: `POST /api/onboarding/extract`
- **Body**: `{ projectId: string }`
- **Auth**: Same as other API routes (Supabase session required). Project must be owned by the authenticated user.
- **Behavior**: Loads the onboarding discussion via `getOnboardingDiscussion(projectId, userId)`, builds conversation text from all messages (`User:` / `Harvey:` lines), calls Anthropic Haiku with a structured extraction prompt, parses and validates the JSON response. **Persistence (Step 3)**: Only **non-null** extracted fields are saved (merge logic – do not overwrite existing data with null). Uses `updateUser(userId, userUpdates)` and `updateProject(projectId, userId, projectUpdates)`. `target_deadline` is converted from ISO string to Date; arrays (availabilityWindows, tools_and_stack) replace existing values entirely.
- **Response**: `{ success: true, extracted: { user, project }, saved: { user: userUpdates | null, project: projectUpdates | null } }` so the frontend knows what was written. Extracted = full extraction result; saved = only the keys that were actually updated.
- **Response fields (extracted/saved)**: `user` (timezone, workSchedule, commute, availabilityWindows, preferred_session_length, communication_style, userNotes); `project` (title, description, goals, project_type, target_deadline, weekly_hours_commitment, tools_and_stack, skill_level, motivation, phases, projectNotes).
- **Errors**: 401 Unauthorized, 400 missing/invalid projectId, 403 project not found or not owner, 404 no onboarding conversation, 500 extraction/parse failure or database save failure (logged to console).

## Inline field update (Feature D – Shadow Panel, Step 7)

- **Route**: `PATCH /api/onboarding/update-field`
- **Body**: `{ projectId: string, scope: 'user' | 'project', field: string, value: unknown }`
- **Auth**: Supabase session required. Project ownership verified via `getProjectById(projectId, user.id)`.
- **Behavior**: Updates a single field on the user or project. For `scope === 'user'`, calls `updateUser(userId, { [field]: value })`; for `scope === 'project'`, calls `updateProject(projectId, userId, { [field]: value })`. If `field === 'target_deadline'`, `value` (ISO string) is converted to `Date` before updating. Used by the Shadow Panel when the user clicks Save after editing a field.
- **Response**: `{ success: true, updated: { scope, field, value } }` or 401/400/404/500.

## Gaps / Not found in repo
- No explicit UI state persistence between refreshes in onboarding (messages are refetched only via API when used in dashboard).
