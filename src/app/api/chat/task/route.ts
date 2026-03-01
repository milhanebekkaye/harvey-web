/**
 * Per-Task Chat API Route
 *
 * POST /api/chat/task
 *
 * Streaming chat endpoint for task-specific Harvey (accountability coach for one task).
 * Uses buildTaskChatContext for system prompt (5 layers); no tools.
 * Persists user + assistant messages to the task Discussion on stream finish.
 *
 * Request body: { messages: UIMessage[], taskId: string, projectId?: string }
 * Response: UI Message Stream protocol (createUIMessageStreamResponse)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { streamText, createUIMessageStream, createUIMessageStreamResponse, smoothStream } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import type { UIMessage } from 'ai'

import { buildTaskChatContext } from '@/lib/context-builders/build-task-chat-context'
import { getTaskDiscussion, appendMessages } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import type { StoredMessage } from '@/types/api.types'
import { MODELS } from '@/lib/ai/models'

const MAX_HISTORY_MESSAGES = 20

function getMessageText(message: UIMessage): string {
  if (!message.parts) return ''
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function getLastUserMessage(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return getMessageText(messages[i])
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  console.log('[TaskChat] ========== New task chat request ==========')

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[TaskChat] Authentication failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    let body: { messages?: UIMessage[]; taskId?: string; projectId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { messages: uiMessages = [], taskId, projectId: bodyProjectId } = body
    const lastUserContent = getLastUserMessage(uiMessages)

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId is required', code: 'MISSING_TASK_ID' },
        { status: 400 }
      )
    }
    if (!lastUserContent || lastUserContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required', code: 'MISSING_MESSAGE' },
        { status: 400 }
      )
    }

    // Resolve projectId and verify ownership via task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, userId: true },
    })
    if (!task || !task.projectId) {
      return NextResponse.json(
        { error: 'Task not found', code: 'TASK_NOT_FOUND' },
        { status: 404 }
      )
    }
    if (task.userId !== user.id) {
      return NextResponse.json(
        { error: 'Task not found', code: 'TASK_NOT_FOUND' },
        { status: 404 }
      )
    }
    const projectId = bodyProjectId ?? task.projectId

    const discussion = await getTaskDiscussion(projectId, user.id, taskId)
    if (!discussion) {
      return NextResponse.json(
        { error: 'Discussion not found. Open this task chat from the timeline first.', code: 'DISCUSSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    const existingMessages: StoredMessage[] = discussion.messages ?? []
    const recentMessages = existingMessages.slice(-MAX_HISTORY_MESSAGES)
    const userMessage: StoredMessage = {
      role: 'user',
      content: lastUserContent.trim(),
      timestamp: new Date().toISOString(),
    }
    const allMessagesForClaude = [...recentMessages, userMessage]
    const modelMessages = allMessagesForClaude.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Persist user message so it's stored even if stream fails
    await appendMessages(discussion.id, [userMessage])

    const systemPrompt = await buildTaskChatContext(taskId, user.id)

    const result = streamText({
      model: anthropic(MODELS.TASK_CHAT),
      system: systemPrompt,
      messages: modelMessages,
      experimental_transform: smoothStream({
        delayInMs: null,
        chunking: 'word',
      }),
    })

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.merge(result.toUIMessageStream())
      },
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage }) => {
        const fullText = getMessageText(responseMessage as UIMessage)
        if (!fullText || fullText.trim().length === 0) return
        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: fullText.trim(),
          timestamp: new Date().toISOString(),
        }
        await appendMessages(discussion.id, [assistantMessage])
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[TaskChat] Unexpected error:', err.message, err.stack)
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: isDev ? err.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(isDev && { details: err.stack }),
      },
      { status: 500 }
    )
  }
}
