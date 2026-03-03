/**
 * Harvey AI Model Configuration
 *
 * All Anthropic model references in the codebase must use these constants.
 * To swap a model globally, change it here — nowhere else.
 *
 * Current strategy: Haiku everywhere for cost efficiency during beta.
 * Sonnet reserved for future upgrade on specific high-value interactions.
 */

export const MODELS = {
  // Onboarding conversation with Harvey
  ONBOARDING_CHAT: 'claude-haiku-4-5-20251001',

  // Extraction of structured data from onboarding conversation
  ONBOARDING_EXTRACTION: 'claude-haiku-4-5-20251001',

  // Constraint extraction before schedule generation
  CONSTRAINTS_EXTRACTION: 'claude-haiku-4-5-20251001',

  // Task generation from project description
  TASK_GENERATION: 'claude-haiku-4-5-20251001',

  // Slot assignment for generated tasks
  TASK_SCHEDULER: 'claude-haiku-4-5-20251001',

  // Coaching message after schedule is built
  SCHEDULE_COACHING: 'claude-haiku-4-5-20251001',

  // Project-level chat (post-onboarding sidebar)
  PROJECT_CHAT: 'claude-haiku-4-5-20251001',

  // Individual task chat
  TASK_CHAT: 'claude-haiku-4-5-20251001',

  // Daily check-in message on dashboard load
  DAILY_CHECKIN: 'claude-haiku-4-5-20251001',

  // Harvey tip shown on task cards in timeline
  TASK_TIP: 'claude-haiku-4-5-20251001',

  // Early project info extraction during onboarding
  PROJECT_EXTRACTION: 'claude-haiku-4-5-20251001',

  // Success criteria generation when adding a task manually
  SUCCESS_CRITERIA: 'claude-haiku-4-5-20251001',

  // Opening message when a task chat is opened for the first time
  TASK_OPENING_MESSAGE: 'claude-haiku-4-5-20251001',
} as const

export const MODEL_PRICING: Record<
  string,
  { input_per_million: number; output_per_million: number }
> = {
  'claude-haiku-4-5-20251001': {
    input_per_million: 1.0,
    output_per_million: 5.0,
  },
  'claude-sonnet-4-20250514': {
    input_per_million: 3.0,
    output_per_million: 15.0,
  },
  'claude-sonnet-4-6': {
    input_per_million: 3.0,
    output_per_million: 15.0,
  },
}

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.input_per_million +
    (outputTokens / 1_000_000) * pricing.output_per_million
  )
}
