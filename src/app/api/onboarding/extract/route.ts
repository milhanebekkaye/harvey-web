/**
 * Onboarding Extraction API
 *
 * POST /api/onboarding/extract
 *
 * Reads the full onboarding conversation, calls Haiku to extract structured fields,
 * saves to DB (merge logic: don't overwrite with null), and returns extracted + saved.
 * Part of Feature D (Shadow Panel). Triggered after every Harvey message during onboarding.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getOnboardingDiscussion } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import { anthropic } from '@/lib/ai/claude-client'
import { MODELS } from '@/lib/ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'
import { updateUser } from '@/lib/users/user-service'
import { updateProject } from '@/lib/projects/project-service'
import { computeMissingFields } from '@/lib/onboarding/missing-fields'
import { getDateStringInTimezone } from '@/lib/timezone'
import { toNoonUTC } from '@/lib/utils/date-utils'

const EXTRACTION_PROMPT = `You are extracting structured data for Harvey, an AI project coach.

Your task: Update the user's extracted profile based on new information 
from the latest messages. Return ONLY valid JSON. No markdown, no 
backticks, no preamble text.

You will receive:
1. CURRENT EXTRACTED STATE — everything already known (may have nulls)
2. LAST MESSAGES — only the 2-3 most recent messages from the conversation

Rules:
- Read CURRENT EXTRACTED STATE as ground truth
- Read LAST MESSAGES and identify new information or explicit corrections
- Return the COMPLETE updated JSON with ALL fields filled
- For notes fields (userNotes, projectNotes): if new info is found, return 
  the existing notes with the new information appended as a new sentence. 
  Never truncate or remove existing notes content.
- For refineable text fields (description, goals, motivation): these 
  should improve as the conversation reveals richer context. If you now 
  have more specific or accurate information than what is currently stored, 
  rewrite the field with a better version. A better version is more 
  specific, more accurate, or better captures the user's actual intent. 
  Only rewrite if strictly better — if unsure, keep the existing value 
  exactly as-is. If the user explicitly corrects one of these fields, 
  always apply the correction.
- For array fields (availabilityWindows, phases, tools_and_stack): return 
  the complete updated array. If the user corrected or added something, 
  apply the change to the full array and return it whole. Never return a 
  partial array.
- For scalar fields (title, timezone, skill_level, etc.): return the 
  existing value unless the user explicitly stated a correction
- NEVER return null for a field that already has a non-null value in 
  CURRENT EXTRACTED STATE, unless the user explicitly said to remove it
- If nothing changed for a field, return the existing value exactly as-is
- Only extract information explicitly stated by the user. Do not infer.

Output format — return this exact structure:
{
  "user": {
    "timezone": string | null,
    "workSchedule": { "days": string[], "start_time": string, "end_time": string } | null,
    "commute": { "morning": { "duration": number, "start_time": string }, "evening": { "duration": number, "start_time": string } } | null,
    "availabilityWindows": [{ "days": string[], "start_time": string, "end_time": string, "type": string, "window_type": "fixed" | "flexible", "flexible_hours": number | null }] | null,
    "preferred_session_length": number | null,
    "communication_style": string | null,
    "userNotes": string | null,
    "energy_peak": "morning" | "afternoon" | "evening" | null
  },
  "project": {
    "title": string | null,
    "description": string | null,
    "goals": string | null,
    "project_type": string | null,
    "target_deadline": string (ISO 8601) | null,
    "weekly_hours_commitment": number | null,
    "task_preference": "quick_wins" | "deep_focus" | "mixed" | null,
    "tools_and_stack": string[] | null,
    "skill_level": string | null,
    "motivation": string | null,
    "phases": { "phases": [{ "id": number, "title": string, "goal": string, "status": "active"|"future"|"completed", "deadline": string | null }], "active_phase_id": number | null } | null,
    "projectNotes": string | null,
    "schedule_start_date": string (ISO date YYYY-MM-DD) | null,
    "schedule_duration_days": number | null
  },
  "completion_confidence": number
}

Field-Specific Guidance:
- availabilityWindows: FIXED = specific predictable time block every day. 
  FLEXIBLE = X hours available inside a larger boundary, exact timing varies.
  Always include "type" label (work_on_project, evening_work, weekend, etc.)
- workSchedule: Their job hours specifically
- tools_and_stack: Programming languages, frameworks, tools mentioned
- skill_level: "beginner", "intermediate", "advanced" or infer from context
- communication_style: Infer from how user writes (brief = "direct", detailed = "detailed")
- weekly_hours_commitment: Hours per week on THIS project
- task_preference: "quick_wins", "deep_focus", or "mixed"
- preferred_session_length: Minutes they can focus in one sitting (number)
- energy_peak: "morning" (05-11), "afternoon" (12-17), "evening" (18-23)
- phases: Object with "phases" array and "active_phase_id". Each phase: 
  id (1-based), title, goal, status, deadline (ISO or null)
- schedule_start_date: When they want to start. Parse natural language to 
  YYYY-MM-DD. "today", "tomorrow", "next Monday" etc.
- schedule_duration_days: How many days to plan the schedule for. "1 week" -> 7, 
  "2 weeks" -> 14, "3 weeks" -> 21. "Full timeline" or "until deadline" -> 0 
  (system will use deadline). Non-negative integer.
- target_deadline: Specific calendar day as YYYY-MM-DD. Never just a year.

completion_confidence rules:
- Represents how complete the profile is (0-75 max, never 80+)
- Previous value: {{PREVIOUS_CONFIDENCE}}
- Maximum allowed this turn: {{MAX_CONFIDENCE}}
- Increase only if genuinely new blocking fields were filled
{{TODAY_LINE}}
CURRENT EXTRACTED STATE:
{{CURRENT_EXTRACTED_STATE}}

Last messages:
`

/** Build extraction prompt with previous-confidence cap and optional today (user TZ) injected. */
function buildExtractionPrompt(
  previousConfidence: number,
  todayInUserTZ?: string,
  currentExtractedState?: object
): string {
  const prev = Math.min(75, Math.max(0, Math.round(previousConfidence)))
  const maxAllowed = Math.min(75, prev + 15)
  let out = EXTRACTION_PROMPT
    .replace('{{PREVIOUS_CONFIDENCE}}', String(prev))
    .replace('{{MAX_CONFIDENCE}}', String(maxAllowed))

  const todayLine =
    todayInUserTZ != null
      ? `Today's date (user timezone): ${todayInUserTZ}\nUse this to resolve any relative dates.\n\n`
      : ''
  out = out.replace('{{TODAY_LINE}}', todayLine)

  const stateJson = currentExtractedState
    ? JSON.stringify(currentExtractedState, null, 2)
    : '{}'
  out = out.replace('{{CURRENT_EXTRACTED_STATE}}', stateJson)

  return out
}

