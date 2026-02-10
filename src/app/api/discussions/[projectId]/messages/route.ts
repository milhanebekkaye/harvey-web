/**
 * Append Message to Discussion (Feature 3)
 *
 * POST /api/discussions/[projectId]/messages
 *
 * Appends a message (with optional widget) to the project discussion.
 * Used when completing/skipping a task to show feedback UI in chat.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getProjectDiscussion, appendMessage, createDiscussion } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import type { ChatWidget } from '@/types/api.types'

interface AppendMessageBody {
  role: 'assistant' | 'user'
  content: string
  widget?: ChatWidget
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    })
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    let body: AppendMessageBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    if (!body.role || body.content == null) {
      return NextResponse.json(
        { success: false, error: 'role and content required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    let discussion = await getProjectDiscussion(projectId, user.id)
    if (!discussion) {
      const created = await createDiscussion({
        projectId,
        userId: user.id,
        type: 'project',
      })
      if (!created.success || !created.discussion) {
        return NextResponse.json(
          { success: false, error: created.error?.message || 'Failed to create discussion', code: 'CREATE_FAILED' },
          { status: 500 }
        )
      }
      discussion = created.discussion
    }

    const message = {
      role: body.role,
      content: body.content,
      timestamp: new Date().toISOString(),
      ...(body.widget != null ? { widget: body.widget } : {}),
    }

    const result = await appendMessage(discussion.id, message)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error?.message || 'Failed to append message', code: 'APPEND_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: result.discussion?.messages[result.discussion.messages.length - 1] },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionMessagesAPI] Error:', message)
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
