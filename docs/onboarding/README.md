# Onboarding (Chat Intake, Discussion Storage)

## What this feature is about
Onboarding is a chat-style intake where Harvey gathers project details and scheduling constraints. Harvey is guided (via the onboarding system prompt) to naturally surface motivation, technical background and tools, phases vs single deadline, what success looks like and by when, and how long the user can focus in one sitting — these topics emerge in conversation rather than as a checklist. Messages are stored in a `Discussion` record and later used to generate tasks and schedules; at schedule generation, a single extraction call populates both scheduling constraints and Project/User enrichment from the conversation.

## Files involved (and where to find them)
- `src/app/onboarding/page.tsx`
  - Onboarding chat UI and main state machine (messages, typing, completion, CTA). **Feature D (Shadow Panel)**: Split layout 40% chat / 60% Shadow Panel. After every Harvey response, triggers extraction in the background (`POST /api/onboarding/extract`), stores result in `shadowFields` state and passes it to **ProjectShadowPanel**. Extraction runs only when `projectId` exists (set via stream `onData`); failures are logged and do not block the flow.
- `src/components/onboarding/ProjectShadowPanel.tsx`
  - **Feature D (Shadow Panel) Step 5**. Live-updating panel showing extracted user/project in three sections: Project Info, Your Schedule, Preferences. Renders only non-null fields; supports work schedule day grid, availability windows, tools pills, phases (collapsible), dates and times formatted for display.
- `src/components/onboarding/ChatMessage.tsx`
  - Renders chat bubbles and message list.
- `src/components/onboarding/ChatInput.tsx`
  - Text input with auto-expanding textarea and submit handling.
- `src/components/onboarding/OnboardingProgress.tsx`
  - Progress header and progress bar.
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
9. Client receives streamed text and `projectId` (via transient data). `isComplete` is derived when response contains `PROJECT_INTAKE_COMPLETE`.
10. When `isComplete` is true, UI shows “Build my schedule” CTA.
11. CTA navigates to `/loading?projectId=...` (schedule generation starts there).

## Function reference (what each function does)

### `src/app/onboarding/page.tsx`
- `handleSendMessage(content)`
  - Calls `sendMessage({ text: content })` from `useChat`. Response streams word-by-word; `isComplete` set via `onFinish` when last message contains `PROJECT_INTAKE_COMPLETE`.
- `handleBuildSchedule()`
  - Redirects to `/loading` with `projectId` for schedule generation.
- `calculateProgress()`
  - Computes progress based on count of user messages.

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

## Gaps / Not found in repo
- No explicit UI state persistence between refreshes in onboarding (messages are refetched only via API when used in dashboard).
