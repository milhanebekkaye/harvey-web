# Harvey — Post-Onboarding Features Roadmap

## Where We Stand

Harvey has a functional MVP: authentication (Google OAuth + email), conversational onboarding where Harvey asks questions about the user's project and constraints, AI-powered schedule generation that creates specific executable tasks with time blocks, and a dual-view dashboard (timeline + calendar) displaying tasks with complete/skip actions.

The core flow works: sign up → chat with Harvey → get a schedule → see your tasks.

**The problem:** Harvey dies after the first schedule generation. The chat sidebar is decorative post-onboarding. Completing or skipping a task is a dead-end action — no feedback, no adaptation, no reason to come back. Harvey is currently a one-time schedule generator, not an accountability coach.

**The goal of this roadmap:** Make Harvey a living, responsive project partner that users interact with daily. Every feature below serves one purpose — give users a reason to open Harvey every day and trust that Harvey knows them.

---

## Build Order and Dependencies

Features are ordered by **technical dependency** — what unblocks what — not by perceived importance. Some features are marked as quick wins that can be parallelized.

| # | Feature | Depends On | Parallel? |
|---|---------|------------|-----------|
| 1 | Streaming (Vercel AI SDK) | Nothing | No — do first |
| ⚡ | Task Labels | Nothing | Yes |
| ⚡ | Task Dependencies (DB schema) | Nothing | Yes |
| 2 | Post-Onboarding Chat Router | Streaming | No |
| 3 | Task Feedback (Skip/Complete) | Chat Router (for Harvey responses) | No |
| 4 | Rescheduling | Chat Router + Task Feedback | No |
| 5 | Per-Task Chat | Streaming + Chat Router | No |
| ⚡ | "Next Action" UI Card | Chat Router (suggest_next_action tool) | Yes |
| 6 | Project Shadow (Onboarding Redesign) | Streaming | Can be parallelized |
| ⚡ | Onboarding Progress Bar | Nothing | Yes |
| 7 | Daily Check-In (In-App) | Chat Router + Task Feedback | No |
| 8 | Schedule Regeneration (New Batch) | Rescheduling logic | No |

---

## Feature Specifications

---

### Feature 1: Streaming with Vercel AI SDK

**What it is:** Migrate all chat interactions from request/response to streaming, so Harvey's messages appear word-by-word like ChatGPT or Claude.

**Why it's first:** Every chat feature built after this (post-onboarding chat, per-task chat, daily check-ins, onboarding) uses streaming. Retrofitting later means rewriting every API route and every frontend chat component. Do it once now.

**Architecture decision:** Build ONE streaming chat infrastructure that handles all chat contexts. The API route accepts a `context` parameter indicating which mode Harvey is in (onboarding, project-chat, task-chat). Each frontend `useChat` instance is separate, but they share the same backend pattern.

**Key technical details:**
- Use `@ai-sdk/anthropic` + `ai` package from Vercel
- Backend: `streamText()` → `toDataStreamResponse()`
- Frontend: `useChat()` hook handles progressive rendering
- The current onboarding extraction (parsing constraints) should remain a separate non-streamed call triggered after Harvey's streamed response completes — don't mix extraction logic into the stream

**What changes:**
- Replace current chat API routes with streaming endpoints
- Replace current frontend chat rendering with `useChat` hook
- Verify onboarding still works with streaming (extraction runs after stream completes)
- All future chat features automatically inherit streaming

---

### Feature 2: Post-Onboarding Chat Router

**What it is:** Make the chat sidebar functional after schedule generation. Users can ask Harvey to modify the schedule, add tasks, check progress, and get recommendations — all through natural conversation.

**Why it matters:** This is the core architecture. Rescheduling, task additions, "what should I do now," daily check-ins — they all route through this system. Build the router once, add capabilities over time.

**Architecture: Tool-based routing with Claude function calling.**

Harvey's system prompt includes all project context, current schedule, task statuses, and user constraints. Claude decides which tool to call based on the user's message. No separate intent classifier needed — Claude IS the classifier.

**Tools to implement:**

| Tool | Trigger example | What it does |
|------|----------------|--------------|
| `modify_schedule` | "Move tonight's task to tomorrow" / "I can't work Fridays" | Updates task times or constraints, optionally triggers partial/full regen |
| `add_task` | "Add a task to set up Google Analytics, about 2h" | Creates new task, asks for time slot preference, inserts into schedule |
| `update_constraints` | "I can't work Fridays anymore" / "Change my evening window to 9-11pm" | Updates user constraints in DB |
| `suggest_next_action` | "What should I do now?" / "I have 30 minutes" | Analyzes current schedule, pending tasks, time available, suggests action |
| `get_progress_summary` | "How am I doing this week?" | Queries task completion data, returns summary stats |
| `regenerate_schedule` | "Rebuild my schedule" / "I need a fresh start" | Full schedule regeneration with current context |

