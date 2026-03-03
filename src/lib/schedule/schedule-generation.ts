/**
 * Schedule Generation Utilities
 *
 * Functions for extracting constraints from onboarding conversation
 * and generating tasks using Claude AI.
 *
 * Ported from Telegram bot Python implementation.
 */

import { anthropic, withAnthropicRetry } from '../ai/claude-client'
import { MODELS } from '../ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'
import type {
  CommuteShape,
  ExtractedConstraints,
  ExtractedNote,
  ExtractedPhases,
  ParsedTask,
  ParseResult,
  TimeBlock,
  UserPreferences,
  WorkScheduleShape,
} from '../../types/api.types'
import { normalizeTaskLabel } from '../../types/task.types'
import type { AvailabilityWindow } from '../../types/user.types'
import { parseTimeToHours } from './task-scheduler'

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

USER LIFE CONSTRAINTS (for User.workSchedule and User.commute — extract when inferrable):
7. work_schedule: When they work a regular job/classes. workDays: array of 0-6 (0=Sunday, 1=Monday, ... 6=Saturday). startTime and endTime: 24h "HH:MM". Infer from blocked_time entries labeled "Work" or "Classes" or similar, or from explicit "I work Mon-Fri 9-5".
8. commute: Optional. morning: { durationMinutes: number, startTime: "HH:MM" }, evening: { durationMinutes: number, startTime: "HH:MM" }. Omit if not mentioned.

ENRICHMENT (include when inferrable):
9. target_deadline: Any deadline or target date mentioned. ISO 8601 string or null.
10. skill_level: Inferred from tools used and how they describe experience. "beginner" | "intermediate" | "advanced".
11. tools_and_stack: Any specific frameworks, tools, or technologies mentioned (array of strings).
12. project_type: One of "web app", "mobile app", "SaaS", "content", "script/automation", "other".
13. weekly_hours_commitment: Hours per week they commit to this project (integer).
14. motivation: One sentence, in the user's own words where possible — why they're building this.
15. phases: If they described phases or milestones, use format below. If single-phase, one entry with status "active". Each phase: id (number), title, goal (string or null), deadline (ISO or null), status ("completed" | "active" | "future").
16. project_notes: 0–5 entries. Meaningful context that doesn't fit structured fields — constraints, deadlines, preferences Harvey should remember about this project. Each note: complete, self-contained sentence. Format: [{ "note": "...", "extracted_at": "ISO timestamp" }]. Use current UTC time for extracted_at.
17. preferred_session_length: How long they like to work in one sitting (minutes). Default 120 if not mentioned.
18. communication_style: Inferred from writing style and explicit preferences. "direct" | "encouraging" | "detailed". Default "encouraging".
19. user_notes: 0–3 entries. Behavioral observations about the person relevant across any project — patterns, tendencies, working style. Only user-level, not project-specific. Format same as project_notes.

CRITICAL: Avoid overlapping time blocks! If someone says "I have classes 8-5" and "I workout 11-12", the workout is DURING classes, not in addition.

