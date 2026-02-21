# Per-Task Chat Feature

## Overview

Per-task chat lets users open a dedicated Harvey conversation per task from the timeline. Step 1 is **UI only** (no API, no DB, no persistence). Step 2 will wire task chat API, persistence, and real Harvey responses.

## Step 1 Scope (Current)

### State (Dashboard)

- **`isPanelOpen`**: Whether the conversation navigation panel is visible.
- **`activeConversation`**: `'project'` or a task id (string). Drives which content the sidebar shows.
- **`openTaskChats`**: Array of `{ id, title, label }` for tasks the user has opened a chat for (in-session only).

### UI Components

- **ConversationNavPanel**: Overlay panel with Pinned (Project Chat), TASKS list, and static user row. No History section. Clicking an item switches conversation and closes the panel.
- **ProjectChatView**: Existing project chat (useChat, messages, project pill, rebuild, input). Used when `activeConversation === 'project'`.
- **TaskChatView**: Placeholder task chat: back link, task title, category pill, one hardcoded Harvey message, **disabled** input with tooltip "Task chat coming soon".
- **ChatSidebar**: Shell with dynamic header (Harvey AI or task title + "Task Chat"), conversations toggle, dim overlay when panel open, and either ProjectChatView or TaskChatView.

### Task Card

- **Ask Harvey** button on expanded task (with Complete, Skip). Outlined, purple, chat icon. Click: add task to `openTaskChats` if new, set `activeConversation` to task id, switch sidebar to TaskChatView (panel stays closed).
- Active task card (when its chat is open): purple ring/glow and small chat bubble badge top-right.

### Project Name

- Timeline header: "Project Timeline" + subtitle `[Project Name] • Week X of Y` (Week placeholder for Step 1).
- Sidebar (Project Chat): project context chip below project pill (folder icon + project name).

### What Step 1 Does Not Do

- No API calls, no DB reads/writes.
- No real Harvey responses in task chat (one hardcoded message only).
- No persistence across refresh (openTaskChats and activeConversation are React state only).
- No delete/close on task chat items.
- No History / "Previous 7 Days" section in the nav panel.
- Task chat input is disabled and not wired.

## Step 2 (Planned)

- Task chat API endpoint and persistence (e.g. Discussion type `task` + `taskId`).
- Load/save task chat messages; stream Harvey responses.
- Enable task chat input and wire to API.
- Optional: unread indicator, "Week X of Y" from project/schedule data.

## Files

| File | Purpose |
|------|--------|
| `src/components/dashboard/ConversationNavPanel.tsx` | Nav overlay: Pinned + TASKS + user row |
| `src/components/dashboard/ProjectChatView.tsx` | Project chat body (useChat, messages, rebuild) |
| `src/components/dashboard/TaskChatView.tsx` | Task chat placeholder UI |
| `src/components/dashboard/ChatSidebar.tsx` | Shell: header, overlay, panel, content switch |
| `src/app/dashboard/page.tsx` | State: isPanelOpen, activeConversation, openTaskChats; handlers |

## Design Tokens (Step 1)

- Primary: `#8B5CF6`
- Active nav item: `border-l-[3px] border-[#8B5CF6]`, `bg-[rgba(139,92,246,0.05)]`
- Task card active: `box-shadow: 0 0 0 2px rgba(139,92,246,0.3)`
- Nav panel: white, rounded-xl, shadow-lg, 300ms ease
