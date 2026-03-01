import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { anthropic } from '@/lib/ai/claude-client'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { normalizeTaskLabel, parseSuccessCriteria } from '@/types/task.types'
import { MODELS } from '@/lib/ai/models'

const MAX_TOKENS = 100
const FALLBACK_TIP = 'Break this task into the first small step and start there.'
const SYSTEM_PROMPT = `You are Harvey, an AI accountability coach.
Generate a single, concrete, actionable tip to help the user start or make progress on this task right now.
Maximum 2 sentences.
Be specific, not generic.
No pleasantries.`

interface TipRequestBody {
  taskId?: unknown
}

function buildCriteriaText(successCriteria: unknown): string {
  const parsed = parseSuccessCriteria(successCriteria)
  if (parsed.length === 0) {
    return '- None'
  }

  return parsed
    .map((item) => `- ${item.text} (${item.done ? 'checked' : 'unchecked'})`)
    .join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ tip: FALLBACK_TIP }, { status: 200 })
    }

    let body: TipRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ tip: FALLBACK_TIP }, { status: 200 })
    }

    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
    if (!taskId) {
      return NextResponse.json({ tip: FALLBACK_TIP }, { status: 200 })
    }

    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        project: {
          is: {
            userId: user.id,
          },
        },
      },
      include: {
        project: {
          select: {
            title: true,
            goals: true,
          },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ tip: FALLBACK_TIP }, { status: 200 })
    }

    const cachedTip = task.harveyTip?.trim()
    if (cachedTip) {
      return NextResponse.json({ tip: cachedTip }, { status: 200 })
    }

    let dependenciesText = 'None'

    if (task.depends_on.length > 0) {
      const dependencyTasks = await prisma.task.findMany({
        where: {
          id: { in: task.depends_on },
        },
        select: {
          id: true,
          title: true,
          status: true,
        },
      })

      const dependencyMap = new Map(dependencyTasks.map((dependency) => [dependency.id, dependency]))
      const orderedDependencies = task.depends_on
        .map((dependencyId) => dependencyMap.get(dependencyId))
        .filter((dependency): dependency is (typeof dependencyTasks)[number] => dependency != null)

      if (orderedDependencies.length > 0) {
        dependenciesText = orderedDependencies
          .map((dependency) => `- ${dependency.title} (${dependency.status})`)
          .join('\n')
      }
    }

    const userPrompt = `Task: ${task.title}
Category: ${normalizeTaskLabel(task.label)}
Description: ${task.description?.trim() || 'None'}
Success criteria:
${buildCriteriaText(task.successCriteria)}
Dependencies:
${dependenciesText}
Project: ${task.project?.title?.trim() || 'None'}
Project goals: ${task.project?.goals?.trim() || 'None'}

What should the user do right now?`

    let tip = FALLBACK_TIP

    try {
      const response = await anthropic.messages.create({
        model: MODELS.TASK_TIP,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const textBlock = response.content.find((block) => block.type === 'text')
      tip = (textBlock?.type === 'text' ? textBlock.text.trim() : '') || FALLBACK_TIP
    } catch (generationError: unknown) {
      console.error(
        '[TaskTipAPI] Tip generation failed, persisting fallback tip:',
        generationError instanceof Error ? generationError.message : generationError
      )
    }

    try {
      await prisma.task.update({
        where: { id: task.id },
        data: { harveyTip: tip },
      })
    } catch (persistError: unknown) {
      console.error(
        '[TaskTipAPI] Failed to persist generated tip:',
        persistError instanceof Error ? persistError.message : persistError
      )
    }

    return NextResponse.json({ tip }, { status: 200 })
  } catch (error: unknown) {
    console.error('[TaskTipAPI] Failed to generate tip:', error instanceof Error ? error.message : error)
    return NextResponse.json({ tip: FALLBACK_TIP }, { status: 200 })
  }
}
