# Per-Task Chat Feature

## Overview

Per-task chat lets users open a dedicated Harvey conversation per task from the timeline. Step 1 was UI only. **Step 2** wires task chat to the database (create/get discussion, add message, list for refresh). No real Harvey response yet — Step 3 will add streaming.

## Step 1 Scope (Done)

- **State**: `isPanelOpen`, `activeConversation` ('project' | task id), `openTaskChats` (id, title, label).
- **UI**: ConversationNavPanel, TaskChatView placeholder (hardcoded message, disabled input), ChatSidebar content switch, "Ask Harvey" on task cards.

## Step 2 Scope (Done)

### Schema and API

- **Discussion** has `type` (default "project"), `taskId`, and **Task** relation; **Task** has `discussions Discussion[]`. Migration: `add_task_discussion_type`.
- **POST /api/discussions/task**: Body `{ taskId, projectId }`. Create or return existing task discussion (initial Harvey message stored in DB). Returns `{ discussion }`.
- **GET /api/discussions/task?taskId=**: Fetch task discussion; returns `{ discussion }` or `{ discussion: null }`.
- **POST /api/discussions/task/messages**: Body `{ discussionId, content }`. Append user message; no Harvey reply in Step 2.
- **GET /api/discussions/task/list?projectId=**: List task discussions for the project (for nav panel after refresh). Excludes discussions whose task was deleted.

### State (Dashboard)

- **`openTaskChats`**: Array of `{ id, title, label, discussionId? }`. Populated on "Ask Harvey" (POST create) and on load from list API.
- **handleAskHarvey**: Calls POST /api/discussions/task, stores `discussionId` in openTaskChats.
- On dashboard load: GET /api/discussions/task/list populates openTaskChats so task chats persist across refresh.

### TaskChatView

- **Props**: taskId, projectId, taskTitle, taskLabel, initialDiscussionId?, onBackToProject.
- **On mount**: GET /api/discussions/task?taskId= → set messages, discussionId, or `not_created` (show hardcoded message only).
- **Input**: Enabled when discussion exists. On send: optimistic append, POST /api/discussions/task/messages, "Harvey is thinking..." placeholder for 1.5s (Step 3 will replace with real streaming). On failure: inline error "Failed to save message. Try again."

### What Step 2 Does Not Do

- No Claude API, no real Harvey response, no streaming, no context assembly.

## Files

| File | Purpose |
|------|--------|
| `src/components/dashboard/ConversationNavPanel.tsx` | Nav overlay: Pinned + TASKS + user row (OpenTaskChat has optional discussionId) |
| `src/components/dashboard/ProjectChatView.tsx` | Project chat body (useChat, messages, rebuild) |
| `src/components/dashboard/TaskChatView.tsx` | Task chat: load discussion, messages, input, typing placeholder |
| `src/components/dashboard/ChatSidebar.tsx` | Shell: header, overlay, panel; passes taskId, projectId, discussionId to TaskChatView |
| `src/app/dashboard/page.tsx` | State: openTaskChats (with discussionId), handleAskHarvey (POST create), fetchTaskChatsList on load |
| `src/app/api/discussions/task/route.ts` | POST create/get, GET by taskId |
| `src/app/api/discussions/task/messages/route.ts` | POST append user message |
| `src/app/api/discussions/task/list/route.ts` | GET list by projectId |
| `src/lib/discussions/discussion-service.ts` | getTaskDiscussion, listTaskDiscussions |

## Design Tokens (Step 1)

- Primary: `#8B5CF6`
- Active nav item: `border-l-[3px] border-[#8B5CF6]`, `bg-[rgba(139,92,246,0.05)]`
- Task card active: `box-shadow: 0 0 0 2px rgba(139,92,246,0.3)`
- Nav panel: white, rounded-xl, shadow-lg, 300ms ease
