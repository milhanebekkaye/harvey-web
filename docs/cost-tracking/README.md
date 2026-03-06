# API Cost Tracking

**Purpose:** This doc explains how Anthropic API cost is tracked in Harvey and what to do when you add a new API call.

---

## Rule for agents and developers

**When you add any new Anthropic (or other tracked) API call, you must log usage** so the cost is recorded in `ApiUsageLog` and `UserUsageSummary`. Use the existing `logApiUsage()` function; do not skip it.

---

## Existing infrastructure

### Schema (`src/prisma/schema.prisma`)

**ApiUsageLog** (table `api_usage_logs`):

- `id` (cuid), `userId`, `feature` (string), `model` (string), `inputTokens` (Int), `outputTokens` (Int), `costUsd` (Float), `createdAt`
- One row per API call; relation to User (onDelete: Cascade).

**UserUsageSummary** (table `user_usage_summaries`):

- `id`, `userId`, `periodStart` (DateTime, start of 30-day billing period), `totalCostUsd`, `totalInputTokens`, `totalOutputTokens`, `callCount`, `updatedAt`
- Unique on `(userId, periodStart)`; one row per user per 30-day period. Relation to User (onDelete: Cascade).

**User** has optional `subscription_start_date`; period boundaries are derived from that or `createdAt` (see usage-logger).

### Logger: `logApiUsage` (`src/lib/ai/usage-logger.ts`)

**Signature:**

```ts
export type LogApiUsageParams = {
  userId: string
  feature: string   // e.g. "onboarding_chat", "onboarding_extraction"
  model: string    // e.g. "claude-haiku-4-5-20251001"
  inputTokens: number
  outputTokens: number
}

export async function logApiUsage(params: LogApiUsageParams): Promise<void>
```

**Behavior:**

- Computes `costUsd` via `computeCostUsd(model, inputTokens, outputTokens)` from `src/lib/ai/models.ts` (uses `MODEL_PRICING` per model, $/million tokens).
- Loads user to get `subscription_start_date` or `createdAt`, then computes 30-day `periodStart` (anchor + floor(daysSinceStart / 30) * 30 days).
- In one `Promise.all`: (1) `prisma.apiUsageLog.create({ userId, feature, model, inputTokens, outputTokens, costUsd })`, (2) `prisma.userUsageSummary.upsert` on `userId_periodStart` (create or increment totals and callCount).
- Wrapped in try/catch: **never throws**; on failure only `console.error`. Logging must not break API routes.

### Cost calculation (`src/lib/ai/models.ts`)

- `MODEL_PRICING[model]` has `input_per_million` and `output_per_million` (USD).
- `computeCostUsd(model, inputTokens, outputTokens)` returns `(inputTokens/1e6)*input_per_million + (outputTokens/1e6)*output_per_million`; returns 0 if model not in pricing.

---

## Pattern: how to log after an API call

### Non-streaming (e.g. `anthropic.messages.create`)

Get token counts from the response (Anthropic uses `usage.input_tokens` and `usage.output_tokens`), then call `logApiUsage` (fire-and-forget with `.catch(() => {})` so it never rejects the request):

```ts
import { logApiUsage } from '@/lib/ai/usage-logger'
import { MODELS } from '@/lib/ai/models'

const response = await anthropic.messages.create({ ... })

logApiUsage({
  userId: user.id,
  feature: 'your_feature_name',   // stable string for this call site
  model: MODELS.SOME_MODEL,
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
}).catch(() => {})
```

### Streaming (Vercel AI SDK `streamText`)

Usage is available asynchronously (e.g. from `result.usage`). In the stream’s `onFinish` (or when the stream completes), await usage then log:

```ts
import { logApiUsage } from '@/lib/ai/usage-logger'

// Inside createUIMessageStream({ ..., onFinish: async ({ ... }) => { ... } })
if (user?.id) {
  try {
    const usage = await result.usage
    if (usage) {
      logApiUsage({
        userId: user.id,
        feature: 'onboarding_chat',   // or project_chat, task_chat, etc.
        model: MODEL_ID,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      }).catch(() => {})
    }
  } catch {
    // ignore
  }
}
```

Use a **consistent `feature` string** per call site (e.g. `onboarding_chat`, `onboarding_extraction`, `project_chat`, `task_chat`, `checkin`, `schedule_generation`, etc.) so logs and summaries are queryable.

---

## Where it’s already wired

All current Anthropic call sites are wired (see `docs/cost-audit.md` Section 5):

- **Streaming:** `/api/chat`, `/api/chat/project`, `/api/chat/task`, `/api/chat/checkin` — usage from `result.usage` in onFinish.
- **Non-streaming:** onboarding greeting (`GET /api/onboarding/greeting`), onboarding extract, project extraction, success criteria, task opening message, task tip, constraints extraction, task generation, schedule coaching, task scheduler — all call `logApiUsage` after the API response with `response.usage.input_tokens` / `response.usage.output_tokens`.

When adding a **new** route or lib that calls Anthropic (or another tracked provider), add a matching `logApiUsage` call and, if the model is new, add it to `MODELS` and `MODEL_PRICING` in `src/lib/ai/models.ts`.

---

## Related docs

- **`docs/cost-audit.md`** — Full audit of all API call sites, estimated tokens, and cost.
- **`ARCHITECTURE.md`** — Top-level mention of ApiUsageLog, UserUsageSummary, and `usage-logger.ts`.