**System prompt structure for post-onboarding chat:**

The system prompt sent to Claude with every message should include:
- Project info (title, description, goals, deadline)
- User constraints (work schedule, availability, preferences)
- Current schedule with statuses (completed/skipped/pending with dates and times)
- User behavioral patterns if available (completion rate, time estimation accuracy, skip patterns)
- Available tools with descriptions

**Chat scope decision:** One main chat per project for everything project-level. The user doesn't need to decide which "topic" to chat about — Harvey handles it all. The ONLY exception is per-task chat (Feature 5), which is a separate scoped thread.

**Message history:** Send the last 20-30 messages to Claude plus the structured context in the system prompt. The structured data covers what Claude needs to know long-term; the message history covers the recent conversation flow.

**Database:** Keep the existing Discussion model. One discussion per project for the main chat. No changes to the schema needed.

---

### Feature 3: Task Feedback (Skip/Complete Data Collection)

**What it is:** When a user completes or skips a task, Harvey collects structured feedback to inform future scheduling and rescheduling.

**Why it matters:** Without this data, rescheduling is blind and progressive learning is impossible. This is the raw input for everything adaptive about Harvey.

**On task completion:**
1. User clicks "Complete"
2. Quick inline prompt: "How long did this actually take?" — preset buttons (Less than planned / About right / Took longer) + optional exact minutes
3. Harvey acknowledges in chat: "Nice, that's 3/5 for today. Next up is [task] at 9pm."
4. Data stored on the task record

**On task skip:**
1. User clicks "Skip"
2. Small modal with quick-tap options: Too tired / Ran out of time / Task unclear / Not a priority / Other + optional free text
3. Harvey responds in chat: "Got it. Want me to reschedule this for later this week, or move it to backlog?"
4. If reschedule → suggest 2-3 available slots
5. If backlog → task gets a `backlog` status
6. Data stored on the task record

**Database additions to Task model:**

```
actual_duration     Int?       // minutes — actual time taken
completion_notes    String?    // optional notes
skip_reason         String?    // "too_tired", "too_long", "wrong_time", "not_relevant", "other"
skip_notes          String?    // free text explanation
started_at          DateTime?  // when user started
completed_at        DateTime?  // when user finished
```

Store directly on Task — 1:1 mapping, no need for a separate table. Pattern analysis (user typically underestimates by 30%) can be computed on-the-fly from task data via queries.

**Design principle:** Feedback collection must take less than 10 seconds. Quick-tap options, not text fields. If it feels like a form, people stop doing it.

---

### Feature 4: Rescheduling

**What it is:** The ability to reorganize the schedule when reality breaks the plan — individually per task, or as a full rebuild.

**Why it matters:** This is Harvey's core promise. "When reality breaks the plan, Harvey adapts." Without this, Harvey is a static calendar.

**Three triggers:**

1. **User asks in chat:** "Rebuild my schedule" / "I fell behind" → uses `regenerate_schedule` tool from the chat router
2. **Proactive after skips:** When user opens Harvey with 2+ skipped tasks from previous day, Harvey says: "You have unfinished tasks. Want me to reorganize?" — this check runs on dashboard load
3. **Schedule ends:** When approaching the last task date (2 days before), Harvey prompts: "Your schedule is almost done. Ready for the next batch?"

**Two modes:**

**Partial reschedule (moving specific tasks):** Harvey suggests 2-3 alternative time slots from available windows. No full regeneration. Fast, simple. This is the `modify_schedule` tool.

**Full reschedule (rebuild everything):** Reuses existing schedule generation logic with modified inputs:
- Completed tasks: locked, don't touch
- Skipped/pending tasks: need rescheduling
- Available time slots: remaining in schedule period
- Updated constraints from recent chat interactions
- Feedback data: if tasks consistently took longer than estimated, adjust future estimates

**Important UX decision:** Never auto-reschedule. Always ask first. "Harvey suggests, user decides" — that's coaching, not automation. Aggressive auto-rescheduling makes users feel out of control.

**Database addition:** Consider adding a `schedule_batch` or `generation_id` field to Task so tasks can be grouped by which generation created them. Useful for showing "Schedule 1: 8/12 completed" vs "Schedule 2: in progress."

---

### Feature 5: Per-Task Chat

