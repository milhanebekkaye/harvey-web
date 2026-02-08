# Feature 2: Post-Onboarding Chat Router — Complete Implementation Guide

> **Purpose:** This document contains EVERYTHING needed to implement Feature 2 in one shot. Read the ENTIRE document before writing any code. Then come up with a plan and present it to me for validation before executing.

---

## 1. WHAT THIS FEATURE IS

Make the chat sidebar functional AFTER schedule generation. Right now, once onboarding finishes and the schedule is generated, the chat is dead — users can't interact with Harvey anymore. This feature turns the chat into a living interface where users can:

- Ask Harvey to modify tasks ("move tonight's task to tomorrow")
- Update their constraints ("I can't work Fridays anymore")
- Add new tasks ("add a 2h task for setting up Google Analytics")
- Ask what to do next ("I have 30 minutes, what should I work on?")
- Get progress summaries ("how am I doing this week?")
- Request a full reschedule ("rebuild my schedule")
- Ask project-related questions that DON'T require tools ("what's the best way to implement auth in Next.js?")

Harvey is a coach, not just a tool dispatcher. Many messages will be conversational — project advice, motivation, strategy discussion. Claude decides when to use a tool and when to just talk.

---

## 2. ARCHITECTURE OVERVIEW

### 2.1 How it works

1. User types a message in the chat sidebar (post-onboarding)
2. Frontend sends message to a NEW streaming API route: `/api/chat/project`
3. Backend builds a **dynamic system prompt** with full project context (constraints, tasks, notes, stats)
4. Backend sends message + system prompt + tool definitions to Claude API via Vercel AI SDK streaming
5. Claude either responds conversationally (Category B) or calls a tool (Category A)
6. If tool called → backend executes the tool function → returns result to Claude → Claude responds to user with the outcome
7. Frontend renders streamed response in the chat sidebar

### 2.2 Two categories of responses

**Category A — Tool calls:** Claude detects the user wants to DO something (modify schedule, add task, update constraints, etc.) and calls the appropriate tool. The backend executes it, returns structured data, Claude explains what happened.

**Category B — Conversational:** Claude detects the user is asking a question, seeking advice, venting, discussing strategy, or anything that doesn't require a database mutation. Claude responds using the project context in its system prompt. NO tool call needed.

Examples of Category B:
- "What's the best way to implement auth in Next.js?"
- "Should I focus on frontend or backend first?"
- "I'm feeling stuck on the database design"
- "How long do you think this project will take?"
- "Thanks Harvey, that's really helpful"

**Claude decides which category.** No custom intent classifier. The system prompt instructs Claude on when to use tools vs when to just talk.

### 2.3 Key architecture decisions

- **One main chat per project.** The existing Discussion model with `type: "project"` handles this.
- **Tool-based routing.** Claude IS the router. Define tools with clear descriptions, Claude decides which to call.
- **Dynamic context assembly.** System prompt is rebuilt for EVERY message from live DB data. Not a static document.
- **Streaming everywhere.** Use Vercel AI SDK (`@ai-sdk/anthropic` + `ai` package). `streamText()` on backend, `useChat()` on frontend.

---

## 3. SCHEMA MIGRATION (DO THIS FIRST)

### 3.1 Changes to Task model

Add these fields:

```prisma
model Task {
  // ... existing fields ...
  
  // Feedback fields (for Feature 3, but add columns now to avoid double migration)
  actualDuration    Int?       // minutes — how long the task actually took
  completionNotes   String?    // optional notes the user adds on completion
  skipReason        String?    // "too_tired" | "ran_out_of_time" | "task_unclear" | "not_priority" | "other"
  skipNotes         String?    // free text explanation for skip
  startedAt         DateTime?  // when user started working on this task
  
  // Batch tracking
  batchNumber       Int        @default(1)  // which schedule generation created this task
}
```

### 3.2 Changes to Project model

Add these fields:

```prisma
model Project {
  // ... existing fields ...
  
  projectNotes      String?    // qualitative insights Harvey remembers — plain text, NOT JSON
  generationCount   Int        @default(1)  // how many schedule generations have occurred
}
```

### 3.3 Changes to Discussion model

Add these fields:

```prisma
model Discussion {
  // ... existing fields ...
  
  type    String   @default("project")  // "project" | "onboarding" | "task"
  taskId  String?  // only set when type = "task" — FK to Task id
}
```

### 3.4 Changes to contextData structure (on Project)

The existing `contextData` JSON field on Project needs to support one-off time blocks. Add `one_off_blocks` to the structure. DO NOT change existing data — just ensure the code handles this new optional array:

