/**
 * Schedule Generation Utilities
 *
 * Functions for extracting constraints from onboarding conversation
 * and generating tasks using Claude AI.
 *
 * Ported from Telegram bot Python implementation.
 */

import { anthropic, CLAUDE_CONFIG } from '../ai/claude-client'
import type {
  ExtractedConstraints,
  ParsedTask,
  ParseResult,
  TimeBlock,
} from '../../types/api.types'
import { normalizeTaskLabel } from '../../types/task.types'

// ============================================
// System Prompts (from Telegram bot)
// ============================================

/**
 * System prompt for extracting scheduling constraints and enrichment from conversation.
 * Single API call populates both contextData (scheduling) and Project/User enrichment fields.
 */
const EXTRACTION_SYSTEM_PROMPT = `You are extracting scheduling constraints and project/user context from a conversation.
Read this conversation and extract:

SCHEDULING (required):
1. Blocked time (work, classes, sleep) - when person is UNAVAILABLE
2. Available time - when person CAN work on project
3. Schedule duration requested (1 week? 2 weeks? 3 weeks? Full project timeline?)
4. Start date preference (when they want to begin - tomorrow, next Monday, specific date)
5. Other preferences (gym timing, break preferences, energy levels, skill level)
6. Feature exclusions - things user explicitly said NO to or doesn't want

ENRICHMENT (include when inferrable):
7. target_deadline: Any deadline or target date mentioned. ISO 8601 string or null.
8. skill_level: Inferred from tools used and how they describe experience. "beginner" | "intermediate" | "advanced".
9. tools_and_stack: Any specific frameworks, tools, or technologies mentioned (array of strings).
10. project_type: One of "web app", "mobile app", "SaaS", "content", "script/automation", "other".
11. weekly_hours_commitment: Hours per week they commit to this project (integer).
12. motivation: One sentence, in the user's own words where possible — why they're building this.
13. phases: If they described phases or milestones, use format below. If single-phase, one entry with status "active". Each phase: id (number), title, goal (string or null), deadline (ISO or null), status ("completed" | "active" | "future").
14. project_notes: 0–5 entries. Meaningful context that doesn't fit structured fields — constraints, deadlines, preferences Harvey should remember about this project. Each note: complete, self-contained sentence. Format: [{ "note": "...", "extracted_at": "ISO timestamp" }]. Use current UTC time for extracted_at.
15. preferred_session_length: How long they like to work in one sitting (minutes). Default 120 if not mentioned.
16. communication_style: Inferred from writing style and explicit preferences. "direct" | "encouraging" | "detailed". Default "encouraging".
17. user_notes: 0–3 entries. Behavioral observations about the person relevant across any project — patterns, tendencies, working style. Only user-level, not project-specific. Format same as project_notes.

CRITICAL: Avoid overlapping time blocks! If someone says "I have classes 8-5" and "I workout 11-12", the workout is DURING classes, not in addition.

Output ONLY valid JSON, no other text:
{
  "schedule_duration_weeks": 2,
  "blocked_time": [
    {"day": "monday", "start": "08:00", "end": "17:00", "label": "Classes"},
    {"day": "tuesday", "start": "08:00", "end": "17:00", "label": "Classes"}
  ],
  "available_time": [
    {"day": "monday", "start": "17:00", "end": "22:00"},
    {"day": "monday", "start": "12:00", "end": "14:00", "label": "Class break"},
    {"day": "tuesday", "start": "17:00", "end": "22:00"}
  ],
  "preferences": {
    "start_preference": "tomorrow",
    "gym": "1 hour daily, flexible timing",
    "energy_peak": "evenings",
    "skill_level": "beginner",
    "break_preference": "self-managed"
  },
  "exclusions": ["messaging", "payment integration", "social features"],
  "target_deadline": "2024-04-01T00:00:00.000Z",
  "skill_level": "intermediate",
  "tools_and_stack": ["Next.js", "Supabase", "Cursor"],
  "project_type": "web app",
  "weekly_hours_commitment": 10,
  "motivation": "Building Harvey to solve my own decision paralysis and use it as a portfolio piece.",
  "phases": {
    "phases": [
      { "id": 1, "title": "MVP", "goal": "Ship to first users", "deadline": "2024-04-01", "status": "active" }
    ],
    "active_phase_id": 1
  },
  "project_notes": [
    { "note": "User has a demo on March 15th — treat as hard deadline", "extracted_at": "2024-02-11T10:00:00.000Z" }
  ],
  "preferred_session_length": 120,
  "communication_style": "encouraging",
  "user_notes": [
    { "note": "User tends to underestimate task duration; encourage buffer.", "extracted_at": "2024-02-11T10:00:00.000Z" }
  ]
}

RULES (scheduling):
- Use lowercase day names: monday, tuesday, etc.
- Use 24-hour time format: "08:00", "17:30"
- Schedule duration: Look for "2 weeks", "two weeks", etc. Default 2 weeks if not mentioned.
- Start preference: "tomorrow", "next_monday", or specific date. "ASAP" → "tomorrow". Default "tomorrow".
- If available time not specified, infer from blocked time. Weekend: assume 09:00-18:00 if not mentioned.
- Be conservative: if unclear, mark as blocked rather than available.

RULES (enrichment):
- Omit any enrichment key if you cannot infer it (use null or omit). Do not invent details.
- project_notes and user_notes: extracted_at must be ISO 8601 UTC string.

Now extract from this conversation:`