Output ONLY valid JSON, no other text:
{
  "schedule_duration_weeks": 2,
  "work_schedule": { "workDays": [1, 2, 3, 4, 5], "startTime": "09:00", "endTime": "17:30" },
  "commute": { "morning": { "durationMinutes": 30, "startTime": "08:30" }, "evening": { "durationMinutes": 30, "startTime": "17:30" } },
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
 * Uses top-level constraints.skill_level (extraction stores it there, not under preferences).
 * Note: preferences.gym, energy_peak, break_preference are extracted but not yet used in task generation (future: session timing, energy-aware scheduling).
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
  // Bug fix: skill_level is top-level on constraints (extraction stores it there), not under preferences
  const skillLevel = constraints.skill_level || 'intermediate'
  const sessionMinutes = constraints.preferred_session_length ?? 120

  // Build exclusions text if any
  const exclusions = constraints.exclusions || []
  const exclusionsText =
    exclusions.length > 0
      ? `\n- EXCLUDED FEATURES (DO NOT include): ${exclusions.join(', ')}`
      : ''

  // --- User context: motivation, skill, session length, tech stack, deadline, energy peak, user notes (enriched extraction) ---
  const energyPeakLine = constraints.energy_peak
    ? `- Energy peak: ${constraints.energy_peak} (user is most productive in the ${constraints.energy_peak})`
    : ''
  const userNotesLine =
    constraints.user_notes && constraints.user_notes.length > 0
      ? `\n- User notes (scheduling signals): ${constraints.user_notes.map((n) => n.note).join('; ')}`
      : ''
  const userContext = `
USER CONTEXT:
- Motivation: ${constraints.motivation || 'Not specified'}
- Skill level: ${skillLevel}
- Preferred work sessions: ${sessionMinutes} minutes
- Tech stack: ${constraints.tools_and_stack?.join(', ') || 'Not specified'}
- Project type: ${constraints.project_type || 'Not specified'}
${energyPeakLine}${userNotesLine}
${constraints.target_deadline ? `- Target deadline: ${new Date(constraints.target_deadline).toLocaleDateString()} (IMPORTANT: pace tasks to hit this date)` : ''}
`

  // --- Phases: if user defined phases, align tasks with active phase goals ---
  const phasesContext = constraints.phases?.phases?.length
    ? `
PROJECT PHASES:
User has defined these phases:
${constraints.phases.phases.map((p) => `- Phase ${p.id}: ${p.title}${p.goal ? ` (Goal: ${p.goal})` : ''}${p.deadline ? ` (Deadline: ${p.deadline})` : ''} [${p.status}]`).join('\n')}

Currently active: Phase ${constraints.phases.active_phase_id ?? constraints.phases.phases[0]?.id ?? 1}
IMPORTANT: Structure tasks to align with the active phase goals.
`
    : ''

  // --- Project notes: critical context Harvey should respect ---
  const notesContext =
    constraints.project_notes && constraints.project_notes.length > 0
      ? `
CRITICAL PROJECT CONTEXT:
${constraints.project_notes.map((n) => `- ${n.note}`).join('\n')}
`
      : ''

  // --- Communication style: affects tone of descriptions and success criteria ---
  const communicationStyle = constraints.communication_style || 'encouraging'
  const styleGuidance = {
    direct: 'Be concise and directive. No fluff. Clear steps and success criteria only.',
    encouraging: 'Use supportive, motivating language. Frame tasks as achievements. Celebrate progress.',
    detailed: 'Provide context and reasoning. Explain WHY tasks matter. Include learning resources or tips.',
  }[communicationStyle]
  const communicationSection = `
COMMUNICATION STYLE: ${styleGuidance}
This affects how you write task descriptions and success criteria.
`

  return `You are an expert project planner. Generate tasks with DETAILED descriptions and success criteria.

CONTEXT FROM CONVERSATION:
- Schedule duration: ${scheduleWeeks} weeks
- Available hours per week: ${availableHoursPerWeek.toFixed(1)} hours
- TOTAL AVAILABLE HOURS: ${totalAvailableHours.toFixed(1)} hours${exclusionsText}
${userContext}${phasesContext}${notesContext}${communicationSection}

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
ENERGY_REQUIRED: [high|medium|low]
PREFERRED_SLOT: [peak_energy|normal|flexible]
---

SCHEDULING METADATA (required for each task):
- energy_required: "high" | "medium" | "low"
  - high: deep focus, complex problem solving, significant cognitive effort (e.g. implementing authentication, debugging complex bugs, architectural decisions)
  - medium: moderate focus (e.g. writing documentation, code reviews, designing database schema)
  - low: can be done in a distracted state (e.g. research/reading, communication tasks, gathering requirements)
- preferred_slot: "peak_energy" | "normal" | "flexible"
  - peak_energy: assign to the user's highest-energy time window (use for energy_required=high tasks when user has energy_peak set)
  - normal: assign to standard work windows
  - flexible: can go anywhere available

Calibration (use user notes and project notes):
- If user notes mention "uses AI tools" or "codes fast" → reduce estimated HOURS for coding tasks by 20-25%
- If user notes mention "needs planning before coding" or "30 min planning" → account for planning sub-task or buffer in the duration estimate
- If user notes mention "decision paralysis" or "overwhelmed" → set day 1 tasks to PREFERRED_SLOT: flexible
- If project notes mention a hard deadline for the active phase → set ENERGY_REQUIRED: high for tasks in that phase

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
DEPENDS_ON:
ENERGY_REQUIRED: high
PREFERRED_SLOT: peak_energy
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

SPECIFICITY REQUIREMENTS:
- Task titles MUST include specific tool names when tech stack is provided. "Set up Next.js project with App Router" NOT "Set up web framework"
- Task titles MUST have concrete action verbs + specific objects. "Build user authentication flow with email validation" NOT "Work on auth"
- Descriptions MUST be step-by-step executable actions, not vague goals
- Success criteria MUST be measurable and testable. "Login form validates email format and redirects to /dashboard" NOT "Auth works"

SESSION LENGTH OPTIMIZATION:
- User prefers ${sessionMinutes} minute work sessions
- Target tasks that fit in 1-2 sessions (${sessionMinutes * 1}-${sessionMinutes * 2} minutes)
- Avoid tasks that are too fragmented (<30 min) or too monolithic (>6 hours)

DEADLINE PACING:
${constraints.target_deadline ? `- User deadline is ${new Date(constraints.target_deadline).toLocaleDateString()}. Schedule ${scheduleWeeks} weeks is ${scheduleWeeks >= 3 ? 'a comfortable pace' : 'TIGHT - prioritize critical path tasks'}` : '- No deadline specified - maintain sustainable pace'}

MILESTONES (REQUIRED):
At the end of your response, after all tasks, you MUST include exactly this block. Do not omit it. List 2–5 concrete deliverables for this schedule period (what the user will have done by the end). Use the exact markers so we can parse them:

===MILESTONES===
1. [First concrete deliverable - e.g. "Onboarding flow documented and wireframes ready"]
2. [Second deliverable - e.g. "Task generation API integrated with Claude"]
3. [Third deliverable - add more if needed]
===END MILESTONES===

Now generate the task breakdown and end with the MILESTONES block above.`
}

