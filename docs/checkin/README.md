# Daily Check-In

## What it is

When a returning user (with an active project and existing tasks) loads the dashboard, Harvey can automatically generate and stream a short, contextual check-in message as the last message in the chat sidebar. The message feels like a greeting and gives direction (e.g. today’s tasks, yesterday’s summary, streak, or recent skips).

## Flow

1. **Dashboard load**: After tasks and project are loaded, a effect runs (after a short delay so it doesn’t block render). If the user has at least one task and rate limit allows, the client calls `POST /api/chat/checkin` with `{ projectId }`.
2. **Rate limiting (client)**: `localStorage` key `harvey_checkin_${projectId}` stores the last check-in timestamp. A new check-in runs only if:
   - No previous check-in for this project, or
   - More than 3 hours since last check-in, or
   - The calendar day has changed (new day).
3. **API**: The check-in route authenticates the user, loads context via `assembleCheckInContext(projectId, userId)`, builds a system prompt, and streams the model response as plain text.
4. **Client**: The dashboard reads the stream, updates `streamingCheckIn` so the sidebar shows the text live at the bottom. When the stream ends, the client:
   - POSTs the message to `POST /api/discussions/[projectId]/messages` with `{ role: 'assistant', content, messageType: 'check-in' }`
   - Appends the message to `appendedByDashboard` so it appears in the sidebar
   - Updates `localStorage` with the current timestamp.
5. **Sidebar**: Messages with `messageType: 'check-in'` are rendered like other Harvey messages; they carry `data-message-type="check-in"` for optional future styling.

## Files

- **`src/lib/checkin/checkin-context.ts`**: Builds check-in context (time of day, today’s tasks, yesterday’s summary, streak, recent skipped). Uses user timezone for “today” and “yesterday.”
- **`src/app/api/chat/checkin/route.ts`**: POST handler: auth, project validation, context assembly, `streamText()` with a short system prompt, response streamed as plain text.
- **`src/app/dashboard/page.tsx`**: Triggers check-in when project + tasks exist and rate limit allows; holds `checkInStreaming` and passes it to the sidebar; persists and appends the final message.
- **`src/components/dashboard/ChatSidebar.tsx`**: Accepts `streamingCheckIn` and displays it as the last message while streaming; displays `messageType: 'check-in'` for stored/append messages.

## Context (checkin-context.ts)

- **Time of day**: Morning (before 12:00), afternoon (12:00–17:00), evening (after 17:00) in user’s timezone.
- **Today’s tasks**: Pending or in-progress tasks scheduled for today (user TZ), with title and scheduled time (formatted in user TZ).
- **Yesterday’s summary**: Counts of completed, skipped, and total tasks scheduled yesterday (user TZ).
- **Streak**: Consecutive days (going back from yesterday) with at least one completed task, up to 30 days.
- **Recent skipped**: Tasks with status `skipped` and scheduled date yesterday or the day before (user TZ), not yet rescheduled.

## Message types (prompt guidance)

The system prompt steers tone and content, for example:

- Morning + tasks today: greet, mention count and first task/time, reference yesterday’s completions.
- Evening + pending task: note time and remaining task, encourage.
- Skipped tasks: mention count and offer to reschedule.
- Streak: acknowledge streak and encourage keeping it.
- No tasks today: free day or offer to add something.
- No tasks yesterday but tasks today: hope they’re doing well and ready for today.

## Data and types

- **StoredMessage** (`api.types.ts`): Optional `messageType?: 'check-in'`.
- **POST /api/discussions/[projectId]/messages**: Body may include `messageType: 'check-in'`; stored in the discussion JSON.
- **GET /api/discussions/[projectId]**: Returns messages with `messageType` when present; frontend uses it for display and `data-message-type`.

## What we don’t do

- No new DB table for check-ins (messages live in Discussion.messages).
- No email/push notifications.
- Check-in does not block dashboard load (runs after render, with delay).
- Check-in is not shown during onboarding (only when on dashboard with existing tasks).
