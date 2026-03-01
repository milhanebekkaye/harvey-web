# Harvey AI Cost Audit

**Update (2026-03-01):** Model configuration has been centralized. All Anthropic model references now use `src/lib/ai/models.ts` (`MODELS` constants). No model strings remain hardcoded in routes or libs. Task Chat was updated from deprecated Sonnet to Haiku via the same config.

---

## Section 1: Architecture Overview

**How is the Anthropic client instantiated?**
The Anthropic client is instantiated as a singleton in `src/lib/ai/claude-client.ts`. In a development environment, it attaches the client to `globalThis` to survive hot-reloads. In production, each cold start gets a single shared instance. 

**Where does it live?**
The singleton instance is exported from `src/lib/ai/claude-client.ts`.

**Files importing the Anthropic SDK or Vercel AI SDK:**
- `src/lib/ai/claude-client.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/checkin/route.ts`
- `src/app/api/chat/task/route.ts`
- `src/app/api/chat/project/route.ts`
- `src/app/api/onboarding/extract/route.ts`
- `src/app/api/tasks/tip/route.ts`
- `src/lib/schedule/schedule-generation.ts`
- `src/lib/schedule/task-scheduler.ts`
- `src/lib/ai/project-extraction.ts`
- `src/lib/chat/generateSuccessCriteria.ts`
- `src/lib/discussions/generate-task-opening-message.ts`
- `src/app/onboarding/page.tsx` (Frontend AI SDK transport)
- `src/components/dashboard/TaskChatView.tsx` (Frontend AI SDK transport)
- `src/components/dashboard/ProjectChatView.tsx` (Frontend AI SDK transport)

---

## Section 2: Complete API Call Inventory

### 1. Onboarding Chat
- **File & Route:** `src/app/api/chat/route.ts` (`POST /api/chat` with `context = 'onboarding'`)
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** Yes (`streamText`)
- **Trigger:** User sends a message during onboarding.
- **Estimated frequency:** 5–15 times per onboarding session.
- **System prompt:** dynamic, includes today's date, missing fields guidance, and known user/project info. ~300 tokens.
- **Conversation history:** The **entire** discussion history is sent. There is no truncation limit.
- **Dynamic context:** Fetches `Project` and `User` from DB, generates known info summary and missing fields guidance.
- **Estimated Input Tokens:** ~1,000 on average (grows with conversation length due to lack of truncation).
- **Estimated Output Tokens:** ~150.
- **Estimated Cost per call:** $0.0008 + $0.0006 = **$0.0014**

### 2. Onboarding Extraction
- **File & Route:** `src/app/api/onboarding/extract/route.ts` (`POST /api/onboarding/extract`)
- **Model:** `CLAUDE_CONFIG.model` (`claude-haiku-4-5-20251001`)
- **Streaming:** No (`anthropic.messages.create`)
- **Trigger:** Triggered automatically by the client **after every single Harvey response** during onboarding.
- **Estimated frequency:** 5–15 times per onboarding session.
- **System prompt:** Highly detailed JSON schema extraction prompt. ~900 tokens.
- **Conversation history:** The **entire** conversation text is concatenated and sent. No limit.
- **Dynamic context:** None (only previous confidence score).
- **Estimated Input Tokens:** ~1,500 on average (growing).
- **Estimated Output Tokens:** ~300.
- **Estimated Cost per call:** $0.0012 + $0.0012 = **$0.0024**

### 3. Schedule Constraints Extraction
- **File & Function:** `src/lib/schedule/schedule-generation.ts` (`extractConstraints`)
- **Model:** `CLAUDE_CONFIG.model` (`claude-haiku-4-5-20251001`)
- **Streaming:** No (`anthropic.messages.create`)
- **Trigger:** User clicks "Build Schedule" at the end of onboarding.
- **Estimated frequency:** 1 per session.
- **System prompt:** Detailed JSON extraction for time slots. ~700 tokens.
- **Conversation history:** Entire conversation text is sent.
- **Estimated Input Tokens:** ~2,000.
- **Estimated Output Tokens:** ~300.
- **Estimated Cost per call:** $0.0016 + $0.0012 = **$0.0028**