/**
 * Generate the task generation system prompt dynamically.
 *
 * Based on Telegram bot's generate_tasks_from_project() function.
 *
 * @param constraints - Extracted constraints from conversation
 * @param availableHoursPerWeek - Calculated available hours per week
 * @returns System prompt string
 */
function buildTaskGenerationPrompt(
  constraints: ExtractedConstraints,
  availableHoursPerWeek: number
): string {
  const scheduleWeeks = constraints.schedule_duration_weeks || 2
  const totalAvailableHours = availableHoursPerWeek * scheduleWeeks
  const skillLevel = constraints.preferences?.skill_level || 'intermediate'

  // Build exclusions text if any
  const exclusions = constraints.exclusions || []
  const exclusionsText =
    exclusions.length > 0
      ? `\n- EXCLUDED FEATURES (DO NOT include): ${exclusions.join(', ')}`
      : ''

  return `You are an expert project planner. Generate tasks with DETAILED descriptions and success criteria.

CONTEXT FROM CONVERSATION:
- Schedule duration: ${scheduleWeeks} weeks
- Available hours per week: ${availableHoursPerWeek.toFixed(1)} hours
- TOTAL AVAILABLE HOURS: ${totalAvailableHours.toFixed(1)} hours
- User's skill level: ${skillLevel}${exclusionsText}

OUTPUT FORMAT - Each task must have:

TASK: [Specific, actionable title]
DESCRIPTION:
- [Bullet point 1 - specific action]
- [Bullet point 2 - specific action]
- [Bullet point 3 - specific action]
SUCCESS:
- [Success criterion 1 - specific, measurable]
- [Success criterion 2 - specific, measurable]
- [Success criterion 3 - optional]
- [Success criterion 4 - optional, if needed]
HOURS: [Number]
PRIORITY: [high/medium/low]
LABEL: [Coding|Research|Design|Marketing|Communication|Personal|Planning]
DEPENDS_ON: [Optional - comma-separated 1-based task numbers this task depends on, e.g. "1" or "1, 2". Order tasks so setup/infra come first.]
---

EXAMPLE:

TASK: Set up Flutter development environment
DESCRIPTION:
- Install Flutter SDK from flutter.dev
- Install Android Studio with Flutter plugin
- Run 'flutter doctor' to verify installation
- Create first app: flutter create my_app
- Run app on emulator, verify "Hello World" appears
SUCCESS:
- Flutter SDK installed and 'flutter doctor' passes
- Android Studio has Flutter plugin enabled
- Demo app runs on emulator showing "Hello World"
- No critical errors in flutter doctor output
HOURS: 2.5
PRIORITY: high
LABEL: Coding
---

RULES:
- Each task: 1-6 hours (break larger tasks into parts)
- Description: 3-5 specific, actionable bullet points
- Success criteria: Provide 2–4 criteria per task. Each must be specific, measurable, and directly related to what makes this task successful. Think thoroughly about what "done" means for this task.
- Order by dependencies (setup before coding, coding before testing). Use DEPENDS_ON so "Build authentication" can depend on "Set up database" (e.g. DEPENDS_ON: 1).
- Be realistic about time for skill level: ${skillLevel}
- CRITICAL: Generate enough tasks to use approximately ${totalAvailableHours.toFixed(0)} hours total
- The sum of all task hours should be close to ${totalAvailableHours.toFixed(0)} hours (±10%)
- If the project is smaller than ${totalAvailableHours.toFixed(0)} hours, break tasks into smaller subtasks or add polish/testing/documentation tasks

MILESTONES (if schedule < full project):
After all tasks, if this is a partial schedule, add:

===MILESTONES===
By end of week ${scheduleWeeks}, you should have:
1. [Concrete deliverable]
2. [Concrete deliverable]
3. [Concrete deliverable]

This represents ~X% of full project.
Next period focus: [what comes next]
===END MILESTONES===

Now generate task breakdown:`
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate total available hours per week from constraints.
 *
 * Sums up all available time blocks to determine weekly capacity.
 *
 * @param constraints - Extracted constraints
 * @returns Available hours per week
 */
export function calculateTotalAvailableHours(
  constraints: ExtractedConstraints
): number {
  const availableTime = constraints.available_time || []

  let totalMinutes = 0

  for (const block of availableTime) {
    const minutes = calculateBlockMinutes(block)
    totalMinutes += minutes
  }

  // Convert minutes to hours
  const hours = totalMinutes / 60

  console.log(
    `[ScheduleGeneration] Calculated ${hours.toFixed(1)} available hours per week from ${availableTime.length} time blocks`
  )

  return hours
}

/**
 * Calculate minutes in a time block.
 *
 * @param block - Time block with start and end times
 * @returns Duration in minutes
 */
function calculateBlockMinutes(block: TimeBlock): number {
  try {
    const [startHour, startMin] = block.start.split(':').map(Number)
    const [endHour, endMin] = block.end.split(':').map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    // Handle overnight blocks (end time < start time means next day)
    if (endMinutes < startMinutes) {
      return 24 * 60 - startMinutes + endMinutes
    }

    return endMinutes - startMinutes
  } catch (error) {
    console.error('[ScheduleGeneration] Error calculating block minutes:', error)
    return 0
  }
}

/**
 * Strip markdown code blocks from JSON response.
 *
 * Claude sometimes wraps JSON in ```json ... ``` blocks.
 *
 * @param text - Response text that might contain markdown
 * @returns Clean JSON string
 */
function stripMarkdownCodeBlocks(text: string): string {
  let cleaned = text.trim()

  // Remove ```json or ``` at the start
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n')
    // Remove first line (```json or ```)
    lines.shift()
    cleaned = lines.join('\n')
  }

  // Remove ``` at the end
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }

  return cleaned.trim()
}