function parseIfString(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

/** Normalize LLM output to availabilityWindows array. Handles single object, nested { windows } or { availabilityWindows }, or existing array. */
function normalizeAvailabilityWindows(raw: unknown): unknown[] | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.availabilityWindows)) return o.availabilityWindows as unknown[]
    if (Array.isArray(o.windows)) return o.windows as unknown[]
    if (Array.isArray(o.window)) return o.window as unknown[]
    // Single window object (has days or start_time/end_time)
    if (Array.isArray(o.days) || typeof o.start_time === 'string' || typeof o.end_time === 'string') {
      return [raw]
    }
  }
  return null
}

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.trim().split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] != null ? parseInt(parts[1], 10) : 0
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/** Parse ISO date string to Date; return null if invalid. Uses noon UTC for YYYY-MM-DD to avoid off-by-one. */
function parseValidDate(value: unknown): Date | null {
  if (value == null) return null
  const str = typeof value === 'string' ? value.trim() : String(value)
  if (!str) return null
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(str)) {
    const dateOnly = str.slice(0, 10)
    const d = toNoonUTC(dateOnly)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Parse schedule_start_date: ISO date, or "today"/"tomorrow"/"next_monday" resolved relative to now. */
function parseScheduleStartDate(value: unknown): Date | null {
  if (value == null) return null
  const str = (typeof value === 'string' ? value.trim() : String(value)).toLowerCase()
  if (!str) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (str === 'today') return today
  if (str === 'tomorrow') {
    const t = new Date(today)
    t.setDate(t.getDate() + 1)
    return t
  }
  if (/^next?_?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(str) || /^(monday|tue|wed|thu|fri|sat|sun)day?$/i.test(str)) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const match = str.replace(/^next?_?/, '').toLowerCase()
    let targetDay = dayNames.find((d) => d.startsWith(match) || match.startsWith(d.slice(0, 3)))
    if (!targetDay) targetDay = 'monday'
    const targetIdx = dayNames.indexOf(targetDay)
    let currentIdx = today.getDay()
    let days = targetIdx - currentIdx
    if (days <= 0) days += 7
    const out = new Date(today)
    out.setDate(out.getDate() + days)
    return out
  }
  return parseValidDate(str)
}

