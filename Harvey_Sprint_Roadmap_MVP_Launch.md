# Harvey — MVP Launch Sprint Roadmap
## Wednesday Feb 11 → Sunday Feb 15

---

## Where We Stand

Features 1, 2, 3, and 7 are done: streaming, post-onboarding chat router, task feedback collection, and daily check-in. The core loop works — onboard → generate schedule → track tasks → Harvey responds in chat. 

**The problem now:** Harvey's data foundation is shallow. The rescheduling logic runs but produces incoherent results. The onboarding extracts basics but misses rich context that everything else depends on. There's no settings page. There's no way to see what Harvey knows. And the UI still looks like a first draft.

**The goal of this sprint:** Ship a product you're proud to post on LinkedIn. Every task below makes Harvey feel like a real product, not a prototype.

---

## Build Order and Dependencies

| # | Task | Depends On | Est. Time | Parallel? |
|---|------|------------|-----------|-----------|
| A | Improve data extraction schema + onboarding prompt | Nothing | 2h | No — do first |
| B | Settings & Preferences edit page | Nothing | 3h | No |
| C | Project Details page (what Harvey knows) | Task A | 2h | No |
| D | Project Shadow — live extraction panel during onboarding | Tasks A + C | 4h | No |
| E | Onboarding Progress Bar | Nothing | 1h | Yes (with D) |
| F | Rescheduling — redesign logic + implementation | Feature 2 + Feature 3 | 5h | No |
| G | Per-Task Chat (Discussion with type='task') | Feature 2 | 3h | No |
| H | Next Action Card UI | Feature 2 (suggest_next_action tool) | 2h | No |
| I | Wire per-task chat to Next Action Card | Tasks G + H | 1h | No |
| J | Cost optimization (Haiku routing + context compression) | All features done | 3h | No |
| K | UI Polish | All features done | 3h | No |
| L | End-to-end test + critical bug fixes | Everything | 2h | No |

**Total estimated:** ~31 hours across 5 days. At 8h/day you have buffer for debugging, which you will need.

---

## Feature Specifications

---

### Task A: Improve Data Extraction Schema + Onboarding Prompt
**Estimated time: 2h**

**What it is:** Extend what Harvey extracts and stores during onboarding, without changing the onboarding UI. Right now Harvey captures basics (work schedule, availability, project title). This upgrade makes Harvey capture everything it needs to be genuinely useful downstream — for per-task chat context, for rescheduling, for the project shadow panel.

**Why first:** Every feature that follows reads from this data. Per-task chat needs skill level and stack. Rescheduling needs accurate constraint representation. Project Shadow needs fields to display. Building on a shallow schema means every downstream feature underperforms. Fix the foundation first.

**What to add to the Project model:**
```
goals              String?    // "Ship MVP and get 10 users by March"
target_deadline    DateTime?  // extracted from conversation
skill_level        String?    // "beginner", "intermediate", "advanced"
tools_and_stack    String[]   // ["Next.js", "Supabase", "Cursor"]
project_type       String?    // "web app", "mobile app", "SaaS", "content", etc.
weekly_hours_commitment  Int? // hours user commits per week
motivation         String?    // why they're building this — feeds coaching tone
```

**What to add to the User model (if not already there):**
```
timezone           String     // critical — currently causing bugs
preferred_session_length  Int?  // minutes — how long user likes to work at a stretch
communication_style  String?  // "direct", "encouraging", "detailed"
```

**Onboarding prompt changes:** Extend the extraction system prompt to explicitly instruct Claude to extract and output these new fields. Claude should probe for: what's their goal with the project, what's their tech background, what tools they already use, what's driving them to build this. These feel like natural coaching questions, not a form — Harvey should surface them conversationally within the existing onboarding flow.

**Key constraint:** Don't change the onboarding UI yet — that's Task D. Just improve what gets stored when Claude processes the conversation.

---