/**
 * Default constraints to use if extraction fails.
 *
 * Provides reasonable defaults for a 2-week schedule.
 */
function getDefaultConstraints(): ExtractedConstraints {
  return {
    schedule_duration_weeks: 2,
    blocked_time: [],
    available_time: [
      { day: 'monday', start: '20:00', end: '22:00' },
      { day: 'tuesday', start: '20:00', end: '22:00' },
      { day: 'wednesday', start: '20:00', end: '22:00' },
      { day: 'thursday', start: '20:00', end: '22:00' },
      { day: 'friday', start: '20:00', end: '22:00' },
      { day: 'saturday', start: '09:00', end: '18:00' },
      { day: 'sunday', start: '09:00', end: '18:00' },
    ],
    preferences: {},
  }
}

// ============================================
// Main Functions
// ============================================

/**
 * Extract structured constraints from onboarding conversation.
 *
 * Uses Claude to analyze the conversation and extract:
 * - Schedule duration (weeks)
 * - Blocked time (when user is unavailable)
 * - Available time (when user can work)
 * - Preferences (gym, energy peak, skill level)
 * - Exclusions (features user doesn't want)
 *
 * @param conversationText - Full conversation text in "ROLE: content" format
 * @returns Extracted constraints object
 */
export async function extractConstraints(
  conversationText: string
): Promise<ExtractedConstraints> {
  console.log('[ScheduleGeneration] Extracting constraints from conversation...')

  try {
    // Claude Sonnet preferred for extraction (constraints + enrichment); CLAUDE_CONFIG may be Haiku for cost. Quality matters for schedule and context.
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: conversationText,
        },
      ],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    let jsonText = textBlock?.type === 'text' ? textBlock.text : ''

    console.log('[ScheduleGeneration] Raw extraction response (first 200 chars):', jsonText.substring(0, 200))

    // Strip markdown first so we can detect truncation on the actual JSON
    jsonText = stripMarkdownCodeBlocks(jsonText)
    const trimmedForEnd = jsonText.trim()
    const looksTruncated =
      trimmedForEnd.length > 0 &&
      !/]\s*}\s*$/.test(trimmedForEnd) &&
      !/}\s*$/.test(trimmedForEnd)

    // Only slice first { to last } when response looks complete; otherwise repair will add missing ] }
    if (!looksTruncated) {
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }
    }

    let constraints: ExtractedConstraints
    
    try {
      constraints = JSON.parse(jsonText) as ExtractedConstraints
    } catch (parseError) {
      console.error('[ScheduleGeneration] JSON parse failed, attempting to repair...')
      
      // Attempt to repair common JSON issues
      const repairedJson = repairJSON(jsonText)
      
      try {
        constraints = JSON.parse(repairedJson) as ExtractedConstraints
        console.log('[ScheduleGeneration] ✅ JSON repaired successfully')
      } catch (repairError) {
        console.error('[ScheduleGeneration] ❌ JSON repair failed')
        console.error('[ScheduleGeneration] Raw text that failed:', jsonText)
        
        // 🚨 FALLBACK: Instead of crashing the whole app, return defaults
        console.warn('[ScheduleGeneration] Returning default constraints to prevent crash.')
        return getDefaultConstraints() 
      }
    }

    console.log(
      '[ScheduleGeneration] Extracted constraints:',
      JSON.stringify(constraints, null, 2)
    )
    console.log(
      `[ScheduleGeneration] Schedule duration: ${constraints.schedule_duration_weeks} weeks`
    )

    return constraints
  } catch (error) {
    console.error('[ScheduleGeneration] Error extracting constraints:', error)
    
    // TODO: Don't use defaults - show error to user and let them retry
    // For now, throw the error up to the API handler
    throw error
  }
}