```typescript
// Updated contextData type
interface ContextData {
  available_time: Array<{
    days: string[];
    start: string;  // "20:00"
    end: string;    // "23:00"
    label?: string;
  }>;
  blocked_time: Array<{
    days: string[];
    start: string;
    end: string;
    label?: string;
  }>;
  one_off_blocks?: Array<{  // NEW — temporary exceptions
    date: string;           // "2026-02-14" — specific date
    date_start?: string;    // for ranges
    date_end?: string;      // for ranges
    start_time?: string;    // "19:00" — null if all_day
    end_time?: string;      // "23:00" — null if all_day
    all_day: boolean;
    reason?: string;        // "Valentine's dinner"
  }>;
  preferences: Record<string, any>;
  exclusions?: string[];
  schedule_duration_weeks?: number;
}
```

### 3.5 User model fields

The User model has fields `availabilityWindows`, `workSchedule`, `commute` that are currently UNUSED. Leave them in the schema but do NOT use them for this feature. `contextData` on Project is the single source of truth for all constraints.

### 3.6 Migration execution

Run `npx prisma migrate dev --name add-chat-router-fields` after updating schema.prisma. Then `npx prisma generate`.

---

## 4. CONTEXT ASSEMBLY FUNCTION

This is the most important function in the feature. It builds the system prompt that Claude receives with every message. Create this as a separate utility file.

**File:** `src/lib/chat/assembleContext.ts` (or wherever the project keeps utility functions — adapt to existing file structure)

### 4.1 What it queries

```typescript
async function assembleProjectChatContext(projectId: string, userId: string): Promise<string> {
  // 1. Fetch project with all related data
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true }
  });
  
  // 2. Fetch user (for timezone, name)
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  // 3. Compute stats from tasks
  const stats = computeTaskStats(project.tasks);
  
  // 4. Build and return system prompt string
  return buildSystemPrompt(project, user, stats);
}
```

### 4.2 Stats computation

```typescript
function computeTaskStats(tasks: Task[]) {
  const completed = tasks.filter(t => t.status === 'completed');
  const skipped = tasks.filter(t => t.status === 'skipped');
  const pending = tasks.filter(t => t.status === 'pending');
  
  // Today's tasks
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.scheduledDate?.toISOString().split('T')[0] === today);
  
  // Completion rate
  const totalActioned = completed.length + skipped.length;
  const completionRate = totalActioned > 0 ? Math.round((completed.length / totalActioned) * 100) : 0;
  
  // Time estimation accuracy (only for completed tasks with actual duration)
  const withActual = completed.filter(t => t.actualDuration != null);
  const avgAccuracy = withActual.length > 0
    ? withActual.reduce((acc, t) => acc + (t.actualDuration! / t.estimatedDuration), 0) / withActual.length
    : null;
  
  // Common skip reasons
  const skipReasons = skipped
    .filter(t => t.skipReason)
    .reduce((acc, t) => {
      acc[t.skipReason!] = (acc[t.skipReason!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  
  return {
    total: tasks.length,
    completed: completed.length,
    skipped: skipped.length,
    pending: pending.length,
    todayTasks,
    completionRate,
    avgAccuracy,
    skipReasons,
    currentBatch: Math.max(...tasks.map(t => t.batchNumber), 1)
  };
}
```

### 4.3 System prompt template

This is the FULL system prompt Claude receives. Build it as a template string. Inject live data.

```typescript
function buildSystemPrompt(project: Project, user: User, stats: TaskStats): string {
  const contextData = project.contextData as ContextData;
  const now = new Date();
  const userTimezone = user.timezone || 'Europe/Paris';
  
  // Format current time in user's timezone
  const localTime = now.toLocaleString('en-US', { timeZone: userTimezone });
  const localDate = now.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  return `
You are Harvey, an AI project coach. You help ${user.name || 'the user'} stay on track with their project by managing their schedule, providing advice, and acting as an accountability partner.

## Your personality
- Direct and action-oriented. You give clear direction, not vague suggestions.
- Encouraging but honest. Celebrate wins, acknowledge struggles, don't sugarcoat.
- You speak like a knowledgeable friend who happens to be great at project management.
- Keep messages concise. 2-4 sentences for simple responses. Longer only when the user asks for detailed advice.
- Use the user's name occasionally but not every message.

## Current context
- Current date and time: ${localDate}, ${localTime} (timezone: ${userTimezone})
- User: ${user.name || 'User'}

## Project information
- Title: ${project.title}
- Description: ${project.description || 'No description'}
- Goals: ${project.goals || 'No specific goals set'}
- Status: ${project.status}
- Current schedule batch: #${stats.currentBatch} (${project.generationCount} total generations)

## User constraints
${formatConstraints(contextData)}

