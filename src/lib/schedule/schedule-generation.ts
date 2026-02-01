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
} from '../types/api.types'

// ============================================
// System Prompts (from Telegram bot)
// ============================================

/**
 * System prompt for extracting scheduling constraints from conversation.
 * Exact copy from Telegram bot's extract_constraints_from_conversation().
 */
const EXTRACTION_SYSTEM_PROMPT = `You are extracting scheduling constraints from a conversation.
Read this conversation and extract:

1. Blocked time (work, classes, sleep) - when person is UNAVAILABLE
2. Available time - when person CAN work on project
3. Schedule duration requested (1 week? 2 weeks? 3 weeks? Full project timeline?)
4. Other preferences (gym timing, break preferences, energy levels, skill level)
5. Feature exclusions - things user explicitly said NO to or doesn't want

CRITICAL: Avoid overlapping time blocks! If someone says "I have classes 8-5" and "I workout 11-12", the workout is DURING classes, not in addition. Don't create overlapping blocked times.

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
    "gym": "1 hour daily, flexible timing",
    "energy_peak": "evenings",
    "skill_level": "beginner",
    "break_preference": "self-managed"
  },
  "exclusions": ["messaging", "payment integration", "social features"]
}

RULES:
- Use lowercase day names: monday, tuesday, etc.
- Use 24-hour time format: "08:00", "17:30"
- Schedule duration: Look for phrases like "2 weeks", "two weeks", "14 days", "next 2 weeks", "for 2 weeks". If explicitly mentioned, use that number. If not mentioned, default to 2 weeks.
- If available time not specified, infer from blocked time (opposite of work/sleep)
- Weekend days: If not mentioned, assume available 09:00-18:00
- Be conservative: If unclear, mark as blocked rather than available

IMPORTANT: Pay close attention to how long the user wants the schedule to be. If they say "2 weeks" or "two weeks", set schedule_duration_weeks to 2. If they say "1 week", set it to 1. If they say "3 weeks", set it to 3.

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
SUCCESS: [Clear completion criteria]
HOURS: [Number]
PRIORITY: [high/medium/low]
---

EXAMPLE:

TASK: Set up Flutter development environment
DESCRIPTION:
- Install Flutter SDK from flutter.dev
- Install Android Studio with Flutter plugin
- Run 'flutter doctor' to verify installation
- Create first app: flutter create my_app
- Run app on emulator, verify "Hello World" appears
SUCCESS: App runs on emulator showing Flutter demo
HOURS: 2.5
PRIORITY: high
---

RULES:
- Each task: 1-6 hours (break larger tasks into parts)
- Description: 3-5 specific, actionable bullet points
- Success criteria: Observable, testable outcome
- Order by dependencies (setup before coding, coding before testing)
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
    // Call Claude API with extraction prompt
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 1000,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: conversationText,
        },
      ],
    })

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text')
    let jsonText = textBlock?.type === 'text' ? textBlock.text : ''

    console.log('[ScheduleGeneration] Raw extraction response:', jsonText.substring(0, 200))

    // Strip markdown code blocks if present
    jsonText = stripMarkdownCodeBlocks(jsonText)

    // Parse JSON
    const constraints = JSON.parse(jsonText) as ExtractedConstraints

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

    // Return default constraints on failure
    console.log('[ScheduleGeneration] Using default constraints')
    return getDefaultConstraints()
  }
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

  // Extract success criteria
  for (const line of lines) {
    if (line.trim().startsWith('SUCCESS:')) {
      task.success = line.replace('SUCCESS:', '').trim()
      break
    }
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

  return task
}