/**
 * Attempt to repair common JSON errors
 *
 * Fixes:
 * - Trailing commas before closing braces/brackets
 * - Unclosed string at end (truncated response)
 * - Missing closing brackets then braces (innermost first)
 *
 * @param jsonText - Potentially broken JSON string
 * @returns Repaired JSON string
 */
function repairJSON(jsonText: string): string {
  let repaired = jsonText.trim()

  // Fix 1: Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')

  // Fix 2: Close unclosed strings (e.g. lines ending with ": "value but no closing quote)
  const lines = repaired.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('": "') && line.trim().endsWith(',') && !line.trim().endsWith('",')) {
      lines[i] = line.replace(/,\s*$/, '",')
    }
  }
  repaired = lines.join('\n')

  // Fix 3: Truncated final string — text ends with an unclosed string value (e.g. "label": "Extended evening coding")
  const trimmed = repaired.trim()
  if (trimmed.length > 0) {
    const lastQuote = trimmed.lastIndexOf('"')
    const afterLastQuote = trimmed.slice(lastQuote + 1)
    // Ends with " then alphanumeric/space (no closing ") → truncated string
    if (lastQuote !== -1 && /^[^"]*[\w\s]+$/.test(afterLastQuote) && !trimmed.endsWith('"')) {
      repaired = repaired + '"'
    }
  }

  // Fix 4: Close brackets first, then braces (innermost structure first)
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/\]/g) || []).length

  if (openBrackets > closeBrackets) {
    repaired += '\n' + ']'.repeat(openBrackets - closeBrackets)
  }
  if (openBraces > closeBraces) {
    repaired += '\n' + '}'.repeat(openBraces - closeBraces)
  }

  return repaired
}

