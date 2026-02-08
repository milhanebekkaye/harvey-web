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
├── types.ts                # Shared TypeScript types
├── README.md               # This file
└── tools/
    ├── modifySchedule.ts   # Move/resize tasks
    ├── updateConstraints.ts # Change availability
    ├── addTask.ts          # Add new tasks with slot-finding
    ├── suggestNextAction.ts # "What should I do?" data
    ├── getProgressSummary.ts # Progress stats
    ├── regenerateSchedule.ts # Rebuild schedule
    └── updateProjectNotes.ts # Harvey's memory

src/app/api/chat/project/
└── route.ts                # Streaming API endpoint
```

## Context Assembly

`assembleProjectChatContext(projectId, userId)` is called for EVERY message. It:

1. Fetches the Project with all Tasks from the database
2. Fetches the User (for name, timezone)
3. Computes task statistics (completion rate, today's tasks, skip patterns)
4. Builds a system prompt with:
   - Harvey's personality instructions
   - Current date/time in user's timezone
   - Project info (title, description, goals, status)
   - User constraints (available time, blocked time, one-off blocks)
   - Full task schedule with IDs (so Claude can reference tasks)
   - Progress statistics
   - Harvey's accumulated notes about the user
   - Tool usage instructions

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
| `add_task` | "Add a 2h task for..." | Yes — creates Task |
| `suggest_next_action` | "What should I do?" | No — read-only |
| `get_progress_summary` | "How am I doing?" | No — read-only |
| `regenerate_schedule` | "Rebuild my schedule" | Yes — updates Tasks |
| `update_project_notes` | (Harvey decides internally) | Yes — updates Project.projectNotes |

## Frontend Integration

The `ChatSidebar` component uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport` pointed at `/api/chat/project`. When Harvey's response includes a tool call, the `onTasksChanged` callback triggers a task list refetch in the dashboard.

## Message Persistence

Messages are persisted to the Discussion model (type: "project") after each exchange. The API route's `onFinish` callback saves both the user message and assistant response. The last 15 messages are sent to Claude for conversation history; the system prompt covers long-term knowledge.
