/**
 * Project Info Extraction
 *
 * Extracts project_title and project_description from onboarding conversation.
 * Used during chat onFinish to populate Project model as soon as data is available.
 * Mirrors the constraint extraction pattern in schedule-generation.ts.
 */

import { anthropic, CLAUDE_CONFIG } from './claude-client'

const EXTRACTION_PROMPT = `Extract project info from this onboarding conversation.

Output ONLY valid JSON, no other text:
{
  "project_title": "Short title (e.g. Telegram task bot)",
  "project_description": "1-2 sentence description of what they're building"
}

RULES:
- project_title: 3-8 words max, concrete (not "My Project" or "Untitled")
- project_description: What + for who, or problem being solved
- If you cannot infer yet (too few messages, vague), use null for that field
- Extract as soon as the user gives enough context - do not wait for full intake

Now extract from this conversation:`

export interface ExtractedProjectInfo {
  project_title: string | null
  project_description: string | null
}

/**
 * Extract project title and description from onboarding conversation.
 *
 * @param conversationText - Full conversation in "ROLE: content" format
 * @returns Extracted title and description, or nulls if not inferrable
 */
export async function extractProjectInfo(
  conversationText: string
): Promise<ExtractedProjectInfo> {
  if (!conversationText.trim()) {
    return { project_title: null, project_description: null }
  }

  const response = await anthropic.messages.create({
    model: CLAUDE_CONFIG.model,
    max_tokens: 256,
    system: EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  let jsonText = textBlock?.type === 'text' ? textBlock.text : ''

  // Strip markdown code blocks if present
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonText = jsonText.substring(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(jsonText) as ExtractedProjectInfo
    return {
      project_title: parsed.project_title && String(parsed.project_title).trim() ? String(parsed.project_title).trim() : null,
      project_description: parsed.project_description && String(parsed.project_description).trim() ? String(parsed.project_description).trim() : null,
    }
  } catch {
    return { project_title: null, project_description: null }
  }
}