### 4. Task Generation
- **File & Function:** `src/lib/schedule/schedule-generation.ts` (`generateTasks`)
- **Model:** `CLAUDE_CONFIG.model` (`claude-haiku-4-5-20251001`)
- **Streaming:** No
- **Trigger:** User clicks "Build Schedule" at the end of onboarding.
- **Estimated frequency:** 1 per session.
- **System prompt:** Dynamic prompt generating task list, dependencies, and milestones. ~800 tokens.
- **Conversation history:** Entire conversation text.
- **Estimated Input Tokens:** ~2,500.
- **Estimated Output Tokens:** ~2,000.
- **Estimated Cost per call:** $0.0020 + $0.0080 = **$0.0100**

### 5. Task Scheduler (Slot Assignment)
- **File & Function:** `src/lib/schedule/task-scheduler.ts` (`assignTasksWithClaude`)
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** No
- **Trigger:** Happens immediately after task generation.
- **Estimated frequency:** 1–2 per session (retries on validation failure).
- **System prompt:** Contains JSON of project context, tasks, and slots. ~1,500 tokens.
- **Conversation history:** None.
- **Estimated Input Tokens:** ~1,500.
- **Estimated Output Tokens:** ~1,000.
- **Estimated Cost per call:** $0.0012 + $0.0040 = **$0.0052**

### 6. Schedule Coaching Message
- **File & Function:** `src/lib/schedule/schedule-generation.ts` (`generateScheduleCoachingMessage`)
- **Model:** `CLAUDE_CONFIG.model` (`claude-haiku-4-5-20251001`)
- **Streaming:** No
- **Trigger:** Generated once the schedule has been finalized.
- **Estimated frequency:** 1 per session.
- **System prompt:** Concise instructions for a 3-4 sentence summary. ~200 tokens.
- **Conversation history:** None.
- **Estimated Input Tokens:** ~300.
- **Estimated Output Tokens:** ~100.
- **Estimated Cost per call:** $0.00024 + $0.0004 = **$0.00064**

### 7. Project Chat
- **File & Route:** `src/app/api/chat/project/route.ts` (`POST /api/chat/project`)
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** Yes (`streamText` with 7 tools)
- **Trigger:** User sends a message in the Project dashboard chat.
- **Estimated frequency:** Varies (e.g., 2–5 per daily session).
- **System prompt:** Assembled by `assembleProjectChatContext`. Huge prompt containing all tasks for the next 7 days, user stats, and project notes. ~1,500 tokens.
- **Conversation history:** Truncated to the last `10` messages (`MAX_HISTORY_MESSAGES = 10`).
- **Dynamic context:** Live database query formatting the entire week's schedule.
- **Estimated Input Tokens:** ~2,500.
- **Estimated Output Tokens:** ~200.
- **Estimated Cost per call:** $0.0020 + $0.0008 = **$0.0028**

### 8. Task Chat
- **File & Route:** `src/app/api/chat/task/route.ts` (`POST /api/chat/task`)
- **Model:** `claude-sonnet-4-20250514` (Hardcoded)
- **Streaming:** Yes (`streamText`)
- **Trigger:** User sends a message in the individual task chat.
- **Estimated frequency:** Varies (e.g., 2–5 per daily session).
- **System prompt:** Built by `buildTaskChatContext`. Includes current task, dependencies, downstream tasks, and recent/upcoming schedule. ~600 tokens.
- **Conversation history:** Truncated to the last `20` messages (`MAX_HISTORY_MESSAGES = 20`).
- **Dynamic context:** Queries for behavioral patterns, task completion times, etc.
- **Estimated Input Tokens:** ~1,000.
- **Estimated Output Tokens:** ~150.
- **Estimated Cost per call (Sonnet!):** $0.0030 + $0.00225 = **$0.00525**