### Task B: Settings & Preferences Edit Page
**Estimated time: 3h**

**What it is:** A full settings page accessible from the dashboard header where users can edit everything Harvey knows about their constraints and preferences. Currently there is no UI for this at all — if a user's schedule changes after onboarding, they're stuck.

**Why this matters:** This is a release blocker. Without it, any user whose life doesn't perfectly match their onboarding answers has no way to correct Harvey. This will be every user by day 3.

**Page structure:**

*Work Schedule section:*
- Work days (checkboxes Mon-Sun)
- Work start time / end time
- Commute morning duration + start time
- Commute evening duration + start time

*Availability Windows section:*
- List of availability blocks (day of week, start, end, type: work/personal/flexible)
- Add / remove blocks
- Each block editable inline

*Preferences section:*
- Morning person / Evening person toggle
- Rest days (multi-select)
- Preferred session length (15 / 30 / 60 / 90 / 120 min)
- Communication style (Direct & Brief / Encouraging / Detailed)

*Project section (link to Project Details page — Task C):*
- Just a link/button here, not duplicating fields

**Access point:** Settings gear icon in the dashboard header, top right. One click, full-page view or side panel — your call on the design.

**On save:** Changes persist to DB and Harvey uses them from the next conversation forward. For the sake of MVP, no need to retroactively rebuild the schedule when constraints change — Harvey just uses new constraints on next schedule generation or rescheduling.

---

### Task C: Project Details Page — What Harvey Knows
**Estimated time: 2h**

**What it is:** A dedicated page (or panel) where the user can see and edit everything Harvey has extracted about their project: title, description, goals, deadline, skill level, tools, weekly commitment. Read and edit mode.

**Why it matters:** Users need to trust Harvey. If Harvey is making decisions based on extracted context, users need to be able to see and correct that context. This is also the UI layer that makes Task A (richer data extraction) visible and useful.

**Layout:**
- Project header: Title (editable) + status badge
- Two columns or sections:
  - **Project Info:** Description, Goals, Target Deadline, Project Type
  - **Your Context:** Skill Level, Tools/Stack, Weekly Hours, Motivation
- Each field: display mode by default, click to edit inline, save on blur or explicit save button
- Bottom: "Last updated by Harvey" timestamp

**Access point:** Accessible from the dashboard — either a tab in the sidebar, a link from the header, or clicking the project name at the top of the timeline. Pick the most natural placement given your current UI.

**Connection to Settings:** Settings page (Task B) handles user-level constraints (schedule, availability). This page handles project-level context. They're siblings, not duplicates.

---

### Task D: Project Shadow — Live Extraction Panel During Onboarding
**Estimated time: 4h**

**What it is:** During onboarding, the right half of the screen shows a live card that fills in as Harvey extracts information from the conversation. The user sees Harvey building understanding in real-time — project title appears, then goals, then schedule blocks — each with a subtle animation as it's extracted.

**Why it matters:** Two reasons. First, pure UX — it transforms onboarding from "answering questions in a void" to "watching Harvey understand you." This is the first impression. Second, practical — it replaces the current end-of-conversation recap message and gives the user a chance to see and correct extracted data before schedule generation.

**How extraction works without extra API cost:**

Use Claude tool calling within the streaming response. Define an `update_project_shadow` tool. When Harvey extracts something from the user's message, it calls this tool as part of the same streamed response — zero additional API calls.

```
Tool: update_project_shadow
Parameters:
  field: string  // "project_title" | "goals" | "deadline" | "work_schedule" | etc.
  value: any
```

The frontend receives these tool calls in the stream and updates the shadow panel in real-time. Same response, richer output.