// ============================================
// Helper Functions
// ============================================

/**
 * Log capacity breakdown: flexible_windows + fixed_windows + weekend + emergency → total (usable excluding emergency).
 */
function logCapacityBreakdown(constraints: ExtractedConstraints): void {
  const blocks = constraints.available_time || []
  const weekendDays = new Set(['saturday', 'sunday'])
  let flexW = 0
  let fixW = 0
  let weekW = 0
  let emergW = 0
  for (const b of blocks) {
    const block = b as TimeBlock & { label?: string }
    const day = String(block.day).toLowerCase()
    const label = (block.label ?? '').toLowerCase()
    const isEmergency = /emergency|late_night/.test(label)
    const isWeekend = weekendDays.has(day)
    if (typeof block.flexible_hours === 'number' && block.flexible_hours > 0) {
      const h = block.flexible_hours
      if (isEmergency) emergW += h
      else if (isWeekend) weekW += h
      else flexW += h
    } else {
      const h = calculateBlockMinutes(block) / 60
      if (isEmergency) emergW += h
      else if (isWeekend) weekW += h
      else fixW += h
    }
  }
  const total = flexW + fixW + weekW + emergW
  const usable = total - emergW
  console.log(
    `[ScheduleGeneration] Capacity: flexible_windows=${flexW.toFixed(0)}h + fixed_windows=${fixW.toFixed(0)}h + weekend=${weekW.toFixed(0)}h + emergency=${emergW.toFixed(0)}h → total=${total.toFixed(0)}h (emergency excluded from usable=${usable.toFixed(0)}h)`
  )
}

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
    if (typeof block.flexible_hours === 'number' && block.flexible_hours > 0) {
      return Math.round(block.flexible_hours * 60)
    }
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

/** Default available_time when User.availabilityWindows is missing or empty (e.g. 2h weekday evenings). */
const DEFAULT_AVAILABLE_TIME: TimeBlock[] = [
  { day: 'monday', start: '20:00', end: '22:00' },
  { day: 'tuesday', start: '20:00', end: '22:00' },
  { day: 'wednesday', start: '20:00', end: '22:00' },
  { day: 'thursday', start: '20:00', end: '22:00' },
  { day: 'friday', start: '20:00', end: '22:00' },
  { day: 'saturday', start: '09:00', end: '18:00' },
  { day: 'sunday', start: '09:00', end: '18:00' },
]

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

/**
 * Build ExtractedConstraints from Project and User records (last extracted data from onboarding).
 * Used when the user clicks "Build Schedule" so we use the same data as the Shadow Panel
 * (no second extraction). Prefers Project.contextData when present (e.g. from Settings).
 *
 * @param project - Project from DB (contextData, enrichment fields)
 * @param user - User from DB (availabilityWindows, workSchedule, commute, enrichment)
 * @returns ExtractedConstraints for generateTasks and assignTasksToSchedule
 */
