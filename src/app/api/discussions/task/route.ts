/**
 * Task Discussion API — create or get a single task discussion.
 *
 * POST /api/discussions/task — Create (or return existing) task discussion.
 * GET  /api/discussions/task?taskId= — Get task discussion by taskId.
 *
 * Step 3: Opening message is generated via Haiku (task-specific). Step 4 will replace
 * this with full context assembly (behavioral patterns, schedule data).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import {
  createDiscussion,
  getTaskDiscussion,
} from '@/lib/discussions/discussion-service'
import {
  generateTaskOpeningMessage,
  TASK_OPENING_FALLBACK_MESSAGE,
} from '@/lib/discussions/generate-task-opening-message'
import type { TaskContext } from '@/lib/discussions/generate-task-opening-message'

/**
 * POST — Create task discussion (or return existing).
 * Body: { taskId: string, projectId: string }
 */
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

    let body: { taskId?: string; projectId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { taskId, projectId } = body
    if (!taskId || !projectId) {
      return NextResponse.json(
        { error: 'taskId and projectId are required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    // Check if discussion already exists for this task
    const existing = await getTaskDiscussion(projectId, user.id, taskId)
    if (existing) {
      return NextResponse.json({ discussion: existing }, { status: 200 })
    }

    // Step 4 will replace this with full context assembly including behavioral patterns and schedule data.
    let openingContent = TASK_OPENING_FALLBACK_MESSAGE

    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      include: { project: { select: { title: true, goals: true } } },
    })

    if (task) {
      const [unlocksCount, dependencyTasks] = await Promise.all([
        prisma.task.count({ where: { depends_on: { has: taskId } } }),
        task.depends_on.length > 0
          ? prisma.task.findMany({
              where: { id: { in: task.depends_on } },
              select: { title: true, status: true },
            })
          : Promise.resolve([]),
      ])

      const taskContext: TaskContext = {
        title: task.title,
        description: task.description ?? null,
        estimatedDuration: task.estimatedDuration ?? null,
        label: task.label ?? null,
        dependsOn: dependencyTasks.map((d: { title: string; status: string }) => ({ title: d.title, status: d.status })),        unlocksCount,
        projectTitle: task.project?.title ?? null,
        projectGoals: task.project?.goals ?? null,
      }

      openingContent = await generateTaskOpeningMessage(taskContext, user.id)
    }

    const created = await createDiscussion({
      projectId,
      userId: user.id,
      type: 'task',
      taskId,
      initialMessage: {
        role: 'assistant',
        content: openingContent,
        timestamp: new Date().toISOString(),
      },
    })

    if (!created.success || !created.discussion) {
      return NextResponse.json(
        {
          error: created.error?.message ?? 'Failed to create discussion',
          code: 'CREATE_FAILED',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { discussion: created.discussion },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionTaskAPI] POST error:', message)
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

/**
 * GET — Fetch task discussion by taskId.
 * Query: taskId
 * Returns { discussion } or { discussion: null } if none yet (not an error).
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId query param required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    // We need projectId to scope the lookup; get it from the discussion or require it.
    // Discussion is scoped by (projectId, userId, type, taskId). So we can find by taskId + userId + type.
    const discussion = await prisma.discussion.findFirst({
      where: {
        taskId,
        userId: user.id,
        type: 'task',
      },
    })

    if (!discussion) {
      return NextResponse.json({ discussion: null }, { status: 200 })
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: discussion.projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    const messages =
      Array.isArray(discussion.messages) && discussion.messages != null
        ? (discussion.messages as Array<{ role: string; content: string; timestamp: string }>)
        : []

    return NextResponse.json(
      {
        discussion: {
          id: discussion.id,
          projectId: discussion.projectId,
          userId: discussion.userId,
          taskId: discussion.taskId,
          messages,
          createdAt: discussion.createdAt,
          updatedAt: discussion.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionTaskAPI] GET error:', message)
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