**UI Layout:**
```
┌──────────────────────┬──────────────────────────┐
│                      │   Harvey's Knowledge      │
│   Chat (left)        │                           │
│                      │  Project Info             │
│  Harvey: "What are   │  ✓ Title: Harvey AI       │
│  you building?"      │  ✓ Goals: Ship MVP by...  │
│                      │  ○ Deadline: —            │
│  You: "An AI coach"  │                           │
│                      │  Your Schedule            │
│                      │  ✓ Work: Mon-Fri 9-5:30   │
│                      │  ○ Available blocks: —    │
│                      │                           │
│                      │  Preferences              │
│                      │  ○ Morning/evening: —     │
│                      │  ○ Rest days: —           │
│                      │                           │
│                      │  [Build my schedule ✨]   │
│                      │  (active when 4/5 filled) │
└──────────────────────┴──────────────────────────┘
```

**Fields to display (from Task A schema):**
- Project Info: title, description, goals, deadline, project type
- Your Schedule: work hours, commute, available windows, weekly commitment
- Preferences: morning/evening, rest days, session length, tools/stack

**"Build my schedule" button:** Disabled until minimum fields are filled (project title + description/goals + at least one availability window + weekly hours). Once active, the button is the primary CTA at the bottom of the shadow panel. This replaces the current trigger mechanism.

**Each field in the panel is editable:** Click → inline edit → saves immediately. User can correct misheard information without re-typing it in chat.

**End of onboarding:** The shadow panel IS the recap. Harvey says "I've got everything I need. Ready to build your schedule?" — two buttons: "Build my schedule" (prominent) and "Keep chatting" (secondary). No more recap message in the chat thread.

---

### Task E: Onboarding Progress Bar
**Estimated time: 1h**

**What it is:** A simple progress indicator during onboarding showing how much Harvey has extracted.

**Implementation:** Track which of the 5 required fields have been extracted: project title, description/goals, at least one availability window, weekly hours, deadline (or "no deadline"). Show a bar: "Harvey's Knowledge: 3/5 essentials gathered — Almost ready to build." Updates in real-time as the shadow panel fills. Can be built independently of Task D but lives in the same onboarding UI.

**Works as a standalone bar even if Project Shadow (Task D) takes longer than estimated.** Ship E as soon as D starts, they share the same onboarding screen but E is just a progress bar component.

---

### Task F: Rescheduling — Redesigned Logic + Implementation
**Estimated time: 5h**

**What it is:** The ability to reorganize the schedule when reality breaks the plan. Currently the rescheduling function exists but produces incoherent results — tasks get moved to nonsensical slots.

**Why it's hard:** Rescheduling isn't just "slide tasks forward." It requires understanding available windows, task duration, existing fixed tasks, and dependencies. A naive implementation creates conflicts. This task is about getting the logic right before worrying about UI.

**The core rescheduling algorithm:**

When rescheduling task X, Harvey must:
1. Find all available slots from now until the end of the schedule period that are: within the user's availability windows, long enough for task X's estimated duration, not already occupied by another pending/completed task
2. Sort those slots by: proximity to original scheduled time (prefer sooner), day-of-week patterns from user behavior if available
3. Propose the top 2-3 options to the user (never auto-reschedule silently)
4. On user confirmation: update task's scheduled_date, scheduled_start_time, scheduled_end_time in DB
5. If the skipped task had dependents: identify them, check if their current slots are still valid, flag or cascade-reschedule them

**The "slide everything" fallacy:** Don't just push all tasks forward by N days. That creates pile-ups and ignores rest days, work schedules, and existing bookings. Each displaced task needs to find its own valid slot independently.

**Two triggers:**

*Trigger 1 — Proactive on dashboard load:*
When the user opens Harvey with skipped tasks from previous days, the daily check-in (Feature 7) message includes: "You have [X] unfinished tasks. Want me to find new slots for them?" Two actions: [Find new slots] [Move to backlog]. If "Find new slots" → run the rescheduling algorithm for each skipped task → Harvey presents a summary of proposed changes in chat → user confirms → DB updates. If "Move to backlog" → tasks get `status: 'backlog'` and move out of the main timeline into a collapsible Backlog section at the bottom.