**What it is:** Each task gets its own chat thread with Harvey, scoped to that specific task. When the user clicks on a task and asks for help, Harvey has full context about the project, the task, dependencies, and user patterns.

**Why it matters:** This is how the user currently uses Claude — creating a new discussion for each task in a Claude project. Harvey should replace this workflow by having the context built-in. No need to re-explain the project, the task, or the constraints. Just ask your question.

**Where it appears in the UI:** The sidebar gets tabs or a dropdown: "Project Chat" / "Task: Database Setup" / "Task: Competitor Research." Clicking "Ask Harvey" on a task opens (or creates) its dedicated thread in the sidebar. Same sidebar, different conversation threads.

**Context assembly for task chat:**

Every message in a task chat includes a system prompt with:
- Project context (title, description, goals)
- This specific task (title, description, success criteria, estimated duration, status, label)
- Task dependencies (what this task depends on, what depends on it)
- Related tasks in the schedule (what comes before and after)
- User context (skill level, tools, relevant constraints)
- Previous messages in this task's discussion

This context is assembled dynamically — not a static document. A function gathers current data and formats it each time.

**Scope enforcement:** The system prompt says "This conversation is about the task: [title]." No need for strict guardrails — users naturally stay on topic because they opened the task chat for a reason.

**Database model:**

```
model TaskDiscussion {
  id          String   @id
  task_id     String   (FK to Task)
  messages    Json     // array of {role, content, timestamp}
  created_at  DateTime
  updated_at  DateTime
}
```

One discussion per task. Created on first "Ask Harvey" click. Messages accumulate in the JSON array (same pattern as existing Discussion model).

---

### Feature 6: Project Shadow (Onboarding Redesign)

**What it is:** During onboarding, the right side of the screen shows a live-updating card displaying all information Harvey is extracting (constraints, project details, preferences). The user sees Harvey building understanding in real-time and can correct anything.

**Why it matters:** Makes onboarding feel progressive rather than tedious. The user sees that Harvey is listening. Also replaces the current end-of-conversation recap message with a persistent, editable widget.

**How real-time extraction works:**

Use Claude tool calling within the streaming response. Define an `update_project_shadow` tool. When Harvey learns something from the user's message, it calls the tool as part of its response:

```
Tools: update_project_shadow(field, value)
Fields: project_title, project_description, goals, deadline,
        work_schedule, available_hours, preferences, skills, etc.
```

User says "I work 9-5:30, 2 hour commute" → Harvey's response includes tool calls to update work_schedule and commute, plus the conversational reply. The frontend receives these tool calls and updates the shadow panel. **No extra API calls — same cost as current approach.**

**UI layout:**
- Left: Chat (same as current onboarding)
- Right: Progressive card with sections:
  - **Project Info:** Title, Description, Goals, Deadline, Skills
  - **Your Schedule:** Work hours, Commute, Available blocks
  - **Preferences:** Morning/evening, Rest days, Session length
- Each item appears with subtle animation when extracted
- Each item is editable (click to modify)
- Empty fields show as greyed-out placeholders

**End of onboarding:** Instead of a recap message in chat, the shadow panel becomes the recap. Two buttons at the bottom: "Build my schedule" (enabled when minimum fields are filled) and "Keep chatting" (always enabled).

**Minimum required for "Build my schedule" button to activate:** Project title, project description or goals, at least one availability window, weekly hours commitment. Everything else is optional enrichment.

---

### Feature 7: Daily Check-In (In-App)

**What it is:** When the user opens Harvey, the first thing they see is a contextual check-in message from Harvey based on time of day, today's tasks, and yesterday's results.

**Why it matters:** Creates the daily coaching loop. Without this, the user opens Harvey and sees a static schedule. With this, Harvey greets them with direction.

**How it works without push notifications:**

In-app only for now. When the dashboard loads, Harvey generates a contextual greeting:

- **Morning:** "Here's today: [3 tasks]. Your 9pm slot is usually your power hour — I put [hardest task] there."
- **Evening:** "How's today going? You've got [task] at 9pm still on the list."
- **After missed tasks:** "You have 2 tasks from yesterday. Want me to reschedule?"
- **After good streak:** "3 days in a row with 100% completion. You're on fire."

**Implementation:** On dashboard load, a function checks: time of day, today's task list, yesterday's completion status, recent patterns. It sends this context to Claude with a "generate a brief check-in message" instruction. The result appears as the first message in the chat sidebar (with a `type: 'check-in'` flag).