export function buildConstraintsFromProjectAndUser(
  project: {
    contextData?: unknown
    target_deadline?: Date | string | null
    skill_level?: string | null
    tools_and_stack?: string[] | null
    project_type?: string | null
    weekly_hours_commitment?: number | null
    motivation?: string | null
    phases?: unknown
    projectNotes?: unknown
  },
  user: {
    availabilityWindows?: unknown
    workSchedule?: unknown
    commute?: unknown
    preferred_session_length?: number | null
    communication_style?: string | null
    userNotes?: unknown
    energy_peak?: string | null
  }
): ExtractedConstraints {
  const contextData = (project.contextData ?? {}) as Record<string, unknown>
  const prefs = (contextData.preferences ?? {}) as UserPreferences
  const preferences: UserPreferences = { ...prefs }

  // available_time: prefer User.availabilityWindows when present so flexible_hours from extraction is used (Session 2); else contextData
  let available_time: TimeBlock[] = []
  const windows = user.availabilityWindows as AvailabilityWindow[] | undefined
  if (Array.isArray(windows) && windows.length > 0) {
    for (const w of windows) {
      const days = Array.isArray(w.days) ? w.days : []
      const start = typeof w.start_time === 'string' ? w.start_time : '20:00'
      const end = typeof w.end_time === 'string' ? w.end_time : '22:00'
      const isFlexible = w.window_type === 'flexible' && typeof w.flexible_hours === 'number' && w.flexible_hours > 0
      for (const d of days) {
        const day = String(d).toLowerCase()
        if (DAY_NAME_TO_NUM[day] !== undefined) {
          const windowLabel = typeof w.type === 'string' ? w.type : undefined
          if (isFlexible) {
            available_time.push({ day, start, end, window_type: 'flexible', flexible_hours: w.flexible_hours!, label: windowLabel })
          } else {
            available_time.push({ day, start, end, window_type: 'fixed', label: windowLabel })
          }
        }
      }
    }
  }
  if (available_time.length === 0 && Array.isArray(contextData.available_time) && contextData.available_time.length > 0) {
    available_time = contextData.available_time as TimeBlock[]
    // Session 2: normalize flexible blocks missing flexible_hours (legacy data) so scheduler uses boundary for capacity
    available_time = available_time.map((b) => {
      const block = { ...b }
      const wt = (block as TimeBlock & { window_type?: string }).window_type
      if (wt === 'flexible') {
        const flex = (block as TimeBlock & { flexible_hours?: number }).flexible_hours
        if (typeof flex !== 'number' || flex <= 0) {
          const startH = parseTimeToHours(block.start)
          const endH = parseTimeToHours(block.end)
          const boundaryHours = endH > startH ? endH - startH : 24 - startH + endH
          ;(block as TimeBlock & { flexible_hours: number }).flexible_hours = boundaryHours > 0 ? boundaryHours : 1
        }
      }
      return block
    })
  }
  if (available_time.length === 0) {
    console.warn('[ScheduleGeneration] User.availabilityWindows missing or empty; using default weekday evenings')
    available_time = [...DEFAULT_AVAILABLE_TIME]
  }

  // schedule_duration_weeks: prefer contextData; else from target_deadline; else 2
  let schedule_duration_weeks = 2
  if (typeof contextData.schedule_duration_weeks === 'number' && contextData.schedule_duration_weeks >= 1) {
    schedule_duration_weeks = contextData.schedule_duration_weeks
  } else if (project.target_deadline) {
    const deadline = typeof project.target_deadline === 'string' ? new Date(project.target_deadline) : project.target_deadline
    if (!Number.isNaN(deadline.getTime())) {
      const now = new Date()
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const weeks = Math.ceil((deadline.getTime() - now.getTime()) / msPerWeek)
      schedule_duration_weeks = Math.max(1, weeks)
    }
  }

  // work_schedule: from User.workSchedule (onboarding shape or legacy workDays/startTime/endTime)
  let work_schedule: WorkScheduleShape | null = null
  const ws = user.workSchedule as Record<string, unknown> | undefined
  if (ws && typeof ws === 'object') {
    const workDays = ws.workDays as number[] | undefined
    const startTime = ws.startTime as string | undefined
    const endTime = ws.endTime as string | undefined
    if (Array.isArray(workDays) && workDays.length > 0 && startTime && endTime) {
      work_schedule = { workDays, startTime, endTime }
    } else {
      const days = ws.days as string[] | undefined
      const start_time = (ws.start_time as string) ?? '09:00'
      const end_time = (ws.end_time as string) ?? '17:30'
      if (Array.isArray(days) && days.length > 0) {
        const workDaysNum = days
          .map((d) => DAY_NAME_TO_NUM[String(d).toLowerCase()])
          .filter((n) => n !== undefined) as number[]
        if (workDaysNum.length > 0) {
          work_schedule = { workDays: [...new Set(workDaysNum)].sort((a, b) => a - b), startTime: start_time, endTime: end_time }
        }
      }
    }
  }

  // commute: from User.commute (onboarding uses duration/start_time -> durationMinutes/startTime)
  let commute: CommuteShape | null = null
  const comm = user.commute as Record<string, unknown> | undefined
  if (comm && typeof comm === 'object') {
    const morning = comm.morning as Record<string, unknown> | undefined
    const evening = comm.evening as Record<string, unknown> | undefined
    const out: CommuteShape = {}
    if (morning && typeof morning === 'object') {
      const dur = morning.durationMinutes ?? morning.duration
      const start = (morning.startTime ?? morning.start_time) as string | undefined
      if (typeof dur === 'number' && start) {
        out.morning = { durationMinutes: dur, startTime: String(start) }
      }
    }
    if (evening && typeof evening === 'object') {
      const dur = evening.durationMinutes ?? evening.duration
      const start = (evening.startTime ?? evening.start_time) as string | undefined
      if (typeof dur === 'number' && start) {
        out.evening = { durationMinutes: dur, startTime: String(start) }
      }
    }
    if (out.morning || out.evening) commute = out
  }

  // Normalize notes to ExtractedNote[]
  function toNotes(val: unknown): ExtractedNote[] {
    if (val == null) return []
    if (Array.isArray(val)) {
      return val
        .filter((x) => x && typeof x === 'object' && typeof (x as Record<string, unknown>).note === 'string')
        .map((x) => {
          const r = x as Record<string, unknown>
          const extracted_at = typeof r.extracted_at === 'string' ? r.extracted_at : new Date().toISOString()
          return { note: String(r.note), extracted_at }
        })
    }
    if (typeof val === 'string' && val.trim()) {
      return [{ note: val.trim(), extracted_at: new Date().toISOString() }]
    }
    return []
  }

  // phases: ensure ExtractedPhases shape (phases array + active_phase_id)
  let phases: ExtractedPhases | null = null
  const rawPhases = project.phases as Record<string, unknown> | undefined
  if (rawPhases && typeof rawPhases === 'object' && Array.isArray(rawPhases.phases) && rawPhases.phases.length > 0) {
    const phaseList = rawPhases.phases as Array<Record<string, unknown>>
    const phasesMapped = phaseList.map((p, i) => ({
      id: typeof p.id === 'number' ? p.id : i + 1,
      title: String(p.title ?? ''),
      goal: p.goal != null && p.goal !== '' ? String(p.goal) : null,
      deadline: p.deadline != null && p.deadline !== '' ? String(p.deadline) : null,
      status: String(p.status ?? 'future'),
    }))
    const activeId = typeof rawPhases.active_phase_id === 'number' ? rawPhases.active_phase_id : phasesMapped[0]?.id ?? 1
    phases = { phases: phasesMapped, active_phase_id: activeId }
  }

  const target_deadline =
    project.target_deadline != null
      ? typeof project.target_deadline === 'string'
        ? project.target_deadline
        : project.target_deadline.toISOString()
      : null

  const constraints: ExtractedConstraints = {
    schedule_duration_weeks,
    blocked_time: [],
    available_time,
    preferences,
    exclusions: Array.isArray(contextData.exclusions) ? (contextData.exclusions as string[]) : [],
    work_schedule: work_schedule ?? undefined,
    commute: commute ?? undefined,
    target_deadline: target_deadline ?? undefined,
    skill_level: project.skill_level ?? undefined,
    tools_and_stack: Array.isArray(project.tools_and_stack) ? project.tools_and_stack : undefined,
    project_type: project.project_type ?? undefined,
    weekly_hours_commitment: project.weekly_hours_commitment ?? undefined,
    motivation: project.motivation ?? undefined,
    phases: phases ?? undefined,
    project_notes: toNotes(project.projectNotes).length > 0 ? toNotes(project.projectNotes) : undefined,
    preferred_session_length: user.preferred_session_length ?? undefined,
    communication_style: user.communication_style ?? undefined,
    user_notes: toNotes(user.userNotes).length > 0 ? toNotes(user.userNotes) : undefined,
    energy_peak: user.energy_peak ?? undefined,
  }

  return constraints
}