## Current schedule
${formatTasks(stats.todayTasks, 'today', userTimezone)}
${formatAllTasks(project.tasks, userTimezone)}

## Progress stats
- Overall: ${stats.completed}/${stats.total} tasks completed (${stats.completionRate}% completion rate)
- Skipped: ${stats.skipped} tasks
- Pending: ${stats.pending} tasks
${stats.avgAccuracy ? `- Time estimation accuracy: tasks take ${Math.round(stats.avgAccuracy * 100)}% of estimated time on average` : ''}
${Object.keys(stats.skipReasons).length > 0 ? `- Common skip reasons: ${Object.entries(stats.skipReasons).map(([reason, count]) => `${reason} (${count}x)`).join(', ')}` : ''}

## Harvey's notes about this user
${project.projectNotes || 'No notes yet — this is a new user.'}

## Your capabilities
You can respond in two ways:

1. **Use a tool** when the user wants to change something (modify tasks, update constraints, add tasks, reschedule, etc.). Call the appropriate tool, wait for the result, then explain what you did.

2. **Respond conversationally** when the user asks questions, seeks advice, wants to discuss strategy, or is just chatting. Use the project context above to give informed, personalized answers. You are a knowledgeable coach — give real advice about their project domain when you can.

IMPORTANT: Not every message needs a tool. If the user is asking a question or having a conversation, just respond. Only call tools when the user wants you to DO something to their schedule or data.

IMPORTANT: When you use a tool, ALWAYS explain what you did in plain language after the tool executes. Don't just silently make changes.

IMPORTANT: After updating constraints, ask the user if they want you to rebuild the schedule with the new constraints.

IMPORTANT: When calling update_project_notes, only do so when you learn something genuinely new and important about the user's preferences, patterns, or project direction. Do NOT call it on every message.
`.trim();
}
```

### 4.4 Helper formatting functions

```typescript
function formatConstraints(contextData: ContextData): string {
  let result = '';
  
  if (contextData.available_time?.length) {
    result += 'Available time:\n';
    contextData.available_time.forEach(slot => {
      result += `  - ${slot.days.join(', ')}: ${slot.start}–${slot.end}${slot.label ? ` (${slot.label})` : ''}\n`;
    });
  }
  
  if (contextData.blocked_time?.length) {
    result += 'Blocked time:\n';
    contextData.blocked_time.forEach(slot => {
      result += `  - ${slot.days.join(', ')}: ${slot.start}–${slot.end}${slot.label ? ` (${slot.label})` : ''}\n`;
    });
  }
  
  if (contextData.one_off_blocks?.length) {
    // Only show future one-off blocks
    const future = contextData.one_off_blocks.filter(b => new Date(b.date || b.date_end || '') >= new Date());
    if (future.length) {
      result += 'Temporary blocks:\n';
      future.forEach(block => {
        if (block.all_day) {
          result += `  - ${block.date}: All day${block.reason ? ` (${block.reason})` : ''}\n`;
        } else {
          result += `  - ${block.date}: ${block.start_time}–${block.end_time}${block.reason ? ` (${block.reason})` : ''}\n`;
        }
      });
    }
  }
  
  if (contextData.preferences) {
    result += 'Preferences:\n';
    Object.entries(contextData.preferences).forEach(([key, value]) => {
      result += `  - ${key}: ${value}\n`;
    });
  }
  
  return result || 'No constraints set.';
}

function formatTasks(tasks: Task[], label: string, timezone: string): string {
  if (!tasks.length) return `No tasks ${label}.`;
  
  let result = `Tasks ${label}:\n`;
  tasks
    .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))
    .forEach(task => {
      const status = task.status.toUpperCase();
      const time = task.scheduledStartTime && task.scheduledEndTime 
        ? `${task.scheduledStartTime}–${task.scheduledEndTime}` 
        : `${task.estimatedDuration}min`;
      const label = task.label ? `[${task.label}]` : '';
      const deps = task.dependsOn?.length ? ` (depends on: ${task.dependsOn.join(', ')})` : '';
      result += `  - "${task.title}" | ${time} | ${status} | ${task.estimatedDuration}min est. ${label}${deps}\n`;
    });
  
  return result;
}

function formatAllTasks(tasks: Task[], timezone: string): string {
  // Group tasks by date
  const grouped = tasks.reduce((acc, task) => {
    const date = task.scheduledDate?.toISOString().split('T')[0] || 'unscheduled';
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, Task[]>);
  
  let result = 'Full schedule:\n';
  Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, tasks]) => {
      result += `\n  ${date}:\n`;
      tasks
        .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))
        .forEach(task => {
          const status = task.status === 'completed' ? '✓' : task.status === 'skipped' ? '✗' : '○';
          const time = task.scheduledStartTime && task.scheduledEndTime 
            ? `${task.scheduledStartTime}–${task.scheduledEndTime}` 
            : '';
          result += `    ${status} "${task.title}" ${time} (${task.estimatedDuration}min) [${task.status}]\n`;
        });
    });
  
  return result;
}
```

