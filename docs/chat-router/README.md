# Chat Router System

Post-onboarding chat system that turns Harvey into an interactive project coach. Users can chat with Harvey to modify their schedule, update constraints, add tasks, get advice, and more.

## Architecture

```
User types message
    ↓
ChatSidebar (useChat → /api/chat/project)
    ↓
API Route authenticates, loads Discussion
    ↓
assembleProjectChatContext() → dynamic system prompt with live DB data
    ↓
streamText() with 7 tools → Claude
    ↓
Claude decides: conversational response OR tool call
    ↓
If tool: execute function → DB mutation → result → Claude explains
    ↓
Streaming response → ChatSidebar renders → tasks refetched if tool called
```

## Two Response Categories

**Category A — Tool Calls:** Claude detects the user wants to DO something and calls the appropriate tool. The backend executes it, returns structured data, Claude explains what happened.

**Category B — Conversational:** Claude detects the user is asking a question, seeking advice, or chatting. Claude responds using project context from the system prompt. No tool call needed.

Claude decides which category. No custom intent classifier.

## Files

```
src/lib/chat/
├── assembleContext.ts      # Dynamic system prompt builder
├── generateSuccessCriteria.ts # Generate 2–4 success criteria via Claude (used by add_task)
├── types.ts                # Shared TypeScript types
└── tools/
    ├── modifySchedule.ts   # Move/resize tasks
    ├── updateConstraints.ts # Change availability
    ├── addTask.ts          # Add new tasks with slot-finding + success criteria
    ├── suggestNextAction.ts # "What should I do?" data
    ├── getProgressSummary.ts # Progress stats
    ├── regenerateSchedule.ts # Rebuild schedule
    └── updateProjectNotes.ts # Harvey's memory

src/app/api/chat/project/
└── route.ts                # Streaming API endpoint
```

## Context Assembly

`assembleProjectChatContext(projectId, userId)` is called for EVERY message. The API route sends only the **last 10 messages** as conversation history to reduce cost.

Assembly steps:

1. Fetches the Project with all Tasks from the database
2. Fetches the User (for name, timezone)
3. Computes task statistics in the **user's timezone** (completion rate, today's tasks by local date, skip patterns) via `computeTaskStats(tasks, userTimezone)`
4. Limits the schedule to **today + next 7 days** (plus unscheduled) for the system prompt; tasks beyond that window are omitted, with a note “(N tasks beyond this window)” when N > 0
5. Builds a system prompt with:
   - Harvey's personality instructions
   - Current date/time in user's timezone, plus explicit "Today's date in user's timezone: YYYY-MM-DD" and "Current time in user's timezone: HH:MM"
   - Project info (title, description, goals, status)
   - User constraints (available time, blocked time, one-off blocks)
   - **Tasks today** and **Full schedule** (today + 7 days only) with **compact task lines** (e.g. `Feb 9 20:00–22:00 | id:abc | Title | 2h | pending | →dep1`) and short date headers (e.g. "Mon Feb 9") to reduce tokens
   - Progress statistics
   - Harvey's accumulated notes about the user
   - Tool usage instructions

Dates and "today" are derived using `getDateStringInTimezone` from `src/lib/timezone.ts`. Tools that return "today" or overdue data (`suggest_next_action`, `get_progress_summary`) also use the user's timezone for consistency.

## Tools

### How to Add a New Tool

1. Create a new file in `src/lib/chat/tools/` with an `executeXxx()` function
2. The function takes `(params, projectId, userId)` and returns `{ success, message, ... }`
3. Wrap in try/catch, return `{ success: false, message: "..." }` on error
4. In `src/app/api/chat/project/route.ts`, add the tool definition using `tool()` from `ai`:
   ```typescript
   my_tool: tool({
     description: 'What the tool does...',
     inputSchema: z.object({ ... }),
     execute: async (params) => executeMyTool(params, projectId, user.id),
   }),
   ```
5. Add the result type to `src/lib/chat/types.ts`

### Tool Summary

| Tool | Trigger | Mutates DB? |
|------|---------|-------------|
| `modify_schedule` | "Move task to tomorrow" | Yes — updates Task |
| `update_constraints` | "I can't work Fridays" | Yes — updates Project.contextData |
| `add_task` | "Add a 2h task for..." | Yes — creates Task (with 2–4 AI-generated success criteria) |
| `suggest_next_action` | "What should I do?" | No — read-only |
| `get_progress_summary` | "How am I doing?" | No — read-only |
| `regenerate_schedule` | "Rebuild my schedule" | Yes — updates Tasks. Respects dependencies (part 1 before part 2); returns clear recap (moved count, completion date). |
| `update_project_notes` | (Harvey decides internally) | Yes — updates Project.projectNotes |

### regenerate_schedule behavior

- **Scope "remaining"**: Reschedules only pending/skipped/in_progress tasks; completed tasks stay in place. Tasks are ordered by **dependencies** (`depends_on`), then priority, then date, so a dependent task is never scheduled before its dependencies. The tool returns a short `message` (e.g. how many moved, new completion date) and optional `change_summary`; Harvey is instructed to give a 2–3 sentence recap.
- **Scope "full_rebuild"**: Re-extracts constraints, regenerates tasks via Claude, and runs the full scheduling pipeline (which already respects dependencies). Returns completion date in the message.
- **Logging**: Console logs which tasks were moved (old day → new day), completion date before/after, and a final recap line for debugging.

## Frontend Integration

The `ChatSidebar` component uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` pointed at `/api/chat/project`. Messages are merged from three sources: useChat (initial + streamed), dashboard-appended (e.g. after Complete/Skip), and widget-appended (feedback buttons). Each message has a `createdAt` (ISO string); the merged list is sorted by `createdAt` ascending so the newest message is always at the bottom. Auto-scroll runs when messages or appended lists change. In `onFinish`, the sidebar checks if any assistant message contains a tool invocation (AI SDK v6: `part.type.startsWith('tool-')` or `part.type === 'dynamic-tool'`). If so, it calls `onTasksChanged`, which triggers a task list refetch in the dashboard. Timeline and calendar views update immediately after tools like `add_task`, `modify_schedule`, or `regenerate_schedule` complete—no manual page reload needed.

## Message Persistence

Messages are persisted to the Discussion model (type: "project") after each exchange. The API route's `onFinish` callback saves both the user message and assistant response. The last 15 messages are sent to Claude for conversation history; the system prompt covers long-term knowledge.