/**
 * Derive work_schedule and commute from blocked_time when extraction did not output them.
 * Used so User.workSchedule and User.commute can be persisted even when Claude omits them.
 */
function deriveUserLifeConstraints(
  constraints: ExtractedConstraints
): ExtractedConstraints {
  const result = { ...constraints }
  const blocked = constraints.blocked_time || []

  const dayNameToNum: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }

  if (!result.work_schedule && blocked.length > 0) {
    // Find blocks that look like work (label contains work, classes, job, office) with same start/end
    const workLabels = /work|classes|job|office|full.?time/i
    const workBlocks = blocked.filter(
      (b) => b.label && workLabels.test(b.label)
    )
    if (workBlocks.length > 0) {
      const startTime = workBlocks[0].start
      const endTime = workBlocks[0].end
      const workDays = [...new Set(workBlocks.map((b) => dayNameToNum[b.day.toLowerCase()] ?? -1).filter((d) => d >= 0))].sort((a, b) => a - b)
      if (workDays.length > 0) {
        result.work_schedule = { workDays, startTime, endTime }
      }
    }
    // If no labeled work blocks, use first recurring block pattern (same start/end on multiple weekdays)
    if (!result.work_schedule && blocked.length >= 3) {
      const byKey = new Map<string, { day: string; start: string; end: string }[]>()
      for (const b of blocked) {
        const key = `${b.start}-${b.end}`
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key)!.push(b)
      }
      const best = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)[0]
      if (best && best[1].length >= 3) {
        const [startTime, endTime] = best[0].split('-')
        const workDays = [...new Set(best[1].map((b) => dayNameToNum[b.day.toLowerCase()] ?? -1).filter((d) => d >= 0))].sort((a, b) => a - b)
        result.work_schedule = { workDays, startTime, endTime }
      }
    }
  }

  // commute: leave null if not extracted; we don't infer from blocked_time by default
  return result
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
 * @param userId - Optional; if provided, usage is logged for cost tracking
 * @returns Extracted constraints object
 */