*Trigger 2 — Chat-triggered:*
User says "I fell behind" or "rebuild my schedule" → `regenerate_schedule` tool fires → full rebuild. Completed tasks: locked. Skipped + pending tasks: rescheduled using the algorithm above, respecting all remaining available slots in the schedule period. Harvey returns a summary: "I've rescheduled 4 tasks. Here's what changed." Calendar updates.

**Important UX rule:** Never auto-reschedule silently. Always show the user what will change and ask for confirmation. Harvey is a coach, not a bot that moves things around without telling you.

**Backlog section:** A collapsible section at the bottom of the timeline showing tasks with `status: 'backlog'`. User can click any backlog task and ask Harvey to schedule it: "Schedule this for next week" → Harvey finds a slot and moves it back into the main timeline.

**Database addition:** Add `generation_id: String?` to the Task model so tasks can be grouped by which schedule generation created them. Useful for showing "Schedule 1: 8/12 completed" vs "Schedule 2: in progress" once Schedule Regeneration (Feature 8) is built later.

---

### Task G: Per-Task Chat (Discussion with type='task')
**Estimated time: 3h**

**What it is:** Each task gets its own conversation thread with Harvey, scoped to that specific task. When the user needs help executing a task — not scheduling it, but actually doing it — they open the task's thread and ask. Harvey has full context about the project, the task, and the user without them needing to re-explain anything.

**Why this matters:** This is how you currently use Claude — creating a new conversation for each task in a Claude project. Harvey should replace that workflow entirely by having all context pre-loaded. No more copying project descriptions into a chat window.

**Data model — use existing Discussion model with a new type:**
```
Discussion {
  ...existing fields...
  type: 'onboarding' | 'project' | 'task'  // ADD THIS
  task_id: String?  // FK to Task, only set when type='task'
}
```

One Discussion per task, created on first "Ask Harvey" click. This avoids creating a new model and keeps all conversation logic in one place.

**Where it appears in UI:**
- Every task card in the timeline gets an "Ask Harvey" button (secondary action alongside Complete/Skip)
- Clicking it switches the chat sidebar to that task's discussion thread
- A breadcrumb or label at the top of the sidebar shows which context you're in: "Project Chat" vs "Task: Set up database"
- Clicking "Project Chat" in that breadcrumb returns to the main project discussion

**Context sent to Claude for every task chat message:**
```
System prompt includes:
- Project context (title, description, goals, tools, skill level)
- This task: title, description, success criteria, estimated duration, label, status
- Task dependencies: what this depends on, what depends on this
- Adjacent tasks: what came before, what comes next in the schedule
- User context: timezone, communication style, relevant constraints
- Previous messages in this task's discussion thread (full history, it's scoped so it won't grow huge)
```

The system prompt explicitly says: "This conversation is about the task: [title]. Help the user execute this task. Don't reschedule, don't discuss other tasks unless directly relevant."

**Harvey's opening message:** When a task discussion is opened for the first time, Harvey sends a proactive message automatically: "Ready to tackle [task title]? This is a [estimated duration] task. [One concrete suggestion for how to start based on task description]." This makes the feature feel alive immediately.

---

### Task H: Next Action Card UI
**Estimated time: 2h**

**What it is:** A prominent card at the very top of the timeline/dashboard — above the task list — showing the single most important thing to do right now. Not the full schedule. Not a list. One card, one action, maximum clarity.

**Why this is the highest-value UI element:** This is the core Harvey promise. User opens the app, sees: "Your next task is tonight at 9pm: Set up the database — 2h. You have 3h 20min until then." Decision paralysis eliminated in one glance.