### 9. Daily Check-In
- **File & Route:** `src/app/api/chat/checkin/route.ts` (`POST /api/chat/checkin`)
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** Yes (`streamText`)
- **Trigger:** Page load on dashboard if rate limit allows (client-side limit of 3 hours).
- **Estimated frequency:** 1 per active day.
- **System prompt:** Very concise, contextual instructions. ~300 tokens.
- **Conversation history:** None.
- **Estimated Input Tokens:** ~350.
- **Estimated Output Tokens:** ~50.
- **Estimated Cost per call:** $0.00028 + $0.0002 = **$0.00048**

### 10. Task Tip (Timeline Tip)
- **File & Route:** `src/app/api/tasks/tip/route.ts` (`POST /api/tasks/tip`)
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** No
- **Trigger:** Task displayed on timeline for the first time.
- **Estimated frequency:** 1 per task (cached in DB `Task.harveyTip`).
- **System prompt:** ~100 tokens.
- **Conversation history:** None.
- **Estimated Input Tokens:** ~250.
- **Estimated Output Tokens:** ~50.
- **Estimated Cost per call:** $0.0002 + $0.0002 = **$0.0004**

### 11. Project Info Extraction
- **File & Function:** `src/lib/ai/project-extraction.ts` (`extractProjectInfo`)
- **Model:** `CLAUDE_CONFIG.model`
- **Streaming:** No
- **Trigger:** Assumed utilized during onboarding to prematurely extract title/description.
- **Estimated frequency:** Unclear, potentially 1 per session.
- **Estimated Input Tokens:** ~1,000.
- **Estimated Output Tokens:** ~50.
- **Estimated Cost per call:** **$0.0010**

### 12. Generate Success Criteria
- **File & Function:** `src/lib/chat/generateSuccessCriteria.ts`
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** No
- **Trigger:** When adding a task manually via chat.
- **Estimated Input Tokens:** ~300.
- **Estimated Output Tokens:** ~100.
- **Estimated Cost per call:** **$0.00064**

### 13. Task Opening Message
- **File & Function:** `src/lib/discussions/generate-task-opening-message.ts`
- **Model:** `claude-haiku-4-5-20251001`
- **Streaming:** No
- **Trigger:** When a Task chat is opened for the first time.
- **Estimated Input Tokens:** ~400.
- **Estimated Output Tokens:** ~50.
- **Estimated Cost per call:** **$0.00052**

---

## Section 3: Session Cost Estimate

**First-Time User Session (Onboarding + Schedule generation)**
- 10 Onboarding chat messages: ~$0.014
- 10 Onboarding extractions (triggered automatically): ~$0.024
- Schedule Extraction, Generation, and Coaching (1 call each): ~$0.014
- Task Scheduler (1 call): ~$0.005
- **Total Estimated Cost:** **~$0.057 per first-time user**

**Returning User Daily Session**
- 1 Daily Check-In: ~$0.0005
- 2 Task Tips (new tasks generated): ~$0.0008
- 2 Project Chat messages: ~$0.0056
- 2 Task Chat messages (uses Sonnet): ~$0.0105
- **Total Estimated Cost:** **~$0.017 per daily session**

**Monthly Cost (1 Active User, 5 days/week)**
- 20 daily sessions * $0.017 = ~$0.34
- One-time onboarding cost = ~$0.06
- **Estimated Monthly Cost:** **~$0.40 per active user**

---

## Section 4: Identified Cost Problems

### 1. API calls triggered on every page load unnecessarily (Onboarding Extraction)
- **Problem:** `POST /api/onboarding/extract` is called by the client *after every single Harvey response* during onboarding. This sends the entire growing conversation history to Claude every time just to update a JSON representation of the project state.
- **Extra Cost per session:** ~$0.024 (Accounts for ~40% of the entire onboarding cost).
- **Severity:** **High** (N² scaling issue as the conversation grows).

