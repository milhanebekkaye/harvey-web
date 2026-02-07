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

- **Agent / context**: (e.g. “Cursor AI assistant”, brief description of the request or task)
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
