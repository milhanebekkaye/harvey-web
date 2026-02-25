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
import { anthropic, CLAUDE_CONFIG } from '@/lib/ai/claude-client'
import { updateUser } from '@/lib/users/user-service'
import { updateProject } from '@/lib/projects/project-service'
import { computeMissingFields } from '@/lib/onboarding/missing-fields'

const EXTRACTION_PROMPT = `You are extracting structured data from a conversation between a user and Harvey (an AI project coach).

Your task: Return ONLY valid JSON. No markdown, no backticks, no preamble text.

Output format:
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
    "phases": { "phases": [{ "id": number, "title": string, "goal": string, "status": "active"|"future"|"completed", "deadline": string (ISO) | null }], "active_phase_id": number | null } | null,
    "projectNotes": string | null,
    "schedule_start_date": string (ISO date YYYY-MM-DD) | null
  },
  "completion_confidence": number
}

CRITICAL RULES:
1. For arrays, return actual JSON arrays, NOT stringified JSON (e.g., ["item"] not "[\"item\"]")
2. For objects, return actual JSON objects, NOT stringified JSON
3. If a field is not mentioned in the conversation, set it to null
4. Do not invent information - only extract what was explicitly stated
5. The response must be valid JSON parseable by JSON.parse()
6. Extract from the ENTIRE conversation - consider all messages

Field-Specific Guidance:
- availabilityWindows: Array of time blocks. Distinguish FIXED vs FLEXIBLE:
  - FIXED: User works a specific, predictable time block every day. Example: "I work 8-10pm every evening" → window_type: "fixed", start_time: "20:00", end_time: "22:00", type: e.g. "evening_work".
  - FLEXIBLE: User has X hours available somewhere inside a larger time boundary; exact timing varies. Example: "I have 3 hours during my 9-5 workday" → window_type: "flexible", flexible_hours: 3, start_time: "09:00", end_time: "17:30", type: e.g. "work_on_project". Example: "I can work 2 hours in the afternoon" → window_type: "flexible", flexible_hours: 2, start_time: "12:00", end_time: "18:00". Do NOT store the full boundary as working time: for "3 hours during 9-5", store flexible_hours: 3, not 8.5h. Always include "type" (e.g. work_on_project, evening_work, weekend) as a label for the window.
- workSchedule: Specifically their job hours
- tools_and_stack: Programming languages, frameworks, tools mentioned
- skill_level: Look for "beginner", "intermediate", "advanced" or infer from context
- communication_style: Infer from how user communicates (brief = "direct", detailed = "detailed")
- weekly_hours_commitment: How many hours per week they'll work on THIS project
- task_preference: How they like to work — "quick_wins" (small actionable items), "deep_focus" (longer blocks), or "mixed"
- preferred_session_length: (user) How many minutes they can focus in one sitting (number, e.g. 60)
- energy_peak: (user) When they are most productive. Extract from phrases like "I'm a night owl", "I hit my stride in the evenings", "I'm sharpest in the morning". Values: "morning" (05:00–11:59), "afternoon" (12:00–17:59), or "evening" (18:00–23:59). Omit or null if not mentioned.
- phases: MUST be an object with "phases" (array) and optional "active_phase_id". Each phase: id (number, 1-based), title (short name), goal (description), status ("active"|"future"|"completed"), deadline (ISO date or null). Example: { "phases": [{ "id": 1, "title": "MVP & Launch", "goal": "Full working app for spring break", "status": "active", "deadline": "2025-03-27" }, { "id": 2, "title": "Post-Launch", "goal": "Iteration based on feedback", "status": "future", "deadline": null }], "active_phase_id": 1 }. If user only describes steps as a list (e.g. "Design, Build, Integrate"), use each as title and goal as empty string.
- schedule_start_date: (project) When they want to start working on this schedule. Parse natural language into ISO date YYYY-MM-DD: "today" → today's date; "tomorrow" → next day; "next Monday" / "Monday" → next occurrence of that weekday; "February 20", "Feb 20 2026" → parsed date. Use the conversation context for "today". Null if not mentioned.

completion_confidence: A number between 0 and 75 ONLY. Never return 80 or above.

This score represents how complete the extracted data is (0 = nothing extracted, 75 = everything you could possibly need has been provided).

The 80+ range is reserved for a separate system signal. Your maximum is 75.

IMPORTANT: completion_confidence must never increase by more than 15 points compared to the previous value. If you would naturally assign a score that is more than 15 points higher than the previous score, cap the increase at 15.

The previous completion_confidence was: {{PREVIOUS_CONFIDENCE}}
So the maximum you can assign this turn is: {{MAX_CONFIDENCE}}

Conversation:
`

/** Build extraction prompt with previous-confidence cap injected. Ceiling is 75 (Haiku never returns 80+). */
function buildExtractionPrompt(previousConfidence: number): string {
  const prev = Math.min(75, Math.max(0, Math.round(previousConfidence)))
  const maxAllowed = Math.min(75, prev + 15)
  return EXTRACTION_PROMPT.replace('{{PREVIOUS_CONFIDENCE}}', String(prev)).replace(
    '{{MAX_CONFIDENCE}}',
    String(maxAllowed)
  )
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

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.trim().split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] != null ? parseInt(parts[1], 10) : 0
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/** Parse ISO date string to Date; return null if invalid (avoids Prisma "Invalid Date" error). */
function parseValidDate(value: unknown): Date | null {
  if (value == null) return null
  const str = typeof value === 'string' ? value.trim() : String(value)
  if (!str) return null
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

    // 3. Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or access denied', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

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

    console.log('[OnboardingExtract] Running extraction | projectId:', projectId, '| messages:', messages.length, '| previousConfidence:', previousConfidence)

    // 5. Call Haiku with extraction prompt (includes previous-confidence cap)
    const extractionPromptWithCap = buildExtractionPrompt(previousConfidence)
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: extractionPromptWithCap + conversationText }],
    })

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
      extracted.user.availabilityWindows = parseIfString(extracted.user.availabilityWindows)
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

    // Validate array fields are actually arrays
    if (extracted.user.availabilityWindows != null && !Array.isArray(extracted.user.availabilityWindows)) {
      console.error('[OnboardingExtract] availabilityWindows is not an array')
      return NextResponse.json(
        { error: 'availabilityWindows must be an array' },
        { status: 500 }
      )
    }
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