/** Canonical phases shape we store in DB and return to the client. */
type CanonicalPhases = {
  phases: Array<{ id: number; title: string; goal: string; status: string; deadline: string | null }>
  active_phase_id: number | null
}

/** Normalize whatever the model returns (e.g. phase_1: "string" or legacy formats) into { phases: [...], active_phase_id }. */
function normalizePhasesToCanonical(raw: unknown): CanonicalPhases | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  // Already canonical: has phases array
  if (Array.isArray(o.phases) && o.phases.length > 0) {
    const phases = (o.phases as unknown[]).map((p, i) => {
      const x = (p ?? {}) as Record<string, unknown>
      return {
        id: typeof x.id === 'number' ? x.id : i + 1,
        title: String(x.title ?? x.name ?? ''),
        goal: String(x.goal ?? x.description ?? ''),
        status: String(x.status ?? 'future'),
        deadline: x.deadline != null && x.deadline !== '' ? String(x.deadline) : null,
      }
    })
    const activeId = typeof o.active_phase_id === 'number' ? o.active_phase_id : (phases[0]?.id ?? null)
    return { phases, active_phase_id: activeId }
  }

  // Flat format: phase_1: "string", phase_2: "string" (or phase_N: { title, goal } )
  const entries = Object.entries(o).filter(([k]) => k.startsWith('phase_'))
  if (entries.length > 0) {
    const phases = entries.map(([, v], i) => {
      let title = ''
      let goal = ''
      if (typeof v === 'string') {
        title = v
      } else if (v != null && typeof v === 'object') {
        const x = v as Record<string, unknown>
        title = String(x.title ?? x.name ?? '')
        goal = String(x.goal ?? x.description ?? '')
      }
      return {
        id: i + 1,
        title,
        goal,
        status: 'future' as const,
        deadline: null as string | null,
      }
    })
    return { phases, active_phase_id: 1 }
  }

  // Empty array
  if (Array.isArray(o.phases) && o.phases.length === 0) {
    return { phases: [], active_phase_id: null }
  }

  return null
}

function computeWeeklyHoursFromAvailabilityWindows(
  windows: Array<{
    days?: string[]
    start_time?: string
    end_time?: string
    window_type?: string
    flexible_hours?: number | null
  }>
): number {
  if (!Array.isArray(windows) || windows.length === 0) return 0
  let totalMinutes = 0
  for (const w of windows) {
    const days = Array.isArray(w.days) ? w.days : []
    if (days.length === 0) continue
    if (w.window_type === 'flexible' && typeof w.flexible_hours === 'number' && w.flexible_hours > 0) {
      totalMinutes += w.flexible_hours * 60 * days.length
      continue
    }
    const startM = parseTimeToMinutes(String(w.start_time ?? ''))
    const endM = parseTimeToMinutes(String(w.end_time ?? ''))
    if (startM == null || endM == null) continue
    let durationMinutes: number
    if (endM > startM) durationMinutes = endM - startM
    else if (endM < startM) durationMinutes = 24 * 60 - startM + endM
    else durationMinutes = 0
    totalMinutes += durationMinutes * days.length
  }
  return Math.round(totalMinutes / 60)
}

