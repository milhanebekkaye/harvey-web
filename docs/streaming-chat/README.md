# Streaming Chat with Vercel AI SDK

## Overview

All chat interactions use streaming, so Harvey's messages appear word-by-word like ChatGPT or Claude. The infrastructure is built once and handles all chat contexts: onboarding, project-chat, and task-chat (when added).

## Architecture

### Single Backend, Multiple Frontends

- **One API route**: `POST /api/chat` accepts a `context` parameter (`onboarding` | `project-chat` | `task-chat`)
- **Shared pattern**: Each frontend `useChat` instance is separate, but they all hit the same streaming endpoint
- **Extraction separate**: Constraint extraction (parsing scheduling constraints from conversation) runs as a **non-streamed** call when the user clicks "Build my schedule" and is handled by `/api/schedule/generate-schedule`

### Tech Stack

- **Backend**: `@ai-sdk/anthropic` + `ai` package (Vercel AI SDK)
- **Streaming**: `streamText()` with `smoothStream()` (word-by-word chunking) → `createUIMessageStream()` → `createUIMessageStreamResponse()`
- **Frontend**: `useChat()` hook from `@ai-sdk/react` with `DefaultChatTransport`

### Smooth Streaming (Natural Typing Feel)

The API uses `smoothStream()` with `chunking: 'word'` and `delayInMs: null` to:
- Buffer token fragments until complete words are formed
- Release words immediately (no artificial delay) for responsive, natural flow
- Avoid jerky token-by-token display similar to ChatGPT/Claude

## Files Involved

- `src/app/api/chat/route.ts` – Streaming chat API (auth, project/discussion management, streaming)
- `src/app/onboarding/page.tsx` – Onboarding chat using `useChat`
- `src/components/onboarding/ChatMessage.tsx` – Renders messages (supports streaming text)
- `src/lib/ai/claude-client.ts` – `isIntakeComplete`, helpers (non-streaming logic)
- `src/lib/ai/prompts.ts` – System prompts and `COMPLETION_MARKER`

## Flow

1. User sends a message → `useChat` calls `POST /api/chat` with `{ messages, projectId?, context }`
2. API authenticates, creates/loads project + discussion
3. API streams Claude response via `streamText` + `createUIMessageStream`
4. Client receives streamed tokens and updates the last assistant message in real time
5. On stream finish: API saves user + assistant messages to Discussion
6. Client receives `projectId` via transient `data-onboarding-meta` (for continuation)
7. Client derives `isComplete` when last message contains `PROJECT_INTAKE_COMPLETE`

## Empty content and tool-only responses

Anthropic requires every message's text content to be non-empty. When Harvey responds with **only** a tool call (e.g. `show_date_picker` for deadline/start date) and no text, the streamed message has no text part. To avoid saving or sending empty content:

- **When saving:** If the assistant response has no text, the API detects tool invocations in the message parts. It saves a short placeholder instead of empty string: "(Calendar shown for date selection.)" for the date picker, "(Tool used.)" for other tools. The discussion continues and the next request works.
- **When sending to Claude:** All messages passed to the model have their content sanitized: empty or whitespace-only content is replaced with "(No message content.)" so existing discussions that already contain empty assistant messages (e.g. from before this fix) never cause a 400.

## Custom Data in Stream

The API sends transient metadata for the client:

- **`data-onboarding-meta`**: `{ projectId }` – sent at stream start so the client can use it for the next request
- **`isComplete`**: Derived on the client from the last assistant message containing `PROJECT_INTAKE_COMPLETE`

## Extraction (Non-Streamed)

Constraint extraction is **not** part of the chat stream. It runs when:

1. User completes onboarding (Harvey returns `PROJECT_INTAKE_COMPLETE`)
2. User clicks "Build my schedule" → navigates to `/loading?projectId=...`
3. Loading page calls `POST /api/schedule/generate-schedule` with `projectId`
4. That API loads the Discussion, calls `extractConstraints()`, generates tasks, etc.

See `docs/task-generation/README.md` for the full schedule generation flow.

## Adding New Chat Contexts

To add project-chat or task-chat:

1. Create a new page/component that uses `useChat` with `body: { context: 'project-chat', projectId }` (or `task-chat`)
2. In `src/app/api/chat/route.ts`, branch on `context` to select the appropriate system prompt and behavior
3. No changes to the streaming infrastructure – it already supports `context`