**IMPORTANT:** Adapt field names to match the ACTUAL Prisma schema field names in the codebase. The names above (scheduledStartTime, scheduledEndTime, etc.) are illustrative — use whatever the current schema uses. Check `schema.prisma` for exact field names.

---

## 5. TOOL DEFINITIONS

Define these as Vercel AI SDK tools. Each tool has a Zod schema for parameters and an `execute` function.

### 5.1 Tool: `modify_schedule`

**When Claude calls it:** User wants to move, resize, or change a specific task.

```typescript
{
  name: 'modify_schedule',
  description: 'Move or resize a specific task in the schedule. Use when the user wants to change when a task happens or how long it takes. Check for dependency conflicts before confirming.',
  parameters: z.object({
    task_id: z.string().describe('The ID of the task to modify'),
    new_date: z.string().optional().describe('New date in YYYY-MM-DD format'),
    new_start_time: z.string().optional().describe('New start time in HH:MM 24h format'),
    new_end_time: z.string().optional().describe('New end time in HH:MM 24h format'),
    new_duration: z.number().optional().describe('New duration in minutes'),
  }),
  execute: async ({ task_id, new_date, new_start_time, new_end_time, new_duration }) => {
    // 1. Fetch the task
    // 2. If new_date or new_start_time provided, check for conflicts with other tasks in that slot
    // 3. Check dependency constraints:
    //    - If this task depends on others, are those scheduled BEFORE the new date/time?
    //    - If other tasks depend on this one, are they scheduled AFTER the new date/time?
    // 4. If conflicts or broken dependencies, return error with details
    // 5. Otherwise, update the task and return success
    // Return: { success: boolean, message: string, conflicts?: string[], dependency_issues?: string[] }
  }
}
```

### 5.2 Tool: `update_constraints`

**When Claude calls it:** User wants to change their availability, block time, or update preferences. Handles both permanent recurring changes and one-off temporary blocks.

```typescript
{
  name: 'update_constraints',
  description: 'Update user availability or scheduling constraints. Use for permanent changes (e.g., "I don\'t work Fridays anymore") or one-off blocks (e.g., "I can\'t work this Friday"). After updating, ask the user if they want to rebuild the schedule.',
  parameters: z.object({
    change_type: z.enum(['permanent', 'one_off']).describe('Whether this is a recurring change or a one-time block'),
    action: z.enum(['add', 'remove', 'modify']).describe('What action to take on the constraint'),
    constraint_type: z.enum(['available_time', 'blocked_time', 'preference']).describe('Which type of constraint to change'),
    description: z.string().describe('Natural language description of the change, e.g. "Remove all Friday availability" or "Block Feb 14 evening"'),
    // One-off specific fields
    date: z.string().optional().describe('Specific date for one-off blocks: YYYY-MM-DD'),
    date_start: z.string().optional().describe('Start date for one-off range'),
    date_end: z.string().optional().describe('End date for one-off range'),
    time_start: z.string().optional().describe('Start time in HH:MM 24h format'),
    time_end: z.string().optional().describe('End time in HH:MM 24h format'),
    all_day: z.boolean().optional().describe('Whether this blocks the entire day'),
  }),
  execute: async (params) => {
    // 1. Fetch the project's contextData
    // 2. Based on change_type:
    //    - "permanent": modify available_time or blocked_time arrays in contextData
    //    - "one_off": add to one_off_blocks array in contextData
    // 3. Based on action:
    //    - "add": push new entry to the appropriate array
    //    - "remove": filter out matching entries (match by days for permanent, by date for one-off)
    //    - "modify": find and update matching entry
    // 4. For permanent changes, use the description to figure out which days/times to add/remove.
    //    The backend function should be smart about parsing:
    //    - "Remove all Friday availability" → filter available_time entries to exclude Friday from their days arrays
    //    - "I can work Saturdays 10am-2pm" → add new available_time entry { days: ["Saturday"], start: "10:00", end: "14:00" }
    //    - "Change my evening window to 9-11pm" → find evening available_time entries, update start/end
    // 5. Save updated contextData to project
    // 6. Check how many pending tasks are affected by this change
    // Return: { success: boolean, message: string, affected_tasks_count: number }
  }
}
```

**Implementation note for the execute function:** The `description` field is the primary input. Use it to determine what to change. The structured fields (date, time_start, etc.) are supplementary — Claude will try to fill them, but the description is always present. Write the backend logic to handle the most common cases:

