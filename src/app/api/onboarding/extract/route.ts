/**
 * Onboarding Extraction API
 *
 * POST /api/onboarding/extract
 *
 * Reads the full onboarding conversation for a project, calls Haiku to extract
 * structured user and project fields, and returns clean JSON. Read-only; does not persist.
 * Part of Feature D (Shadow Panel) – Step 2.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getOnboardingDiscussion } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import { anthropic } from '@/lib/ai/claude-client'

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

    // 5. Call Haiku with extraction prompt
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
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

    // 7. Return clean JSON
    return NextResponse.json({
      user: extracted.user,
      project: extracted.project,
    })
  } catch (err) {
    console.error('[OnboardingExtract] Extraction failure:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
