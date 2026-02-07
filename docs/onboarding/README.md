# Onboarding (Chat Intake, Discussion Storage)

## What this feature is about
Onboarding is a chat-style intake where Harvey gathers project details and scheduling constraints. Messages are stored in a `Discussion` record and later used to generate tasks and schedules.

## Files involved (and where to find them)
- `src/app/onboarding/page.tsx`
  - Onboarding chat UI and main state machine (messages, typing, completion, CTA).
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
  - Updates title/description/goals.

### `src/lib/ai/claude-client.ts`
- `getChatCompletion(systemPrompt, messages)` – used by non-streaming flows (e.g. schedule generation).
- `isIntakeComplete(response)`
  - Checks for completion marker.
- `cleanResponse(response)`
  - Strips completion marker from response.

## Data models used (from Prisma schema)
- `Project`: created on first message; holds `contextData` later (schedule constraints).
- `Discussion`: `messages` is a JSON array of `{ role, content, timestamp }`.

## Gaps / Not found in repo
- No explicit UI state persistence between refreshes in onboarding (messages are refetched only via API when used in dashboard).
- No explicit update of project title/description based on onboarding conversation in code shown here.