- "Remove Friday" / "No more Fridays" → remove Friday from all available_time days arrays, add to blocked_time
- "Block [date]" / "I can't work [date]" → add one_off_block
- "Change evening to 9-11pm" → find available_time entries that look like evening slots, update times
- "Add Saturday morning" → add new available_time entry

If the change is too ambiguous to parse programmatically, return `{ success: false, message: "I couldn't figure out exactly what to change. Can you be more specific?" }` and let Claude ask for clarification.

### 5.3 Tool: `add_task`

**When Claude calls it:** User wants to add a new task to their schedule.

```typescript
{
  name: 'add_task',
  description: 'Add a new task to the schedule. Find the best available time slot based on the user\'s constraints, task dependencies, and logical ordering. If the user specifies a preferred date/time, try to use it.',
  parameters: z.object({
    title: z.string().describe('Title of the new task'),
    description: z.string().optional().describe('Detailed description or success criteria'),
    estimated_duration: z.number().describe('Estimated duration in minutes'),
    label: z.string().optional().describe('Category: coding, research, design, marketing, communication, personal, planning'),
    depends_on: z.array(z.string()).optional().describe('Array of task IDs this task depends on'),
    preferred_date: z.string().optional().describe('Preferred date in YYYY-MM-DD if user specified'),
    preferred_time: z.string().optional().describe('Preferred start time in HH:MM if user specified'),
    placement_hint: z.string().optional().describe('Logical placement: "before task_id_xxx", "as_early_as_possible", "end_of_week", "after task_id_xxx"'),
  }),
  execute: async (params) => {
    // 1. Get all existing tasks for the project
    // 2. Get contextData for availability
    // 3. If preferred_date and preferred_time provided, check if slot is available
    // 4. If placement_hint provided:
    //    - "before task_id_xxx" → find the date of that task, find available slot before it
    //    - "as_early_as_possible" → find first available slot from today
    //    - "after task_id_xxx" → find slot after that task
    // 5. If neither specified, find the earliest available slot that:
    //    - Falls within user's available_time windows
    //    - Doesn't conflict with existing tasks
    //    - Doesn't conflict with one_off_blocks
    //    - Respects dependencies (if depends_on is set, must come after those tasks)
    //    - Has enough contiguous time for the estimated_duration
    // 6. Create the task in DB with the found slot
    // 7. Assign current batchNumber from project
    // Return: { success: boolean, task: { id, title, scheduled_date, scheduled_start_time, scheduled_end_time }, message: string }
    // If no slot found: { success: false, message: "No available slot found this week. Want me to suggest alternatives?" }
  }
}
```

### 5.4 Tool: `suggest_next_action`

**When Claude calls it:** User asks "what should I do now?" or "I have 30 minutes." Claude gets structured data about current state and then reasons about the best recommendation.

```typescript
{
  name: 'suggest_next_action',
  description: 'Get structured data about the current schedule state to recommend what the user should do next. Use when the user asks what to work on, has free time, or needs direction.',
  parameters: z.object({
    available_minutes: z.number().optional().describe('How many minutes the user has available, if they specified'),
    context: z.string().optional().describe('Any additional context from the user about what they want to do'),
  }),
  execute: async ({ available_minutes, context }) => {
    // 1. Get current time in user's timezone
    // 2. Find current or next pending task for today
    // 3. Find any overdue/skipped tasks from previous days
    // 4. Calculate remaining available time today based on constraints
    // 5. If available_minutes provided, find tasks or sub-tasks that fit
    // Return structured data for Claude to reason about:
    // {
    //   current_task: { title, start_time, end_time, description } | null,
    //   next_task: { title, start_time, description } | null,
    //   overdue_tasks: [{ title, original_date, description }],
    //   remaining_time_today_minutes: number,
    //   tasks_completed_today: number,
    //   tasks_remaining_today: number,
    //   suggestion_context: string  // any relevant notes from projectNotes
    // }
    // Claude will use this data to compose a personalized recommendation.
    // The recommendation can include unscheduled prep work — Claude decides.
  }
}
```

### 5.5 Tool: `get_progress_summary`

**When Claude calls it:** User asks how they're doing. Keep this SIMPLE for now.

```typescript
{
  name: 'get_progress_summary',
  description: 'Get simple progress statistics for the current project schedule. Use when the user asks about their progress or how the week is going.',
  parameters: z.object({
    period: z.enum(['today', 'this_week', 'all']).optional().default('this_week').describe('Time period for the summary'),
  }),
  execute: async ({ period }) => {
    // 1. Filter tasks by period
    // 2. Count completed, skipped, pending
    // 3. Compute completion rate
    // Return: { period, total, completed, skipped, pending, completion_rate_percent }
    // That's it. Keep it simple. Claude formats this conversationally.
  }
}
```