**Display logic:**
1. Is there a task scheduled right now (current time falls within scheduled window)? → Show it as "IN PROGRESS" with elapsed time
2. No current task, but tasks scheduled later today? → Show next one with countdown: "In 3h 20min — Set up the database (2h)"
3. No more tasks today but tasks tomorrow? → "You're done for today. Tomorrow starts with [task] at [time]"
4. All tasks completed? → "Schedule complete. Ask Harvey to plan your next batch."
5. No schedule yet? → "No tasks scheduled. Ask Harvey to build your schedule."

**Card contents:**
- Task title (prominent)
- Time slot + duration
- Label pill (color-coded)
- Countdown or "Now" indicator
- [Start / Ask Harvey] button — opens task's discussion thread (Task G)
- Secondary action: "I have [15 / 30 / 60] min free" → triggers `suggest_next_action` tool in the chat router

**Design:** This card should feel different from the rest of the timeline. It's the hero element. Give it more visual weight — larger, maybe a subtle gradient or shadow. References: the "Up next" card in Apple Music, the priority task in Linear.

---

### Task I: Wire Per-Task Chat to Next Action Card
**Estimated time: 1h**

**What it is:** Connect Tasks G and H so clicking "Start" on the Next Action Card opens that task's discussion thread in the chat sidebar and Harvey sends the proactive opening message.

**Why it matters:** Without this connection, per-task chat is a feature users have to discover. With it, the daily flow becomes: open Harvey → see Next Action Card → click Start → Harvey says "Ready to tackle [task]? Here's how I'd approach it" → user executes. That's the full coaching loop in action.

**Implementation:** The "Start" button on the Next Action Card should: 1) visually highlight the task in the timeline, 2) switch the chat sidebar to the task's discussion thread, 3) trigger Harvey's proactive opening message if this is the first time the thread is opened. If the thread already exists (user has used it before), just switch context without resending the opening message.

---

### Task J: Cost Optimization
**Estimated time: 3h**

**What it is:** Audit every API call Harvey makes and route cheap operations to Haiku, expensive ones to Sonnet. Add conversation summarization to prevent token bloat over time.

**Why this matters:** At $0 revenue with 10 users, API costs compound fast. The goal is to make Harvey affordable to run at early scale without cutting quality where it matters.

**Model routing strategy:**

Use **Claude Haiku** for:
- Daily check-in message generation (simple, formulaic)
- Task label assignment during schedule generation
- Progress summary (`get_progress_summary` tool)
- `suggest_next_action` responses (context-aware but not complex)
- Onboarding shadow field extraction (tool calls only, no long reasoning)

Use **Claude Sonnet** for:
- Schedule generation (quality matters, this is the first impression)
- Full rescheduling / `regenerate_schedule` (complex constraint reasoning)
- Per-task chat (user is asking for real help, quality matters)
- `modify_schedule` (involves understanding user intent + constraint conflicts)

**Conversation summarization:** When a project discussion exceeds 25 messages, trigger a Haiku call to compress the message history into a structured summary that gets prepended to the system prompt and replaces the raw message array. Format:
```
Conversation summary (messages 1-25):
- User is building a Next.js web app for personal productivity
- Has 2h/evening available Monday-Thursday
- Skipped Tuesday task twice due to tiredness — Harvey suggested moving hard tasks to Thursday
- Completed 6/8 tasks in first week, feedback shows tasks take ~20% longer than estimated
```
The chat router already sends the last 20-30 messages — with summarization, old context stays accessible in compressed form while new messages stay raw.

**Token audit:** Log estimated token counts per API call type during development. Build a simple `/api/debug/token-usage` endpoint that shows average tokens per call type. This gives you visibility to catch regressions.

**Target:** 60-70% cost reduction vs current approach at the same quality level for user-facing outputs.

---

### Task K: UI Polish
**Estimated time: 3h**

**What it is:** Targeted visual improvements to make Harvey feel like a product people would pay for, not a hackathon demo. This is not a redesign — it's removing the "AI-generated default" feel through specific, surgical changes.

**What to fix (in priority order):**

