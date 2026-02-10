/**
 * Daily Check-In API Route
 *
 * POST /api/chat/checkin
 *
 * Generates a contextual 2–3 sentence check-in message for a returning user.
 * Uses streamText() and streams the response. Caller persists the message
 * to the project discussion after stream ends (with messageType: 'check-in').
 *
 * Request body: { projectId: string, timeOfDay?: 'morning' | 'afternoon' | 'evening' } (timeOfDay for testing)
 * Response: streaming text (chunked); no tools.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getProjectById } from '@/lib/projects/project-service'
import { assembleCheckInContext } from '@/lib/checkin/checkin-context'
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 150

function buildCheckInSystemPrompt(context: Awaited<ReturnType<typeof assembleCheckInContext>>): string {
  const {
    timeOfDay,
    todayTasks,
    yesterdaySummary,
    streak,
    recentSkipped,
    userTimezone,
  } = context

  const lines: string[] = [
    'You are Harvey, a concise AI project coach. Generate a single 2–3 sentence check-in message based on the context below.',
    'Rules:',
    '- Be concise. Never be verbose.',
    '- Reference specific task titles and times when relevant.',
    '- Vary tone: encouraging after completions, motivating after skips, neutral on first message of the day.',
    '',
    'Context (user timezone: ' + userTimezone + '):',
    '- Time of day: ' + timeOfDay,
  ]

  if (todayTasks.length > 0) {
    lines.push('- Today\'s tasks (pending/in progress): ' + todayTasks.map((t) => t.scheduledTime ? `${t.title} at ${t.scheduledTime}` : t.title).join('; '))
  } else {
    lines.push('- Today\'s tasks: none scheduled.')
  }

  lines.push(
    '- Yesterday: ' + yesterdaySummary.completed + ' completed, ' + yesterdaySummary.skipped + ' skipped, ' + yesterdaySummary.total + ' total.'
  )

  if (streak > 0) {
    lines.push('- Current streak: ' + streak + ' consecutive day(s) with at least one completion.')
  }

  if (recentSkipped.length > 0) {
    lines.push('- Recently skipped (not yet rescheduled): ' + recentSkipped.map((t) => t.title).join(', ') + '.')
  }

  lines.push(
    '',
    'Examples of tone (adapt to the actual context):',
    '- Morning + tasks today: "Good morning! You\'ve got [X] tasks today — starting with [first task] at [time]. Yesterday you completed [Y/Z], solid work."',
    '- Evening + pending task: "It\'s almost [time]. [Task name] is still on your list for tonight — you\'ve got this."',
    '- Skipped tasks: "You have [N] unfinished task(s) from yesterday. Want me to reschedule them into this week?"',
    '- Streak: "That\'s [N] days in a row with completions. Don\'t break the chain."',
    '- No tasks today: "No tasks scheduled for today — free day or want to add something?"',
    '- No tasks yesterday but task today: "I hope you\'re doing well; yesterday was a day off so hope you\'re on fire for today."',
    '',
    'Output only the check-in message, no preamble or labels.'
  )

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
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

    let body: { projectId?: string; timeOfDay?: 'morning' | 'afternoon' | 'evening' }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const projectId = body.projectId
    const timeOfDayOverride = body.timeOfDay ?? undefined
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required', code: 'MISSING_PROJECT_ID' },
        { status: 400 }
      )
    }

    const project = await getProjectById(projectId, user.id)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
        { status: 404 }
      )
    }

    const context = await assembleCheckInContext(projectId, user.id, {
      ...(timeOfDayOverride ? { timeOfDayOverride } : {}),
    })
    const systemPrompt = buildCheckInSystemPrompt(context)

    const result = streamText({
      model: anthropic(MODEL_ID),
      maxOutputTokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the check-in message for the context above.' }],
    })

    // Stream plain text so the client can accumulate and display; client persists to discussion when done
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ''
        try {
          for await (const chunk of result.textStream) {
            fullText += chunk
            controller.enqueue(new TextEncoder().encode(chunk))
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[CheckInAPI] Error:', message)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
