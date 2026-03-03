/**
 * Task-specific opening message for per-task chat.
 * One-time Haiku call on first Discussion creation; result stored in DB.
 */

import { anthropic } from '@/lib/ai/claude-client'
import { MODELS } from '@/lib/ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'
const MAX_TOKENS = 200

/** Used when Haiku fails or task data is missing; discussion creation never blocked. */
export const TASK_OPENING_FALLBACK_MESSAGE =
  'Ready to help you tackle this task. What would you like to work through first?'

const FALLBACK_MESSAGE = TASK_OPENING_FALLBACK_MESSAGE

const SYSTEM_PROMPT = `You are Harvey, an AI accountability coach. Your job is to help users execute their tasks. Generate a short, specific, encouraging opening message for a task chat. Be direct and useful — not generic. Mention what the task unlocks if relevant, flag incomplete dependencies if any, and end with one concrete suggestion or question to help the user start. Maximum 3 sentences. No pleasantries like 'Great!' or 'Sure!'. Sound like a knowledgeable coach, not a chatbot.`

export interface TaskContext {
  title: string
  description: string | null
  estimatedDuration: number | null // minutes
  label: string | null // category: Coding, Research, etc.
  dependsOn: {
    title: string
    status: string // 'completed' | 'pending' | 'skipped'
  }[]
  unlocksCount: number // how many tasks depend on this one
  projectTitle: string | null
  projectGoals: string | null
}

function buildUserMessage(task: TaskContext): string {
  const duration =
    task.estimatedDuration != null
      ? `${task.estimatedDuration} minutes`
      : 'not specified'
  const description = task.description ?? 'No description provided'
  const deps =
    task.dependsOn.length === 0
      ? 'None'
      : task.dependsOn
          .map((d) => `${d.title} (${d.status})`)
          .join(', ')
  const unlocks =
    task.unlocksCount === 0
      ? 'no downstream tasks'
      : `${task.unlocksCount} downstream tasks`
  const projectTitle = task.projectTitle ?? 'not specified'
  const projectGoals = task.projectGoals ?? 'not specified'

  return `Task: ${task.title}
Category: ${task.label ?? 'not specified'}
Estimated duration: ${duration}
Description: ${description}
Dependencies: ${deps}
This task unlocks: ${unlocks}
Project: ${projectTitle}
Project goals: ${projectGoals}

Generate the opening message.`
}

/**
 * Generate a task-specific opening message via Claude Haiku.
 * On error: returns fallback string and logs; never throws (so discussion creation is never blocked).
 * @param userId - Optional; if provided, usage is logged for cost tracking
 */
export async function generateTaskOpeningMessage(
  task: TaskContext,
  userId?: string
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.TASK_OPENING_MESSAGE,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(task) }],
    })

    if (userId) {
      logApiUsage({
        userId,
        feature: 'task_opening_message',
        model: MODELS.TASK_OPENING_MESSAGE,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(() => {})
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    if (!text) return FALLBACK_MESSAGE
    return text
  } catch (error) {
    console.error(
      '[generateTaskOpeningMessage] Haiku call failed:',
      error instanceof Error ? error.message : error
    )
    return FALLBACK_MESSAGE
  }
}
