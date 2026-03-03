/**
 * Generate 2–4 success criteria for a task using Claude.
 *
 * Used when adding tasks via the chat add_task tool so that chat-added tasks
 * get the same quality of success criteria as onboarding-generated tasks.
 *
 * Format: Array<{ id: string, text: string, done: boolean }> (same as Task.successCriteria).
 */

import { anthropic } from '../ai/claude-client'
import { MODELS } from '../ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'

/** Success criteria generation uses centralized model config. */
const MODEL_ID = MODELS.SUCCESS_CRITERIA

const SYSTEM_PROMPT = `You are a project planning assistant. Given a task title and optional description, output 2–4 specific, measurable success criteria that would make this task clearly "done".

Rules:
- Each criterion must be something concrete and verifiable (not vague).
- Think about what would actually make this task successful.
- Output ONLY a JSON array of strings, no other text. Example: ["Criterion one", "Criterion two", "Criterion three"]
- Use 2 to 4 items. Each item one short sentence.`

export type SuccessCriterionItem = {
  id: string
  text: string
  done: boolean
}

/**
 * Generate 2–4 success criteria for a task based on its title and description.
 *
 * @param title - Task title
 * @param description - Optional task description
 * @param userId - Optional; if provided, usage is logged for cost tracking
 * @returns Array of { id, text, done } for storage in Task.successCriteria, or [] on error
 */
export async function generateSuccessCriteria(
  title: string,
  description?: string | null,
  userId?: string
): Promise<SuccessCriterionItem[]> {
  if (!title?.trim()) return []

  const userContent = description?.trim()
    ? `Task title: ${title}\n\nDescription: ${description}\n\nOutput 2–4 success criteria as a JSON array of strings.`
    : `Task title: ${title}\n\nOutput 2–4 success criteria as a JSON array of strings.`

  try {
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    if (userId) {
      logApiUsage({
        userId,
        feature: 'success_criteria',
        model: MODEL_ID,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(() => {})
    }

    const textBlock = response.content.find((block) => block.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text : ''
    const trimmed = raw.trim()

    // Strip markdown code block if present
    let jsonStr = trimmed
    if (trimmed.startsWith('```')) {
      const lines = trimmed.split('\n')
      lines.shift()
      if (lines[lines.length - 1]?.trim() === '```') lines.pop()
      jsonStr = lines.join('\n')
    }

    const parsed = JSON.parse(jsonStr) as unknown
    if (!Array.isArray(parsed)) return []

    const texts = parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0)
      .slice(0, 4)

    if (texts.length === 0) return []

    return texts.map((text, index) => ({
      id: `item-${index + 1}`,
      text,
      done: false,
    }))
  } catch (err) {
    console.error('[generateSuccessCriteria] Error:', err)
    return []
  }
}