export async function extractConstraints(
  conversationText: string,
  userId?: string
): Promise<ExtractedConstraints> {
  console.log('[ScheduleGeneration] Extracting constraints from conversation...')

  try {
    // Claude Haiku for extraction (constraints + enrichment); model from centralized config.
    const response = await withAnthropicRetry(() =>
      anthropic.messages.create({
        model: MODELS.CONSTRAINTS_EXTRACTION,
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: conversationText,
          },
        ],
      })
    )

    if (userId) {
      logApiUsage({
        userId,
        feature: 'constraints_extraction',
        model: MODELS.CONSTRAINTS_EXTRACTION,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }).catch(() => {})
    }

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

    // Derive work_schedule and commute from blocked_time if extraction did not provide them
    constraints = deriveUserLifeConstraints(constraints)

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
 * @param userId - Optional; if provided, usage is logged for cost tracking
 * @returns Raw Claude response text with task breakdown
 */
export async function generateTasks(
  conversationText: string,
  constraints: ExtractedConstraints,
  userId?: string
): Promise<string> {
  logCapacityBreakdown(constraints)
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

  // Call Claude API (with retry on 529 overloaded / 429 rate limit)
  const response = await withAnthropicRetry(() =>
    anthropic.messages.create({
      model: MODELS.TASK_GENERATION,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Project conversation:\n\n${conversationText}`,
        },
      ],
    })
  )

  if (userId) {
    logApiUsage({
      userId,
      feature: 'task_generation',
      model: MODELS.TASK_GENERATION,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {})
  }

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

  console.log('[ScheduleGeneration] parseTasks: raw response length=', claudeResponse.length)
  console.log('[ScheduleGeneration] parseTasks: raw response (first 600 chars)=', claudeResponse.substring(0, 600))

  // Strip markdown code block if Claude wrapped the output in ``` ... ```
  let tasksText = stripMarkdownCodeBlocks(claudeResponse)
  console.log('[ScheduleGeneration] parseTasks: after stripMarkdownCodeBlocks length=', tasksText.length)
  console.log('[ScheduleGeneration] parseTasks: after strip (first 400 chars)=', tasksText.substring(0, 400))

  // Extract milestones: require exact markers, then try case-insensitive fallback
  const milestonesMarkerStart = '===MILESTONES==='
  const milestonesMarkerEnd = '===END MILESTONES==='
  if (tasksText.includes(milestonesMarkerStart)) {
    const parts = tasksText.split(milestonesMarkerStart)
    tasksText = parts[0]
    if (parts.length > 1) {
      const block = parts[1].split(milestonesMarkerEnd)[0]
      milestones = block.trim()
    }
    console.log('[ScheduleGeneration] parseTasks: milestones section found, tasksText length now=', tasksText.length)
  } else {
    // Fallback: look for case-insensitive markers (Claude sometimes varies casing)
    const reStart = /===MILESTONES===/i
    const reEnd = /===END\s*MILESTONES===/i
    const matchStart = tasksText.match(reStart)
    const matchEnd = tasksText.match(reEnd)
    if (matchStart && matchEnd && matchStart.index != null && matchEnd.index != null && matchEnd.index > matchStart.index) {
      const start = matchStart.index + matchStart[0].length
      milestones = tasksText.slice(start, matchEnd.index).trim()
      tasksText = tasksText.slice(0, matchStart.index)
      console.log('[ScheduleGeneration] parseTasks: milestones section found (fallback), tasksText length now=', tasksText.length)
    }
  }
  // Fallback 2: if still no milestones, look for "By end of week N" or similar followed by numbered list at end of response (run on last 1500 chars only to avoid regex backtracking on long text)
  if (!milestones && tasksText.length > 200) {
    const tail = tasksText.slice(-1500)
    const byEndOfWeek = /(?:by end of (?:week|this period)|deliverables?|milestones?)\s*:?\s*\n([\s\S]{1,800})$/im
    const m = tail.match(byEndOfWeek)
    if (m && m[1]) {
      const candidate = m[1].trim()
      // Only use if it contains at least one numbered line
      if (/\n\s*\d+[.)]\s*\S/.test(candidate) || /^\s*\d+[.)]\s*\S/m.test(candidate)) {
        milestones = candidate
        console.log('[ScheduleGeneration] parseTasks: milestones extracted from fallback pattern')
      }
    }
  }

  // Match "TASK:" or "TASK 1:", "TASK 2:", etc. (Claude sometimes numbers headers)
  const TASK_HEADER_RE = /\bTASK\s*\d*\s*:/i

  // Split into task blocks by "---" on its own line (so "---" inside description/SUCCESS doesn't split)
  let taskBlocks = tasksText.split(/\n\s*---\s*\n/)
  console.log('[ScheduleGeneration] parseTasks: split by \\n---\\n gave', taskBlocks.length, 'blocks')

  const blocksWithTask = taskBlocks.filter((b) => TASK_HEADER_RE.test(b.trim()))
  console.log('[ScheduleGeneration] parseTasks: blocks containing TASK: (i)=', blocksWithTask.length)

  if (blocksWithTask.length === 0) {
    taskBlocks = tasksText.split('---')
    console.log('[ScheduleGeneration] parseTasks: fallback split by "---" gave', taskBlocks.length, 'blocks')
    const blocksWithTaskFallback = taskBlocks.filter((b) => TASK_HEADER_RE.test(b.trim()))
    console.log('[ScheduleGeneration] parseTasks: (fallback) blocks containing TASK:=', blocksWithTaskFallback.length)
  }

  for (let i = 0; i < taskBlocks.length; i++) {
    const block = taskBlocks[i]
    const trimmedBlock = block.trim()

    if (!trimmedBlock) {
      console.log('[ScheduleGeneration] parseTasks: block', i, 'empty, skip')
      continue
    }
    if (!TASK_HEADER_RE.test(trimmedBlock)) {
      console.log('[ScheduleGeneration] parseTasks: block', i, 'no TASK: found, skip. First 120 chars=', trimmedBlock.substring(0, 120))
      continue
    }

    console.log('[ScheduleGeneration] parseTasks: parsing block', i, 'length=', trimmedBlock.length, 'first 180 chars=', trimmedBlock.substring(0, 180))
    const task = parseTaskBlock(trimmedBlock)

    if (task.title) {
      tasks.push(task)
      console.log(
        `[ScheduleGeneration] ParsedTask: "${task.title}" energy_required=${task.energy_required ?? '—'} preferred_slot=${task.preferred_slot ?? '—'}`
      )
    } else {
      console.log(
        '[ScheduleGeneration] parseTasks: block',
        i,
        'returned EMPTY title. Block first 250 chars=',
        trimmedBlock.substring(0, 250)
      )
    }
  }

  console.log('[ScheduleGeneration] Parsed', tasks.length, 'tasks')

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

  // Extract title: "TASK: title", "TASK 1: title", or markdown prefix (e.g. "## TASK 1: Set up")
  // Strip leading ** (from **TASK:) and trailing ** left by markdown parsing
  const TASK_TITLE_RE = /\bTASK\s*\d*\s*:\s*(.+)$/i
  for (const line of lines) {
    const match = line.match(TASK_TITLE_RE)
    if (match && match[1].trim()) {
      task.title = match[1].replace(/^\*\*/, '').replace(/\*\*$/g, '').trim()
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
      if (/^(HOURS|PRIORITY|LABEL|DEPENDS_ON|ENERGY_REQUIRED|PREFERRED_SLOT|TASK|DESCRIPTION):/i.test(trimmed)) break
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

  // Extract energy_required (Session 4 scheduling metadata)
  const energyRequiredValues = ['high', 'medium', 'low'] as const
  for (const line of lines) {
    if (line.toUpperCase().startsWith('ENERGY_REQUIRED:')) {
      const value = line.replace(/energy_required:/i, '').trim().toLowerCase()
      if (energyRequiredValues.includes(value as (typeof energyRequiredValues)[number])) {
        task.energy_required = value as (typeof energyRequiredValues)[number]
      }
      break
    }
  }

  // Extract preferred_slot (Session 4 scheduling metadata)
  const preferredSlotValues = ['peak_energy', 'normal', 'flexible'] as const
  for (const line of lines) {
    if (line.toUpperCase().startsWith('PREFERRED_SLOT:')) {
      const value = line.replace(/preferred_slot:/i, '').trim().toLowerCase()
      if (preferredSlotValues.includes(value as (typeof preferredSlotValues)[number])) {
        task.preferred_slot = value as (typeof preferredSlotValues)[number]
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

/** Session 2: context for generating Harvey's post-schedule coaching message */
export interface ScheduleCoachingContext {
  totalTasksScheduled: number
  totalHoursScheduled: number
  slotTypeCounts: Record<string, number>
  weekendHoursUsed: number
  weekendHoursAvailable: number
  tasksSplit: number
  startDate: string
  durationWeeks: number
  energy_peak: string | null
  preferred_session_length: number | null
  projectTitle: string
  target_deadline: string | null
  phasesSummary?: string
}

const COACHING_SYSTEM_PROMPT = `You are Harvey, a friendly AI project coach. After building a user's schedule, you write a short coaching message (3–4 sentences) that:
1. Explains how tasks were distributed (e.g. high-energy tasks in peak hours).
2. Explains why certain choices were made (e.g. left weekends free because work fit in weekdays).
3. Tells the user what to focus on first (e.g. "Start with X today — it'll set you up for Y tomorrow").
4. Mentions any constraints you respected (e.g. splits across days, emergency buffer use).

Write in a warm, concise voice. No markdown, no bullet points — plain text only. Address the user directly ("I've placed...", "Start with...").`

/**
 * Generate Harvey's post-schedule coaching message via Claude (Session 2).
 * Returns plain text; throws on API failure (caller should use fallback).
 * @param userId - Optional; if provided, usage is logged for cost tracking
 */
export async function generateScheduleCoachingMessage(
  context: ScheduleCoachingContext,
  userId?: string
): Promise<string> {
  const userPrompt = `Scheduling context (use this to write your 3–4 sentence coaching message):
- Total task blocks scheduled: ${context.totalTasksScheduled}
- Total hours scheduled: ${context.totalHoursScheduled.toFixed(1)}h
- Tasks by slot type: peak_energy=${context.slotTypeCounts.peak_energy ?? 0}, normal=${context.slotTypeCounts.normal ?? 0}, flexible=${context.slotTypeCounts.flexible ?? 0}, emergency=${context.slotTypeCounts.emergency ?? 0}
- Weekend: ${context.weekendHoursUsed.toFixed(1)}h used of ${context.weekendHoursAvailable.toFixed(1)}h available
- Tasks split across multiple days: ${context.tasksSplit}
- Schedule: ${context.durationWeeks} week(s) starting ${context.startDate}
- User energy peak: ${context.energy_peak ?? 'not set'}; preferred session length: ${context.preferred_session_length ?? '—'} min
- Project: "${context.projectTitle}"${context.target_deadline ? `, deadline ${context.target_deadline}` : ''}${context.phasesSummary ? `; ${context.phasesSummary}` : ''}

Write your coaching message now (plain text, 3–4 sentences):`

  const response = await withAnthropicRetry(() =>
    anthropic.messages.create({
      model: MODELS.SCHEDULE_COACHING,
      max_tokens: 400,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  )

  if (userId) {
    logApiUsage({
      userId,
      feature: 'schedule_coaching',
      model: MODELS.SCHEDULE_COACHING,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {})
  }

  const textBlock = response.content.find((block) => block.type === 'text')
  const text = textBlock?.type === 'text' ? textBlock.text.trim() : ''
  if (!text) throw new Error('Empty coaching message response')
  return text
}