### 2. Conversation history sent without any truncation limit (Onboarding Chat)
- **Problem:** `src/app/api/chat/route.ts` passes the entire `existingMessages` array to Claude. Unlike Task Chat and Project Chat, which use `MAX_HISTORY_MESSAGES`, the onboarding chat grows indefinitely.
- **Extra Cost per session:** Tokens scale quadratically, potentially adding ~$0.010 for chat and exacerbating the extraction cost.
- **Severity:** **High**.

### 3. Sonnet used where Haiku would produce acceptable quality (Task Chat)
- **Problem:** `src/app/api/chat/task/route.ts` hardcodes `MODEL_ID = 'claude-sonnet-4-20250514'`. Task chats are simple, focused, and require very little deep reasoning.
- **Extra Cost per session:** ~$0.005 extra for just a couple of messages (Sonnet is nearly 4x the price of Haiku).
- **Severity:** **Medium**.

### 4. Repeated context assembly that could be cached (Project Chat)
- **Problem:** `assembleProjectChatContext` is evaluated on every single Project Chat message. It queries the database, computes stats, and serializes the schedule for the next 7 days.
- **Extra Cost per session:** Adds ~1,000–2,000 tokens of input to *every* Project Chat message, adding ~$0.001–$0.002 per turn.
- **Severity:** **Medium**.

---

## Section 5: Missing Infrastructure

- **Is there currently any token usage logging?**
  - **No.** The application does not store, log, or aggregate token usage or costs from the AI SDK or Anthropic responses.
- **Is there any rate limiting on API routes?**
  - **No.** There is only a client-side localStorage check for the daily check-in (`harvey_checkin_${projectId}`). There are no backend API rate limits.
- **Is there any conversation history truncation or summarization?**
  - **Yes and No.** Project Chat truncates to `10` messages, and Task Chat truncates to `20` messages. Onboarding Chat and Schedule generation tasks do **not** truncate or summarize the history.
- **Is there any caching of system prompts or context?**
  - **No.** System prompts (like `assembleProjectChatContext` and `buildTaskChatContext`) are rebuilt dynamically from the database for every single request. Only `Task.harveyTip` has DB-level caching.
- **Is there a single centralized place to change model names, or is it hardcoded in every file?**
  - **Yes.** All model identifiers are defined in `src/lib/ai/models.ts` and exported as `MODELS`. Every route and lib file imports the appropriate constant (e.g. `MODELS.ONBOARDING_CHAT`, `MODELS.TASK_CHAT`). To change a model globally, update it in `models.ts` only.

---

## Section 6: Proposed Model Routing Table

- **Onboarding Chat (`/api/chat`)**: **Keep Haiku**. Cost-effective and fast enough for simple conversational intake.
- **Onboarding Extraction (`/api/onboarding/extract`)**: **Keep Haiku**. JSON extraction performs well on Haiku, but the trigger frequency must be fixed.
- **Constraints Extraction (`extractConstraints`)**: **Keep Haiku**. Works well for identifying text patterns and outputting JSON.
- **Task Generation (`generateTasks`)**: **Keep Haiku**. Prompt is highly structured and Haiku has proven capable of outputting the JSON task arrays.
- **Schedule Coaching Message**: **Keep Haiku**. Simple 3-4 sentence text generation.
- **Task Scheduler (`assignTasksWithClaude`)**: **Keep Haiku**. Used heavily for JSON-based formatting and strict capacity math.
- **Project Chat (`/api/chat/project`)**: **Keep Haiku**. Capable of handling the 7 tool calls with acceptable reasoning at a fraction of the cost.
- **Task Chat (`/api/chat/task`)**: **SWITCH to Haiku**. Currently hardcoded to Sonnet. Task accountability is straightforward and does not justify Sonnet's premium pricing.
- **Daily Check-In (`/api/chat/checkin`)**: **Keep Haiku**. Perfect use case for low-latency, cheap model.
- **Task Tip (`/api/tasks/tip`)**: **Keep Haiku**. Fast generation for a single sentence.
- **Generate Success Criteria**: **Keep Haiku**. Reliable enough for simple JSON lists.
- **Task Opening Message**: **Keep Haiku**. Simple 2 sentence string generation.