### 5.6 Tool: `regenerate_schedule`

**When Claude calls it:** User wants their schedule rebuilt. This is a NEW function — NOT the same as the initial schedule generation.

```typescript
{
  name: 'regenerate_schedule',
  description: 'Rebuild the schedule for remaining tasks. Completed tasks are locked. Skipped and pending tasks get reassigned to available time slots. Uses feedback data (actual durations, skip patterns) to improve estimates. This is NOT a fresh start — it preserves progress.',
  parameters: z.object({
    scope: z.enum(['remaining', 'full_rebuild']).describe('"remaining" keeps completed tasks and reschedules the rest. "full_rebuild" starts from scratch using the original project description.'),
    focus_area: z.string().optional().describe('What to prioritize in the new schedule, e.g. "frontend" or "API"'),
    notes: z.string().optional().describe('Any additional context for the regeneration'),
  }),
  execute: async ({ scope, focus_area, notes }) => {
    if (scope === 'full_rebuild') {
      // Use existing schedule generation function (the one from onboarding)
      // Pass the project's discussion, contextData, and goals
      // Increment project.generationCount
      // Set new batchNumber on all new tasks
      // Return: { success, message, new_task_count }
    }
    
    if (scope === 'remaining') {
      // NEW RESCHEDULING LOGIC:
      // 1. Fetch all tasks for the project
      // 2. Separate into: completed (LOCKED), skipped + pending (TO RESCHEDULE)
      // 3. Get available time slots from contextData (minus one_off_blocks)
      // 4. Filter out time slots that are in the past
      // 5. Adjust time estimates based on feedback:
      //    - If user has actualDuration data, compute average accuracy ratio
      //    - Apply ratio to remaining task estimates (e.g., if tasks take 120% of estimated, inflate by 1.2)
      // 6. Respect dependencies: task order must be maintained
      // 7. Assign new dates/times to pending+skipped tasks within available slots
      // 8. Update tasks in DB
      // 9. Increment project.generationCount, set new batchNumber on rescheduled tasks
      // Return: { success, message, rescheduled_count, locked_count }
      
      // IMPORTANT: The actual task reassignment can use Claude!
      // Send the list of tasks to reschedule + available slots to Claude
      // and ask it to assign optimal times. This is the same pattern
      // as initial schedule generation but with different inputs.
      // OR you can do it algorithmically (simpler, faster, cheaper):
      // Sort tasks by dependency order, then assign greedily to earliest available slots.
      // Start with the algorithmic approach. We can add Claude-powered rescheduling later.
    }
  }
}
```

**Implementation approach for `remaining` scope:** Start with a simple greedy algorithm:

1. Sort reschedulable tasks by: dependency order first, then original scheduled date, then priority
2. Get all available time slots from now until the end of the schedule period
3. Subtract already-completed-task time slots and one_off_blocks
4. For each task, find the earliest slot that fits its (adjusted) duration
5. Assign and update

This is fast, cheap (no Claude API call), and good enough for MVP. Claude-powered smart rescheduling can come later.

### 5.7 Tool: `update_project_notes`

**When Claude calls it:** Harvey learns something worth remembering about the user. NOT on every message — only on genuine insights.

```typescript
{
  name: 'update_project_notes',
  description: 'Store an important insight about the user or their project for future reference. Only call this when you learn something genuinely new about their preferences, work patterns, or project direction. Do NOT call this on every message.',
  parameters: z.object({
    note: z.string().describe('The insight to remember, e.g. "User prefers 1h coding blocks" or "Wants to focus on frontend before API"'),
    action: z.enum(['append', 'replace']).default('append').describe('"append" adds to existing notes, "replace" overwrites them'),
  }),
  execute: async ({ note, action }) => {
    // 1. Fetch project
    // 2. If action === 'append': concatenate note to existing projectNotes with newline and timestamp
    //    Format: "[2026-02-07] User prefers 1h coding blocks"
    // 3. If action === 'replace': overwrite projectNotes entirely
    // 4. Cap total length at 2000 characters. If exceeding, trim oldest entries.
    // 5. Save to DB
    // Return: { success: boolean, message: string }
  }
}
```

---

## 6. API ROUTE

Create a new streaming API route for post-onboarding chat.

**File:** `src/app/api/chat/project/route.ts` (adapt path to existing project structure)

### 6.1 Route structure

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { assembleProjectChatContext } from '@/lib/chat/assembleContext';
// Import all tool execute functions