/**
 * Generate tasks from project conversation using Claude.
 *
 * Takes the full conversation and extracted constraints to generate
 * a detailed task breakdown with descriptions and success criteria.
 *
 * @param conversationText - Full conversation text in "ROLE: content" format
 * @param constraints - Extracted constraints from extractConstraints()
 * @returns Raw Claude response text with task breakdown
 */
export async function generateTasks(
  conversationText: string,
  constraints: ExtractedConstraints
): Promise<string> {
  const scheduleWeeks = constraints.schedule_duration_weeks || 2
  const availableHoursPerWeek = calculateTotalAvailableHours(constraints)
  const totalAvailableHours = availableHoursPerWeek * scheduleWeeks

  console.log(
    `[ScheduleGeneration] Generating tasks for ${scheduleWeeks} weeks with ${availableHoursPerWeek.toFixed(1)} hours/week = ${totalAvailableHours.toFixed(1)} total hours`
  )

  // Build dynamic system prompt
  const systemPrompt = buildTaskGenerationPrompt(constraints, availableHoursPerWeek)

  // Calculate max_tokens based on schedule duration (more weeks = more tokens needed)
  const maxTokens = Math.min(4000, 1500 + scheduleWeeks * 500)

  console.log(`[ScheduleGeneration] Using max_tokens=${maxTokens} for ${scheduleWeeks} weeks`)

  // Call Claude API
  const response = await anthropic.messages.create({
    model: CLAUDE_CONFIG.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Project conversation:\n\n${conversationText}`,
      },
    ],
  })

  // Extract text from response
  const textBlock = response.content.find((block) => block.type === 'text')
  const responseText = textBlock?.type === 'text' ? textBlock.text : ''

  console.log('[ScheduleGeneration] Task generation complete, response length:', responseText.length)

  return responseText
}

/**
 * Parse Claude's task generation response into structured tasks.
 *
 * Extracts individual tasks and milestones from the response text.
 * Each task has: title, description, success criteria, hours, priority.
 *
 * @param claudeResponse - Raw response from generateTasks()
 * @returns Parsed tasks and milestones
 */
export function parseTasks(claudeResponse: string): ParseResult {
  const tasks: ParsedTask[] = []
  let milestones: string | null = null

  // Extract milestones if present
  let tasksText = claudeResponse
  if (claudeResponse.includes('===MILESTONES===')) {
    const parts = claudeResponse.split('===MILESTONES===')
    tasksText = parts[0]
    if (parts.length > 1) {
      const milestoneText = parts[1].split('===END MILESTONES===')[0]
      milestones = milestoneText.trim()
    }
  }

  // Split into task blocks by "---" separator
  const taskBlocks = tasksText.split('---')

  for (const block of taskBlocks) {
    const trimmedBlock = block.trim()

    // Skip empty blocks or blocks without TASK:
    if (!trimmedBlock || !trimmedBlock.includes('TASK:')) {
      continue
    }

    const task = parseTaskBlock(trimmedBlock)

    // Only add if we have at least a title
    if (task.title) {
      tasks.push(task)
    }
  }

  console.log(`[ScheduleGeneration] Parsed ${tasks.length} tasks`)

  return { tasks, milestones }
}

/**
 * Parse a single task block into a structured task.
 *
 * @param block - Single task block text
 * @returns Parsed task object
 */
function parseTaskBlock(block: string): ParsedTask {
  const lines = block.split('\n')

  const task: ParsedTask = {
    title: '',
    description: '',
    success: 'Task completed',
    hours: 2.0,
    priority: 'medium',
    label: 'Planning',
  }

  // Extract title
  for (const line of lines) {
    if (line.trim().startsWith('TASK:')) {
      task.title = line.replace('TASK:', '').trim()
      break
    }
  }

  // Extract description
  if (block.includes('DESCRIPTION:')) {
    const descStart = block.indexOf('DESCRIPTION:') + 'DESCRIPTION:'.length
    const descEnd = block.includes('SUCCESS:')
      ? block.indexOf('SUCCESS:')
      : block.includes('HOURS:')
        ? block.indexOf('HOURS:')
        : block.length

    if (descEnd > descStart) {
      task.description = block.substring(descStart, descEnd).trim()
    }
  }

  // Extract success criteria (2–4 lines under SUCCESS: until HOURS: or next section)
  const successStart = lines.findIndex((l) => l.trim().startsWith('SUCCESS:'))
  if (successStart !== -1) {
    const successLines: string[] = []
    for (let i = successStart; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (i === successStart) {
        const afterLabel = line.replace(/^SUCCESS:\s*/i, '').trim()
        if (afterLabel) successLines.push(afterLabel)
        continue
      }
      if (/^(HOURS|PRIORITY|LABEL|DEPENDS_ON|TASK|DESCRIPTION):/i.test(trimmed)) break
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
        successLines.push(trimmed.replace(/^[-•*]\s*/, '').trim())
      } else if (trimmed.length > 0) {
        successLines.push(trimmed)
      }
    }
    task.success = successLines.filter((s) => s.length > 0).join('\n') || 'Task completed'
  }

  // Extract hours
  for (const line of lines) {
    if (line.includes('HOURS:')) {
      const hoursStr = line.replace('HOURS:', '').trim()
      const parsed = parseFloat(hoursStr)
      if (!isNaN(parsed)) {
        task.hours = parsed
      }
      break
    }
  }

  // Extract priority
  for (const line of lines) {
    if (line.includes('PRIORITY:')) {
      const priorityStr = line.replace('PRIORITY:', '').trim().toLowerCase()
      if (priorityStr === 'high' || priorityStr === 'medium' || priorityStr === 'low') {
        task.priority = priorityStr
      }
      break
    }
  }

  // Extract label
  for (const line of lines) {
    if (line.toUpperCase().startsWith('LABEL:')) {
      const labelStr = line.replace(/label:/i, '').trim()
      task.label = normalizeTaskLabel(labelStr)
      break
    }
  }

  // Extract depends_on (1-based task indices, e.g. "1" or "1, 2" or "1,2")
  for (const line of lines) {
    if (line.toUpperCase().startsWith('DEPENDS_ON:')) {
      const value = line.replace(/depends_on:/i, '').trim()
      if (value) {
        const indices = value
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 1)
        if (indices.length > 0) {
          task.depends_on = [...new Set(indices)]
        }
      }
      break
    }
  }

  return task
}

/**
 * Convert success criteria string to JSON format for database
 *
 * Takes a string like "- Do thing 1\n- Do thing 2"
 * Returns JSON: [{ id: "1", text: "Do thing 1", done: false }, ...]
 *
 * @param successString - Success criteria as string
 * @returns JSON array for database
 */
export function convertSuccessCriteriaToJson(successString: string): Array<{
  id: string
  text: string
  done: boolean
}> {
  if (!successString) {
    return []
  }

  // Split by newlines and filter empty
  const lines = successString
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return lines.map((line, index) => {
    // Remove bullet points or numbers at the start
    const cleanedText = line
      .replace(/^[-•*]\s*/, '') // Remove bullet points
      .replace(/^\d+\.\s*/, '') // Remove numbered list markers
      .trim()

    return {
      id: `item-${index + 1}`,
      text: cleanedText,
      done: false,
    }
  })
}
