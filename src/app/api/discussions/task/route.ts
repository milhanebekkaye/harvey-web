/**
 * Task Discussion API — create or get a single task discussion.
 *
 * POST /api/discussions/task — Create (or return existing) task discussion.
 * GET  /api/discussions/task?taskId= — Get task discussion by taskId.
 *
 * Step 2: Persistence only; no Harvey/Claude response. Step 3 will plug in streaming here.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import {
  createDiscussion,
  getTaskDiscussion,
} from '@/lib/discussions/discussion-service'

const TASK_CHAT_INITIAL_MESSAGE = {
  role: 'assistant' as const,
  content:
    "I'm ready to help you with this task. What would you like to work through?",
  timestamp: new Date().toISOString(),
}

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

    // Create new task discussion with initial Harvey message
    const created = await createDiscussion({
      projectId,
      userId: user.id,
      type: 'task',
      taskId,
      initialMessage: TASK_CHAT_INITIAL_MESSAGE,
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
