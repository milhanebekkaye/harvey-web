/**
 * Onboarding Extraction API
 *
 * POST /api/onboarding/extract
 *
 * Reads the full onboarding conversation for a project, calls Haiku to extract
 * structured user and project fields, saves to DB (merge logic: don't overwrite with null),
 * and returns extracted + saved payload. Part of Feature D (Shadow Panel) – Step 3.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getOnboardingDiscussion } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import { anthropic, CLAUDE_CONFIG } from '@/lib/ai/claude-client'
import { updateUser } from '@/lib/users/user-service'
import { updateProject } from '@/lib/projects/project-service'

const EXTRACTION_PROMPT = `You are extracting structured data from a conversation between a user and Harvey (an AI project coach).

Your task: Return ONLY valid JSON. No markdown, no backticks, no preamble text.

Output format:
{
  "user": {
    "timezone": string | null,
    "workSchedule": { "days": string[], "start_time": string, "end_time": string } | null,
    "commute": { "morning": { "duration": number, "start_time": string }, "evening": { "duration": number, "start_time": string } } | null,
    "availabilityWindows": [{ "days": string[], "start_time": string, "end_time": string, "type": string }] | null,
    "preferred_session_length": number | null,
    "communication_style": string | null,
    "userNotes": string | null
  },
  "project": {
    "title": string | null,
    "description": string | null,
    "goals": string | null,
    "project_type": string | null,
    "target_deadline": string (ISO 8601) | null,
    "weekly_hours_commitment": number | null,
    "tools_and_stack": string[] | null,
    "skill_level": string | null,
    "motivation": string | null,
    "phases": object | null,
    "projectNotes": string | null
  }
}

CRITICAL RULES:
1. For arrays, return actual JSON arrays, NOT stringified JSON (e.g., ["item"] not "[\"item\"]")
2. For objects, return actual JSON objects, NOT stringified JSON
3. If a field is not mentioned in the conversation, set it to null
4. Do not invent information - only extract what was explicitly stated
5. The response must be valid JSON parseable by JSON.parse()
6. Extract from the ENTIRE conversation - consider all messages

Field-Specific Guidance:
- availabilityWindows: Array of time blocks. User might say "I work Mon-Fri 9-5" → extract as availability window
- workSchedule: Specifically their job hours
- tools_and_stack: Programming languages, frameworks, tools mentioned
- skill_level: Look for "beginner", "intermediate", "advanced" or infer from context
- communication_style: Infer from how user communicates (brief = "direct", detailed = "detailed")
- weekly_hours_commitment: How many hours per week they'll work on THIS project

Conversation:
`

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

/** Parse "HH:MM" or "H:MM" to minutes since midnight (0–1439). Returns null if invalid. */
function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.trim().split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] != null ? parseInt(parts[1], 10) : 0
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

/**
 * Compute total hours per week from availability windows.
 * Handles overnight blocks (e.g. 22:00–02:00): duration = (24h - start) + end.
 */