export async function POST(request: Request) {
  try {
    // 1. Auth check (existing Supabase auth pattern)
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // 2. Parse body: { projectId: string; previousConfidence?: number }
    let body: { projectId?: string; previousConfidence?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const projectId = body.projectId
    const previousConfidence =
      typeof body.previousConfidence === 'number'
        ? Math.min(100, Math.max(0, Math.round(body.previousConfidence)))
        : 0
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid projectId' },
        { status: 400 }
      )
    }

    // 3. Verify project ownership and load user for timezone
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { user: true },
    })
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or access denied', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }
    const userTimezone = (project.user as { timezone?: string })?.timezone ?? 'Europe/Paris'
    const todayInUserTZ = getDateStringInTimezone(new Date(), userTimezone)

    // 4. Load onboarding discussion and build conversation text
    const discussion = await getOnboardingDiscussion(projectId, user.id)
    if (!discussion || !discussion.messages?.length) {
      return NextResponse.json(
        { error: 'No onboarding conversation found for this project' },
        { status: 404 }
      )
    }

    const messages = discussion.messages
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Harvey'}: ${m.content}`)
      .join('\n\n')

    // Step 1 (delta prep): last N messages and current DB state for future delta extraction
    const lastMessages = messages.slice(-3)
    const conversationTextDelta = lastMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Harvey'}: ${m.content}`)
      .join('\n\n')
    const dbUser = project.user as {
      timezone?: string | null
      workSchedule?: unknown
      commute?: unknown
      availabilityWindows?: unknown
      preferred_session_length?: number | null
      communication_style?: string | null
      userNotes?: unknown
      energy_peak?: string | null
    }
    const currentExtractedState = {
      user: {
        timezone: dbUser.timezone,
        workSchedule: dbUser.workSchedule,
        commute: dbUser.commute,
        availabilityWindows: dbUser.availabilityWindows,
        preferred_session_length: dbUser.preferred_session_length,
        communication_style: dbUser.communication_style,
        userNotes: dbUser.userNotes,
        energy_peak: dbUser.energy_peak,
      },
      project: {
        title: project.title,
        description: project.description,
        goals: project.goals,
        project_type: project.project_type,
        target_deadline: project.target_deadline,
        weekly_hours_commitment: project.weekly_hours_commitment,
        task_preference: project.task_preference,
        tools_and_stack: project.tools_and_stack,
        skill_level: project.skill_level,
        motivation: project.motivation,
        phases: project.phases,
        projectNotes: project.projectNotes,
        schedule_start_date: project.schedule_start_date,
        schedule_duration_days: project.schedule_duration_days,
      },
    }
    console.log('[OnboardingExtract] Running extraction | projectId:', projectId, '| messages:', messages.length, '| previousConfidence:', previousConfidence)

    // 5. Call Haiku with extraction prompt (includes previous-confidence cap, today in user TZ, current state; only last messages as conversation)
    const extractionPromptWithCap = buildExtractionPrompt(
      previousConfidence,
      todayInUserTZ,
      currentExtractedState
    )
    const response = await anthropic.messages.create({
      model: MODELS.ONBOARDING_EXTRACTION,
      max_tokens: 2000,
      messages: [{ role: 'user', content: extractionPromptWithCap + conversationTextDelta }],
    })

    logApiUsage({
      userId: user.id,
      feature: 'onboarding_extraction',
      model: MODELS.ONBOARDING_EXTRACTION,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {})

    const textBlock = response.content.find((block) => block.type === 'text')
    let extractedText = textBlock?.type === 'text' ? textBlock.text : ''
    if (!extractedText.trim()) {
      console.error('[OnboardingExtract] Empty response from Haiku')
      return NextResponse.json(
        { error: 'Extraction returned no content' },
        { status: 500 }
      )
    }

    // Strip markdown code blocks if present
    extractedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const firstBrace = extractedText.indexOf('{')
    const lastBrace = extractedText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      extractedText = extractedText.substring(firstBrace, lastBrace + 1)
    }

    // 6. Parse and validate response
    let parsed: { user?: Record<string, unknown>; project?: Record<string, unknown>; completion_confidence?: unknown }
    try {
      parsed = JSON.parse(extractedText) as typeof parsed
    } catch (parseErr) {
      console.error('[OnboardingExtract] JSON parse failed:', parseErr)
      return NextResponse.json(
        { error: 'Extraction returned invalid JSON' },
        { status: 500 }
      )
    }

    let extracted: { user: Record<string, unknown>; project: Record<string, unknown> } = {
      user: parsed.user && typeof parsed.user === 'object' ? parsed.user : {},
      project: parsed.project && typeof parsed.project === 'object' ? parsed.project : {},
    }

    // Parse completion_confidence: Haiku is capped at 75; apply hard clamp then +15 per-turn cap (ceiling 75)
    const rawConfidence =
      typeof parsed.completion_confidence === 'number'
        ? parsed.completion_confidence
        : parsed.completion_confidence != null
          ? parseInt(String(parsed.completion_confidence), 10)
          : 0
    const clampedConfidence = Math.min(75, Math.max(0, Math.round(Number.isNaN(rawConfidence) ? 0 : rawConfidence)))
    const capCeiling = Math.min(75, previousConfidence + 15)
    const completionConfidence = Math.min(clampedConfidence, capCeiling)
    console.log(
      `[Harvey Confidence] extract response → raw: ${rawConfidence}, clamped: ${clampedConfidence}, previous: ${previousConfidence}, cap_ceiling: ${capCeiling}`
    )

    // Defensive parsing: handle stringified arrays/objects
    if (extracted.user.availabilityWindows != null) {
      const parsed = parseIfString(extracted.user.availabilityWindows)
      const normalized = normalizeAvailabilityWindows(parsed)
      extracted.user.availabilityWindows = normalized != null ? normalized : null
      if (normalized === null && parsed != null) {
        console.warn('[OnboardingExtract] availabilityWindows was not an array; skipping persistence for this field')
      }
    }
    if (extracted.user.workSchedule != null) {
      extracted.user.workSchedule = parseIfString(extracted.user.workSchedule)
    }
    if (extracted.user.commute != null) {
      extracted.user.commute = parseIfString(extracted.user.commute)
    }
    if (extracted.project.tools_and_stack != null) {
      extracted.project.tools_and_stack = parseIfString(extracted.project.tools_and_stack)
    }
    if (extracted.project.phases != null) {
      extracted.project.phases = parseIfString(extracted.project.phases)
      const canonicalPhases = normalizePhasesToCanonical(extracted.project.phases)
      if (canonicalPhases != null) extracted.project.phases = canonicalPhases
    }

    // availabilityWindows is already normalized above (array or null)
    // Validate other array fields
    if (extracted.project.tools_and_stack != null && !Array.isArray(extracted.project.tools_and_stack)) {
      console.error('[OnboardingExtract] tools_and_stack is not an array')
      return NextResponse.json(
        { error: 'tools_and_stack must be an array' },
        { status: 500 }
      )
    }

    // Validate number fields (coerce if string)
    if (extracted.user.preferred_session_length != null && typeof extracted.user.preferred_session_length !== 'number') {
      const n = parseInt(String(extracted.user.preferred_session_length), 10)
      extracted.user.preferred_session_length = Number.isNaN(n) ? null : n
    }
    if (extracted.project.weekly_hours_commitment != null && typeof extracted.project.weekly_hours_commitment !== 'number') {
      const n = parseInt(String(extracted.project.weekly_hours_commitment), 10)
      extracted.project.weekly_hours_commitment = Number.isNaN(n) ? null : n
    }
    if (extracted.project.schedule_duration_days != null && typeof extracted.project.schedule_duration_days !== 'number') {
      const n = parseInt(String(extracted.project.schedule_duration_days), 10)
      extracted.project.schedule_duration_days = Number.isNaN(n) || n < 0 ? null : n
    }

    // 7. Build update payloads (merge logic: only non-null from extraction)
    const userUpdates: Record<string, unknown> = {}
    if (extracted.user.timezone !== undefined && extracted.user.timezone !== null) userUpdates.timezone = extracted.user.timezone
    if (extracted.user.workSchedule !== undefined && extracted.user.workSchedule !== null) userUpdates.workSchedule = extracted.user.workSchedule
    if (extracted.user.commute !== undefined && extracted.user.commute !== null) userUpdates.commute = extracted.user.commute
    if (extracted.user.availabilityWindows !== undefined && extracted.user.availabilityWindows !== null) userUpdates.availabilityWindows = extracted.user.availabilityWindows
    if (extracted.user.preferred_session_length !== undefined && extracted.user.preferred_session_length !== null) userUpdates.preferred_session_length = extracted.user.preferred_session_length
    if (extracted.user.communication_style !== undefined && extracted.user.communication_style !== null) userUpdates.communication_style = extracted.user.communication_style
    if (extracted.user.userNotes !== undefined && extracted.user.userNotes !== null) userUpdates.userNotes = extracted.user.userNotes
    if (extracted.user.energy_peak !== undefined && extracted.user.energy_peak !== null) userUpdates.energy_peak = extracted.user.energy_peak

    const projectUpdates: Record<string, unknown> = {}
    if (extracted.project.title !== undefined && extracted.project.title !== null) projectUpdates.title = extracted.project.title
    if (extracted.project.description !== undefined && extracted.project.description !== null) projectUpdates.description = extracted.project.description
    if (extracted.project.goals !== undefined && extracted.project.goals !== null) projectUpdates.goals = extracted.project.goals
    if (extracted.project.project_type !== undefined && extracted.project.project_type !== null) projectUpdates.project_type = extracted.project.project_type
    const targetDeadlineDate = parseValidDate(extracted.project.target_deadline)
    if (targetDeadlineDate !== null) projectUpdates.target_deadline = targetDeadlineDate
    if (extracted.project.weekly_hours_commitment !== undefined && extracted.project.weekly_hours_commitment !== null) projectUpdates.weekly_hours_commitment = extracted.project.weekly_hours_commitment
    if (extracted.project.task_preference !== undefined && extracted.project.task_preference !== null) projectUpdates.task_preference = extracted.project.task_preference
    if (extracted.project.tools_and_stack !== undefined && extracted.project.tools_and_stack !== null) projectUpdates.tools_and_stack = extracted.project.tools_and_stack
    if (extracted.project.skill_level !== undefined && extracted.project.skill_level !== null) projectUpdates.skill_level = extracted.project.skill_level
    if (extracted.project.motivation !== undefined && extracted.project.motivation !== null) projectUpdates.motivation = extracted.project.motivation
    if (extracted.project.phases !== undefined && extracted.project.phases !== null) projectUpdates.phases = extracted.project.phases
    if (extracted.project.projectNotes !== undefined && extracted.project.projectNotes !== null) projectUpdates.projectNotes = extracted.project.projectNotes
    const scheduleStartDateParsed = parseScheduleStartDate(extracted.project.schedule_start_date)
    if (scheduleStartDateParsed !== null) projectUpdates.schedule_start_date = scheduleStartDateParsed
    if (typeof extracted.project.schedule_duration_days === 'number' && extracted.project.schedule_duration_days >= 0) {
      projectUpdates.schedule_duration_days = extracted.project.schedule_duration_days
    }

    // If weekly_hours_commitment was not extracted, derive from availabilityWindows
    const hasWeeklyHours = extracted.project.weekly_hours_commitment !== undefined && extracted.project.weekly_hours_commitment !== null
    const availabilityWindows = extracted.user.availabilityWindows
    if (!hasWeeklyHours && Array.isArray(availabilityWindows) && availabilityWindows.length > 0) {
      const computed = computeWeeklyHoursFromAvailabilityWindows(availabilityWindows)
      if (computed > 0) {
        projectUpdates.weekly_hours_commitment = computed
        extracted.project.weekly_hours_commitment = computed
      }
    }

    // 8. Save to database
    const userId = project.userId
    try {
      if (Object.keys(userUpdates).length > 0) {
        const userResult = await updateUser(userId, userUpdates)
        if (!userResult.success) throw new Error(userResult.error?.message ?? 'User update failed')
      }
      if (Object.keys(projectUpdates).length > 0) {
        const projectResult = await updateProject(projectId, userId, projectUpdates)
        if (!projectResult.success) throw new Error(projectResult.error?.message ?? 'Project update failed')
      }
    } catch (dbErr) {
      console.error('[OnboardingExtract] Database save failed:', dbErr)
      return NextResponse.json({ error: 'Failed to save extracted data' }, { status: 500 })
    }

    // 8b. Compute missing blocking/enriching fields from fresh DB state (for frontend button + Harvey guidance)
    console.log('[OnboardingExtract] Computing missing fields after save', { projectId, userId })
    let missingBlockingFields: string[] = []
    let missingEnrichingFields: string[] = []
    try {
      const missing = await computeMissingFields(projectId, userId)
      missingBlockingFields = missing.blocking
      missingEnrichingFields = missing.enriching
      console.log('[OnboardingExtract] Missing fields result:', { missingBlockingFields, missingEnrichingFields })
    } catch (err) {
      console.error('[OnboardingExtract] computeMissingFields failed:', err)
    }

    // 9. Terminal logs: summary + what was extracted and saved
    const countFilled = (obj: Record<string, unknown>) =>
      Object.entries(obj).filter(([, v]) => v != null && v !== '' && (typeof v !== 'object' || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0))).length
    const userFilled = countFilled(extracted.user)
    const projectFilled = countFilled(extracted.project)
    console.log('[OnboardingExtract] ─── Summary ───')
    console.log('[OnboardingExtract] projectId:', projectId, '| user fields filled:', userFilled, '| project fields filled:', projectFilled, '| Harvey confidence:', completionConfidence + '%')
    console.log('[OnboardingExtract] Extracted user:', JSON.stringify(extracted.user, null, 2))
    console.log('[OnboardingExtract] Extracted project:', JSON.stringify(extracted.project, null, 2))
    if (Object.keys(userUpdates).length > 0) {
      console.log('[OnboardingExtract] Saved to DB (user):', Object.keys(userUpdates).join(', '))
      if (extracted.user.energy_peak != null && String(extracted.user.energy_peak).trim() !== '') {
        console.log('[OnboardingExtract] energy_peak:', extracted.user.energy_peak)
      }
    }
    if (Object.keys(projectUpdates).length > 0) {
      console.log('[OnboardingExtract] Saved to DB (project):', Object.keys(projectUpdates).join(', '))
    }
    console.log('[OnboardingExtract] ───────────────')

    // 10. Return
    return NextResponse.json({
      success: true,
      extracted: { user: extracted.user, project: extracted.project },
      saved: {
        user: Object.keys(userUpdates).length > 0 ? userUpdates : null,
        project: Object.keys(projectUpdates).length > 0 ? projectUpdates : null,
      },
      completion_confidence: completionConfidence,
      missingBlockingFields,
      missingEnrichingFields,
    })
  } catch (err) {
    console.error('[OnboardingExtract] Extraction failure:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
