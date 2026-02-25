/**
 * Streaming Chat API Route Handler
 *
 * POST /api/chat
 *
 * Handles AI conversation for project intake during onboarding.
 * Uses Vercel AI SDK for streaming - Harvey's messages appear word-by-word.
 *
 * Architecture: Single streaming chat infrastructure that handles all chat contexts.
 * The API accepts a context parameter (onboarding, project-chat, task-chat).
 * Each frontend useChat instance is separate but shares this backend.
 *
 * Flow:
 * 1. Authenticate user via Supabase
 * 2. First message: Create User (if needed), Project, Discussion
 * 3. Continuing: Load existing Discussion
 * 4. Stream Claude response via streamText() → createUIMessageStream
 * 5. On stream finish: Save messages to Discussion, send projectId/isComplete via transient data
 *
 * Request Body:
 * - messages: UIMessage[] (from useChat)
 * - projectId: string (optional) - For continuing conversation
 * - context: 'onboarding' | 'project-chat' | 'task-chat' (default: onboarding)
 *
 * Response: Streamed via AI SDK protocol (text + optional transient metadata)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { userExists } from '@/lib/users/user-service'
import { createUser } from '@/lib/users/user-service'
import { createProject, getProjectById, updateProject } from '@/lib/projects/project-service'
import {
  createDiscussion,
  getOnboardingDiscussion,
  appendMessages,
} from '@/lib/discussions/discussion-service'
import { createUIMessageStream, createUIMessageStreamResponse, streamText, smoothStream } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { ONBOARDING_SYSTEM_PROMPT, generateKnownInfoSummary } from '@/lib/ai/prompts'
import { computeMissingFields, buildMissingFieldsGuidance } from '@/lib/onboarding/missing-fields'
import { prisma } from '@/lib/db/prisma'
import { isIntakeComplete } from '@/lib/ai/claude-client'
import type { StoredMessage } from '@/types/api.types'
import type { UIMessage } from 'ai'

/** Model identifier - matches existing CLAUDE_CONFIG */
/** Claude model — Haiku for MVP testing (lower cost); switch back to Sonnet for paid users */

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 300

/** Extract text content from UIMessage parts */
function getMessageText(message: UIMessage): string {
  if (!message.parts) return ''
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

/** Get the last user message content */
function getLastUserMessage(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return getMessageText(messages[i])
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  console.log('[ChatAPI] ========== New streaming chat request ==========')

  try {
    // ===== STEP 1: Authenticate User =====
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[ChatAPI] Authentication failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // ===== STEP 2: Parse Request Body =====
    let body: { messages?: UIMessage[]; projectId?: string; context?: string; currentConfidence?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const {
      messages: uiMessages = [],
      projectId,
      context = 'onboarding',
      currentConfidence = 0,
    } = body

    const lastUserContent = getLastUserMessage(uiMessages)
    if (!lastUserContent || lastUserContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required', code: 'MISSING_MESSAGE' },
        { status: 400 }
      )
    }

    // ===== STEP 3: Handle First Message vs Continuing =====
    let currentProjectId: string
    let discussionId: string
    let existingMessages: StoredMessage[] = []

    if (!projectId) {
      // First message: Create User, Project, Discussion
      const userInDb = await userExists(user.id)
      if (!userInDb) {
        await createUser({
          id: user.id,
          email: user.email!,
          name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          timezone: 'Europe/Paris',
        })
      }

      const projectResult = await createProject({
        userId: user.id,
        title: 'Untitled Project',
      })
      if (!projectResult.success || !projectResult.project) {
        return NextResponse.json(
          { error: 'Failed to create project', code: 'PROJECT_CREATE_FAILED' },
          { status: 500 }
        )
      }
      currentProjectId = projectResult.project.id

      const discussionResult = await createDiscussion({
        projectId: currentProjectId,
        userId: user.id,
        type: 'onboarding',
      })
      if (!discussionResult.success || !discussionResult.discussion) {
        return NextResponse.json(
          { error: 'Failed to create discussion', code: 'DISCUSSION_CREATE_FAILED' },
          { status: 500 }
        )
      }
      discussionId = discussionResult.discussion.id
    } else {
      const project = await getProjectById(projectId, user.id)
      if (!project) {
        return NextResponse.json(
          { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
          { status: 404 }
        )
      }
      currentProjectId = project.id

      const discussion = await getOnboardingDiscussion(projectId, user.id)
      if (!discussion) {
        return NextResponse.json(
          { error: 'Discussion not found', code: 'DISCUSSION_NOT_FOUND' },
          { status: 404 }
        )
      }
      discussionId = discussion.id
      existingMessages = discussion.messages || []
    }

    // ===== STEP 4: Build user + assistant messages for Claude =====
    const userMessage: StoredMessage = {
      role: 'user',
      content: lastUserContent.trim(),
      timestamp: new Date().toISOString(),
    }
    const allMessagesForClaude = [...existingMessages, userMessage]

    const modelMessages = allMessagesForClaude.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    // ===== STEP 4b: Build onboarding system prompt with date + known info (when onboarding) =====
    const todayFormatted = new Date().toLocaleDateString('en-US', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    let knownInfo = 'KNOWN INFORMATION SO FAR:\n(Starting fresh - no information extracted yet)\n'
    let missingFieldsGuidance = 'You have no information yet. Start by understanding their project.'
    if (context === 'onboarding' && currentProjectId) {
      const projectWithUser = await prisma.project.findUnique({
        where: { id: currentProjectId },
        include: { user: true },
      })
      if (projectWithUser) {
        knownInfo = generateKnownInfoSummary(
          projectWithUser as unknown as Record<string, unknown>,
          projectWithUser.user as unknown as Record<string, unknown>
        )
        console.log('[ChatAPI] Onboarding: computing missing fields for prompt', { projectId: currentProjectId, userId: projectWithUser.userId })
        let blocking: string[] = []
        let enriching: string[] = []
        try {
          const missing = await computeMissingFields(currentProjectId, projectWithUser.userId)
          blocking = missing.blocking
          enriching = missing.enriching
        } catch (err) {
          console.error('[ChatAPI] computeMissingFields failed:', err)
        }
        console.log('[ChatAPI] Onboarding: missing fields', { blocking, enriching })
        missingFieldsGuidance = buildMissingFieldsGuidance(blocking, enriching)
      }
    }
    const systemPrompt = ONBOARDING_SYSTEM_PROMPT(
      todayFormatted,
      knownInfo,
      missingFieldsGuidance,
      typeof currentConfidence === 'number' ? Math.min(100, Math.max(0, Math.round(currentConfidence))) : 0
    )

    // ===== STEP 5: Stream response =====
    // smoothStream: word-by-word with 5ms delay for natural ChatGPT-like typing feel
    const result = streamText({
      model: anthropic(MODEL_ID),
      maxOutputTokens: MAX_TOKENS,
      system: systemPrompt,
      messages: modelMessages,
      experimental_transform: smoothStream({
        delayInMs: null, // No artificial delay - words appear as soon as ready
        chunking: 'word',
      }),
    })

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Send projectId immediately so client can use it for next request
        writer.write({
          type: 'data-onboarding-meta',
          data: { projectId: currentProjectId },
          transient: true,
        })
        writer.merge(result.toUIMessageStream())
      },
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage }) => {
        const fullText = getMessageText(responseMessage as UIMessage)
        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toISOString(),
        }
        await appendMessages(discussionId, [userMessage, assistantMessage])
        // Project title/description and other fields are extracted by POST /api/onboarding/extract
        // (triggered by the client after each Harvey response). No early extraction here.
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ChatAPI] Unexpected error:', errorMessage)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