*Task cards:* The title needs more visual weight. Time display and label pill should be on the same line. Status border on the left should be thicker (3-4px, not 1-2px) — it's the fastest visual signal users have.

*Chat sidebar:* The Harvey header at the top is probably too generic. Add the constraint pills (e.g. "9-5:30 Work" "8-10pm Available") below the header — these make the sidebar feel like Harvey knows you specifically, not a generic chatbot.

*Task completion interaction:* The confetti on task complete should feel more satisfying. If it's currently a basic CSS animation, upgrade it. This is a micro-moment of positive reinforcement — make it land.

*Calendar mode task blocks:* Text inside calendar blocks should be readable at small sizes. Title + time on two lines, truncated with ellipsis if needed. Color saturation should be slightly lower than what Cursor generates by default — feels more professional.

*Typography consistency:* Audit heading sizes across the app. There should be a clear visual hierarchy: page title > section header > task title > metadata. If everything is the same size, nothing has priority.

*Empty states:* Every section should have a thoughtful empty state. "No tasks today" with a Harvey tip. "Backlog is empty" with encouragement. Empty states are underrated first impressions.

**What not to touch:** The core layout (40/60 split), the color system (it's defined and it works), the loading animation. Don't redesign things that work — fix what visually underperforms.

---

### Task L: End-to-End Test + Critical Bug Fixes
**Estimated time: 2h**

**What it is:** Full walkthrough of Harvey as a brand new user, documenting every friction point and bug.

**Test script:**
1. Sign up with Google → onboarding starts
2. Watch Project Shadow fill as you answer questions → verify all fields extract correctly
3. Click "Build my schedule" → verify generation works
4. Dashboard loads → Next Action Card shows correct task
5. Complete a task → feedback prompt appears → Harvey acknowledges in chat
6. Skip a task → skip reason recorded → Harvey offers to reschedule
7. Accept reschedule → verify new slot is logical and conflict-free
8. Open per-task chat on a task → Harvey sends proactive message
9. Ask Harvey "what should I do now?" in project chat → suggest_next_action responds correctly
10. Go to Settings → change availability window → save
11. Go to Project Details → edit a field → save
12. Ask in chat: "I fell behind, rebuild my schedule" → verify regenerate_schedule produces coherent output

**For each step:** Note what breaks, what feels slow, what's confusing. Categorize bugs as: Critical (blocks core flow), Important (degrades experience), Polish (cosmetic). Fix all Critical and Important before Sunday. Document Polish bugs for post-launch.

---

## Key Architecture Decisions (Reference)

**Discussion model handles all chat contexts.** Onboarding, project chat, and per-task chat all use the same Discussion model with a `type` field. No new models needed for per-task chat.

**Tool calling for Project Shadow.** Shadow panel extraction uses Claude tool calls within the existing streaming response — zero extra API cost. The same stream that produces Harvey's conversational reply also fires `update_project_shadow` tool calls that the frontend catches and renders.

**Rescheduling is slot-finding, not sliding.** Each task that needs rescheduling independently searches for valid slots within the user's availability windows. Naive "push everything forward N days" is explicitly not the approach.

**Model routing is explicit, not automatic.** Every API call in the codebase specifies which model it uses and why. Don't let model choice be implicit or default. Document the routing decision in a comment next to every `anthropic.messages.create()` call.

**Harvey suggests, user decides.** No auto-rescheduling, no silent changes. Every adaptation Harvey proposes must be confirmed by the user before DB writes happen.

---

## How to Use This Document

When starting a task, copy the relevant task specification and give it to Cursor alongside:
1. The relevant existing code files
2. The current Prisma schema
3. Any specific bugs or edge cases from testing

Work task by task in the order listed in the Build Order table. Don't start Task G (per-task chat) until Task C (project details) exists, because the context assembly depends on the richer data model.

When you finish a task, run the partial test flow before moving to the next one. Don't stack 3 unverified tasks and debug them together — that's how you lose a full day.
