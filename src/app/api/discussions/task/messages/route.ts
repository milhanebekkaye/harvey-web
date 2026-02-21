/**
 * Add message to task discussion.
 *
 * POST /api/discussions/task/messages
 * Body: { discussionId: string, content: string }
 *
 * Appends a user message to the task discussion. Step 2: persistence only.
 * Step 3 will plug in Harvey response (streaming) after appending the user message.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { appendMessage } from '@/lib/discussions/discussion-service'

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

    let body: { discussionId?: string; content?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { discussionId, content } = body
    if (!discussionId || content == null || content === '') {
      return NextResponse.json(
        { error: 'discussionId and content are required', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    const discussion = await prisma.discussion.findUnique({
      where: { id: discussionId },
      include: { project: { select: { userId: true } } },
    })

    if (!discussion) {
      return NextResponse.json(
        { error: 'Discussion not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (discussion.project.userId !== user.id) {
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    const newMessage = {
      role: 'user' as const,
      content: String(content).trim(),
      timestamp: new Date().toISOString(),
    }

    const result = await appendMessage(discussionId, newMessage)
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error?.message ?? 'Failed to append message',
          code: 'APPEND_FAILED',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: newMessage,
        discussion: result.discussion,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionTaskMessagesAPI] POST error:', message)
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