**Future extension:** Email digest (one email per day with today's tasks and a link to open Harvey). But this requires email infrastructure and is not the first step.

---

### Feature 8: Schedule Regeneration (New Batch)

**What it is:** When the current schedule ends or all tasks are completed, Harvey generates the next batch of tasks based on project progress.

**Why it matters:** Without this, Harvey is useful for exactly one schedule period. For any project longer than 1-2 weeks, this is mandatory.

**How it works:**

When approaching the end of the current schedule (2 days before last task), Harvey proactively says: "Your current schedule ends Thursday. Ready for the next batch?"

Harvey reviews:
- What was completed vs. skipped in the current batch
- Where the project stands based on original goals
- Time estimation accuracy from feedback data
- Any new constraints or preferences from recent conversations

Then generates the next batch of tasks. The conversation in the main chat provides context for what to focus on next. Harvey might ask: "Last week you finished the database setup. This week should we focus on the frontend, or the API?" — then generates accordingly.

**Key insight:** Each regeneration is progressively smarter. Harvey factors in actual completion rates, real task durations, and skip patterns. "Last week you planned 10h but did 6h. I'm calibrating this week accordingly."

**Database:** Tasks from different generations should be distinguishable. Add `generation_id` or `batch_number` to Task model so you can track "Schedule 1: 8/12 done" vs "Schedule 2: in progress."

---

### Quick Win: Task Labels

**What it is:** Every task gets a category label (coding, research, design, marketing, communication, personal) with a corresponding color tag shown on task cards.

**Implementation:** Add `label String?` to Task model. During schedule generation, Claude assigns a label to each task. Frontend shows a colored pill/tag on each task card.

**Predefined labels and colors:**
- Coding → Blue
- Research → Green  
- Design → Purple
- Marketing → Orange
- Communication → Yellow
- Personal → Grey
- Planning → Pink

---

### Quick Win: Task Dependencies (DB Schema)

**What it is:** Tasks can declare dependencies on other tasks, so Harvey knows that "Build authentication" must come after "Set up database."

**Implementation:** Add `depends_on String[]` to Task model — an array of task IDs. During schedule generation, Claude outputs dependencies as part of the task structure. During rescheduling, Harvey checks if moving a task breaks any dependency chain.

**How it helps:** When a task is skipped, Harvey knows which downstream tasks are also affected. "You skipped 'Set up database.' 'Build authentication' depends on it, so I'm moving that too."

---

### Quick Win: Onboarding Progress Bar

**What it is:** A visual indicator during onboarding showing how much Harvey knows and what's still needed.

**Implementation:** Track which required fields have been extracted (project title, description, availability, weekly hours). Show a progress bar: "Harvey's Knowledge: 60% — 3/5 essentials gathered." Updates in real-time as Harvey extracts information.

**Works well with Project Shadow** but can be built independently as a simpler version (just the bar, no full shadow panel).

---

### Quick Win: "Next Action" UI Card

**What it is:** A prominent card on the dashboard showing the single most important thing to do right now, instead of overwhelming the user with the full timeline.

**Implementation:** Above the timeline/calendar, display a card: current or next scheduled task with full details, a "Start" button, and a quick-action: "I have [15/30/60 min], what else can I do?"

**Depends on:** The `suggest_next_action` tool from the chat router (Feature 2) being functional.

**Logic for what to show:**
1. Is there a task scheduled right now? → Show it
2. No current task? → Show next upcoming task with countdown
3. All today's tasks done? → Show tomorrow's first task or a "You're done for today" message
4. User asks for alternative → trigger `suggest_next_action` with available time

---

## Key Architecture Decisions (Reference)

**One main chat per project.** No topic splitting. Harvey handles everything in one conversation thread. Per-task chat is the only exception (separate scoped threads).

**Tool-based routing.** Claude decides which tool to call based on user intent. No custom intent classifier. Define tools, let Claude be the classifier.

**Feedback stored on Task model.** No separate tables. 1:1 mapping. Pattern analysis computed via queries when needed.

**Dynamic context assembly.** System prompts are built dynamically for each message, pulling current project data, task statuses, user constraints, and patterns. Not static documents.

**Streaming everywhere.** Vercel AI SDK is the foundation. Every chat context (onboarding, project chat, task chat) uses the same streaming infrastructure.

---

## How to Use This Document

When starting work on a specific feature, copy the relevant feature section and provide it as context to your AI coding assistant (Cursor, Claude Code, Codex). Combine it with:
1. The relevant existing code files
2. The current database schema
3. Any specific questions or edge cases

This gives the assistant full context on WHAT to build and WHY, so you can focus conversations on HOW.