export async function POST(req: Request) {
  // 1. Authenticate user (use existing auth pattern from the codebase)
  // 2. Parse request body: { messages, projectId }
  // 3. Assemble dynamic context
  const systemPrompt = await assembleProjectChatContext(projectId, userId);
  
  // 4. Define tools with Vercel AI SDK format
  const tools = {
    modify_schedule: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    update_constraints: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    add_task: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    suggest_next_action: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    get_progress_summary: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    regenerate_schedule: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
    update_project_notes: { description: '...', parameters: z.object({...}), execute: async (params) => {...} },
  };
  
  // 5. Stream response
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250514'),
    system: systemPrompt,
    messages,  // from request body — the conversation history
    tools,
    maxSteps: 3,  // allow up to 3 tool calls per turn (tool call → result → final response)
  });
  
  // 6. Return streaming response
  return result.toDataStreamResponse();
}
```

### 6.2 Message persistence

After the stream completes (or on each message), save messages to the Discussion model:

- Find or create the Discussion for this project with `type: "project"`
- Append user message and assistant response to the `messages` JSON array
- The frontend should handle this — after `useChat` receives the complete response, send a separate request to persist messages, OR handle it in the API route after streaming

**Look at how the existing onboarding chat saves messages and follow the same pattern.**

### 6.3 Message history for Claude

Send the last **15 messages** from the Discussion to Claude (plus the system prompt which has all the structured context). The system prompt covers long-term knowledge. Message history covers recent conversation flow.

Fetch these from the Discussion model before calling `streamText`. Merge with the incoming message from the request.

---

## 7. FRONTEND CHANGES

### 7.1 Chat sidebar — post-onboarding mode

The chat sidebar currently works during onboarding. After schedule generation, it needs to switch to "project chat" mode.

**Detection logic:** If the project has a generated schedule (tasks exist and schedule was generated), the chat sidebar should:
- Use `useChat()` hook pointed at `/api/chat/project`
- Load existing messages from the Discussion with `type: "project"`
- Allow the user to type new messages
- Render streamed responses with Harvey's avatar

**Implementation using Vercel AI SDK `useChat` hook:**

```typescript
import { useChat } from 'ai/react';

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat/project',
  body: { projectId },
  initialMessages: existingMessages,  // loaded from Discussion
});
```

### 7.2 What triggers schedule UI updates

When a tool executes successfully and modifies tasks or schedule data, the frontend needs to refresh the timeline/calendar view. Options:

**Option A (simple — recommended for now):** After the streamed response completes (when `isLoading` becomes false), refetch the task list. If the response included a tool call, the data likely changed. A simple `router.refresh()` or React Query invalidation works.

**Option B (real-time):** Use Supabase Realtime to subscribe to task changes. More complex but instant updates. Save for later.

Go with Option A. After each assistant message, if it contained a tool call result, invalidate the task query cache or trigger a refetch.

### 7.3 Chat message rendering

For messages that include tool call results, render them nicely:
- Show Harvey's conversational response as normal chat bubble
- If a tool was called, optionally show a small inline indicator: "✓ Task moved to tomorrow" or "✓ Schedule rebuilt (8 tasks rescheduled)"
- Don't show raw tool call parameters to the user

### 7.4 No changes to onboarding flow

The existing onboarding chat flow should NOT be affected. The onboarding flow uses its own API route and logic. This feature ONLY adds the post-onboarding chat capability. Make sure the two don't conflict.

---

## 8. FILE STRUCTURE

Create these new files (adapt paths to existing project structure):

```
src/
├── lib/
│   └── chat/
│       ├── assembleContext.ts      // Context assembly function (Section 4)
│       ├── tools/
│       │   ├── modifySchedule.ts   // Tool: modify_schedule execute function
│       │   ├── updateConstraints.ts // Tool: update_constraints execute function
│       │   ├── addTask.ts          // Tool: add_task execute function
│       │   ├── suggestNextAction.ts // Tool: suggest_next_action execute function
│       │   ├── getProgressSummary.ts // Tool: get_progress_summary execute function
│       │   ├── regenerateSchedule.ts // Tool: regenerate_schedule execute function
│       │   └── updateProjectNotes.ts // Tool: update_project_notes execute function
│       └── types.ts                // Shared types (ContextData, etc.)
├── app/
│   └── api/
│       └── chat/
│           └── project/
│               └── route.ts        // Streaming API route (Section 6)
```

**IMPORTANT:** Look at the existing file structure first. If the project uses a different pattern (e.g., `server/` folder, `utils/` instead of `lib/`, different route structure), follow the existing conventions. The paths above are suggestions — match the codebase.

---

## 9. PACKAGES TO INSTALL

```bash
npm install ai @ai-sdk/anthropic zod
```

Check if these are already installed first. The project may already have some of them. `ai` is the Vercel AI SDK. `@ai-sdk/anthropic` is the Anthropic provider. `zod` is for tool parameter validation.

---

## 10. TESTING CHECKLIST

After implementation, test these scenarios:

**Category A (Tool calls):**
1. "Move tonight's task to tomorrow" → should call modify_schedule, update task, show confirmation
2. "I can't work this Friday" → should call update_constraints with change_type "one_off", then ask about rebuilding
3. "I don't want to work Fridays anymore" → should call update_constraints with change_type "permanent"
4. "Add a 2h task for setting up Google Analytics" → should call add_task, find best slot, create task
5. "What should I do now?" → should call suggest_next_action, give personalized recommendation
6. "How am I doing this week?" → should call get_progress_summary, give conversational stats
7. "Rebuild my schedule" → should call regenerate_schedule with scope "remaining"

**Category B (Conversational):**
8. "What's the best way to implement auth in Next.js?" → should just answer, no tool call
9. "Should I focus on frontend or backend first?" → should give project-specific advice using context
10. "I'm feeling stuck" → should encourage and suggest next steps, maybe call suggest_next_action

**Edge cases:**
11. Moving a task that has dependencies → should warn about broken chain
12. Adding a task when no slots available → should report and suggest alternatives
13. Multiple tool calls in one turn → maxSteps: 3 should handle this

---

## 11. IMPORTANT IMPLEMENTATION NOTES

1. **Check existing code patterns.** Before writing new code, look at how existing API routes work, how auth is handled, how Prisma queries are structured, how the frontend fetches data. Match those patterns exactly.

2. **Timezone handling.** The project already dealt with timezone issues (Marseille UTC+1). Make sure all date/time comparisons in tool execute functions use the user's timezone. Check how existing code handles this and follow the same approach.

3. **Error handling.** Every tool execute function should be wrapped in try/catch. Return `{ success: false, message: "Error description" }` on failure. Claude will explain the error to the user conversationally.

4. **Don't break onboarding.** The existing onboarding flow (chat → extraction → schedule generation) must continue to work exactly as before. This feature ONLY adds the post-onboarding chat route. If onboarding uses a different API route, don't touch it.

5. **Don't refactor existing code.** Focus on adding new functionality. If you see something in the existing code that could be improved, note it but don't change it unless it's blocking this feature.

6. **Task ID references.** Claude will reference tasks by their title in conversation (because that's how users talk). But tool calls need the actual task ID. The system prompt includes task IDs alongside titles in the schedule section. Claude should match the user's description to the right task ID when calling a tool. If ambiguous, Claude should ask: "Do you mean [task A] or [task B]?"

7. **contextData is JSONB.** When updating it, fetch the current value, modify it in JavaScript, and write the whole thing back. Don't try to do partial JSON updates in Prisma — read, modify, write.

8. **Existing schedule generation function.** For `regenerate_schedule` with scope "full_rebuild", look for the existing function that generates the initial schedule during onboarding. It likely takes the discussion/contextData as input and outputs tasks. Reuse that function. For scope "remaining", build the new greedy algorithm described in Section 5.6.

---

## 12. DOCUMENTATION AND LOGGING REQUIREMENTS

After completing all implementation work, you MUST do the following:

### 12.1 Changelog

Update `agent_ai_changelog.md` with a detailed entry for this feature. Include:
- Date of implementation
- Feature name: "Feature 2: Post-Onboarding Chat Router"
- Summary of what was built
- List of all new files created
- List of all existing files modified
- Database schema changes applied
- New packages installed
- Any known limitations or TODOs left for later

### 12.2 Architecture documentation

Update `architecture.md` with:
- Description of the chat router architecture (streaming, tool-based routing, dynamic context)
- The tool list with brief descriptions
- The context assembly flow (what data goes into the system prompt)
- The two response categories (tool calls vs conversational)
- How the post-onboarding chat differs from the onboarding chat
- The new API route and where it fits in the existing route structure

### 12.3 Code documentation

Add code-level documentation for this feature:
- JSDoc comments on all new exported functions (especially assembleProjectChatContext and each tool execute function)
- A README or doc file in the `chat/` folder explaining the chat router system, how to add new tools, and how context assembly works
- Inline comments on any non-obvious logic (especially in update_constraints parsing and regenerate_schedule algorithm)

---

## 13. PLAN MODE INSTRUCTIONS

Before writing any code, present a detailed implementation plan to me. The plan should include:

1. **Files to create** (full paths)
2. **Files to modify** (full paths + what changes)
3. **Order of operations** (what you'll do first, second, third...)
4. **Schema migration** (exact prisma changes)
5. **Packages to install**
6. **Any questions or ambiguities** you want clarified before starting

I will validate the plan. Only start coding after I approve.