function computeWeeklyHoursFromAvailabilityWindows(
  windows: Array<{ days?: string[]; start_time?: string; end_time?: string }>
): number {
  if (!Array.isArray(windows) || windows.length === 0) return 0
  let totalMinutes = 0
  console.log('[OnboardingExtract] weekly_hours_commitment: calculating from availabilityWindows (not extracted)')
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const days = Array.isArray(w.days) ? w.days : []
    const startM = parseTimeToMinutes(String(w.start_time ?? ''))
    const endM = parseTimeToMinutes(String(w.end_time ?? ''))
    if (startM == null || endM == null || days.length === 0) {
      console.log(`  [${i + 1}] skipped (invalid times or no days):`, { start_time: w.start_time, end_time: w.end_time, daysCount: days.length })
      continue
    }
    let durationMinutes: number
    if (endM > startM) {
      durationMinutes = endM - startM
    } else if (endM < startM) {
      durationMinutes = 24 * 60 - startM + endM
    } else {
      durationMinutes = 0
    }
    const windowHours = (durationMinutes * days.length) / 60
    totalMinutes += durationMinutes * days.length
    console.log(
      `  [${i + 1}] ${w.start_time}–${w.end_time} | ${days.length} day(s) (${days.join(', ')}) | ${durationMinutes} min × ${days.length} = ${(durationMinutes * days.length) / 60} h`
    )
  }
  const hours = totalMinutes / 60
  const rounded = Math.round(hours)
  console.log(`[OnboardingExtract] weekly_hours_commitment: total ${totalMinutes} min = ${hours.toFixed(2)} h → rounded = ${rounded} h`)
  return rounded
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
      if (process.env.NODE_ENV === 'development') {
        console.warn('[OnboardingExtract] 401: No session. Call from same-origin (e.g. fetch from your app) with credentials so cookies are sent. curl/Postman do not send browser cookies by default.')
      }
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // 2. Parse body: { projectId: string }
    let body: { projectId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const projectId = body.projectId
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

    // 5. Call Haiku with extraction prompt (use project's Haiku model)
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: EXTRACTION_PROMPT + conversationText }],
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
    let extracted: { user: Record<string, unknown>; project: Record<string, unknown> }
    try {
      extracted = JSON.parse(extractedText) as { user: Record<string, unknown>; project: Record<string, unknown> }
    } catch (parseErr) {
      console.error('[OnboardingExtract] JSON parse failed:', parseErr)
      return NextResponse.json(
        { error: 'Extraction returned invalid JSON' },
        { status: 500 }
      )
    }

    if (!extracted.user || typeof extracted.user !== 'object') {
      extracted.user = {}
    }
    if (!extracted.project || typeof extracted.project !== 'object') {
      extracted.project = {}
    }

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
    if (extracted.user.timezone !== undefined && extracted.user.timezone !== null) {
      userUpdates.timezone = extracted.user.timezone
    }
    if (extracted.user.workSchedule !== undefined && extracted.user.workSchedule !== null) {
      userUpdates.workSchedule = extracted.user.workSchedule
    }
    if (extracted.user.commute !== undefined && extracted.user.commute !== null) {
      userUpdates.commute = extracted.user.commute
    }
    if (extracted.user.availabilityWindows !== undefined && extracted.user.availabilityWindows !== null) {
      userUpdates.availabilityWindows = extracted.user.availabilityWindows
    }
    if (extracted.user.preferred_session_length !== undefined && extracted.user.preferred_session_length !== null) {
      userUpdates.preferred_session_length = extracted.user.preferred_session_length
    }
    if (extracted.user.communication_style !== undefined && extracted.user.communication_style !== null) {
      userUpdates.communication_style = extracted.user.communication_style
    }
    if (extracted.user.userNotes !== undefined && extracted.user.userNotes !== null) {
      userUpdates.userNotes = extracted.user.userNotes
    }

    const projectUpdates: Record<string, unknown> = {}
    if (extracted.project.title !== undefined && extracted.project.title !== null) {
      projectUpdates.title = extracted.project.title
    }
    if (extracted.project.description !== undefined && extracted.project.description !== null) {
      projectUpdates.description = extracted.project.description
    }
    if (extracted.project.goals !== undefined && extracted.project.goals !== null) {
      projectUpdates.goals = extracted.project.goals
    }
    if (extracted.project.project_type !== undefined && extracted.project.project_type !== null) {
      projectUpdates.project_type = extracted.project.project_type
    }
    if (extracted.project.target_deadline !== undefined && extracted.project.target_deadline !== null) {
      projectUpdates.target_deadline = new Date(extracted.project.target_deadline as string)
    }
    if (extracted.project.weekly_hours_commitment !== undefined && extracted.project.weekly_hours_commitment !== null) {
      projectUpdates.weekly_hours_commitment = extracted.project.weekly_hours_commitment
    }
    if (extracted.project.tools_and_stack !== undefined && extracted.project.tools_and_stack !== null) {
      projectUpdates.tools_and_stack = extracted.project.tools_and_stack
    }
    if (extracted.project.skill_level !== undefined && extracted.project.skill_level !== null) {
      projectUpdates.skill_level = extracted.project.skill_level
    }
    if (extracted.project.motivation !== undefined && extracted.project.motivation !== null) {
      projectUpdates.motivation = extracted.project.motivation
    }
    if (extracted.project.phases !== undefined && extracted.project.phases !== null) {
      projectUpdates.phases = extracted.project.phases
    }
    if (extracted.project.projectNotes !== undefined && extracted.project.projectNotes !== null) {
      projectUpdates.projectNotes = extracted.project.projectNotes
    }

    // If weekly_hours_commitment was not extracted, derive from availabilityWindows so it's always set.
    // If the user or Harvey later mentions it, extraction will return a value and we keep that (not the calculated one).
    const hasWeeklyHours =
      extracted.project.weekly_hours_commitment !== undefined &&
      extracted.project.weekly_hours_commitment !== null
    const availabilityWindows = extracted.user.availabilityWindows
    if (
      !hasWeeklyHours &&
      Array.isArray(availabilityWindows) &&
      availabilityWindows.length > 0
    ) {
      const computed = computeWeeklyHoursFromAvailabilityWindows(availabilityWindows)
      if (computed > 0) {
        console.log('[OnboardingExtract] weekly_hours_commitment: using calculated value', computed, 'h (not extracted from conversation)')
        projectUpdates.weekly_hours_commitment = computed
        extracted.project.weekly_hours_commitment = computed
      }
    }

    // 8. Save to database (merge logic: we only send non-null fields)
    const userId = project.userId
    try {
      if (Object.keys(userUpdates).length > 0) {
        const userResult = await updateUser(userId, userUpdates)
        if (!userResult.success) {
          throw new Error(userResult.error?.message ?? 'User update failed')
        }
      }
      if (Object.keys(projectUpdates).length > 0) {
        const projectResult = await updateProject(projectId, userId, projectUpdates)
        if (!projectResult.success) {
          throw new Error(projectResult.error?.message ?? 'Project update failed')
        }
      }
    } catch (dbErr) {
      console.error('[OnboardingExtract] Database save failed:', dbErr)
      return NextResponse.json(
        { error: 'Failed to save extracted data' },
        { status: 500 }
      )
    }

    // 9. Log result in terminal (for test button / debugging)
    console.log('[OnboardingExtract] Result:', JSON.stringify({ user: extracted.user, project: extracted.project }, null, 2))

    // 10. Return enhanced response
    return NextResponse.json({
      success: true,
      extracted: {
        user: extracted.user,
        project: extracted.project,
      },
      saved: {
        user: Object.keys(userUpdates).length > 0 ? userUpdates : null,
        project: Object.keys(projectUpdates).length > 0 ? projectUpdates : null,
      },
    })
  } catch (err) {
    console.error('[OnboardingExtract] Extraction failure:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
