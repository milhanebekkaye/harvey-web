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
import { createUIMessageStream, createUIMessageStreamResponse, streamText, smoothStream, tool } from 'ai'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'
import { getDateStringInTimezone } from '@/lib/timezone'
import { ONBOARDING_SYSTEM_PROMPT, generateKnownInfoSummary, buildUserProfile } from '@/lib/ai/prompts'
import { MODELS } from '@/lib/ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'
import { computeMissingFields, buildMissingFieldsGuidance } from '@/lib/onboarding/missing-fields'
import { prisma } from '@/lib/db/prisma'
import { isIntakeComplete } from '@/lib/ai/claude-client'
import type { StoredMessage } from '@/types/api.types'
import type { UIMessage } from 'ai'

/** Model identifier — use centralized config */
const MODEL_ID = MODELS.ONBOARDING_CHAT
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

    const isNewDiscussion = !projectId

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
    const defaultTimezone = 'Europe/Paris'
    const now = new Date()
    let userTimezone = defaultTimezone
    let todayISO: string | undefined
    let tomorrowISO: string | undefined
    let knownInfo = 'KNOWN INFORMATION SO FAR:\n(Starting fresh - no information extracted yet)\n'
    let missingFieldsGuidance = 'You have no information yet. Start by understanding their project.'
    let userProfile = ''
    if (context === 'onboarding' && currentProjectId) {
      const projectWithUser = await prisma.project.findUnique({
        where: { id: currentProjectId },
        include: { user: true },
      })
      if (projectWithUser?.user != null) {
        userProfile = buildUserProfile(projectWithUser.user as unknown as Record<string, unknown>)
      }
      console.log('[chat/onboarding] userProfile injected:', userProfile ? 'yes (' + userProfile.split('\n').length + ' fields)' : 'empty')
      console.log('[chat/onboarding] currentConfidence:', currentConfidence)
      if (projectWithUser) {
        userTimezone = (projectWithUser.user as { timezone?: string })?.timezone ?? defaultTimezone
        todayISO = getDateStringInTimezone(now, userTimezone)
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        tomorrowISO = getDateStringInTimezone(tomorrow, userTimezone)
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
    if (context === 'onboarding' && (todayISO == null || tomorrowISO == null)) {
      todayISO = getDateStringInTimezone(now, userTimezone)
      tomorrowISO = getDateStringInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), userTimezone)
    }
    const todayFormatted = now.toLocaleDateString('en-US', {
      timeZone: userTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const systemPrompt = ONBOARDING_SYSTEM_PROMPT(
      todayFormatted,
      knownInfo,
      missingFieldsGuidance,
      userProfile,
      typeof currentConfidence === 'number' ? Math.min(100, Math.max(0, Math.round(currentConfidence))) : 0,
      todayISO,
      tomorrowISO
    )

    // ===== STEP 4c: Onboarding-only tool for date picker =====
    const showDatePickerTool = tool({
      description:
        'Show a calendar date picker widget to the user when you need them to select a specific date. Use this ONLY for deadline and start date questions. Always ask the date question first as a standalone message, then call this tool.',
      inputSchema: z.object({
        field: z.enum(['deadline', 'start_date']).describe('Which date field is being collected'),
        label: z.string().describe('Short label to display above the picker, e.g. "Select your project deadline"'),
        min_date: z
          .string()
          .optional()
          .describe('Minimum selectable date in YYYY-MM-DD format (usually today or tomorrow)'),
      }),
      execute: async () => ({ status: 'pending_user_selection' }),
    })

    // ===== STEP 5: Stream response =====
    const streamOptions: Parameters<typeof streamText>[0] = {
      model: anthropic(MODEL_ID),
      maxOutputTokens: MAX_TOKENS,
      system: systemPrompt,
      messages: modelMessages,
      experimental_transform: smoothStream({
        delayInMs: null,
        chunking: 'word',
      }),
    }
    if (context === 'onboarding') {
      streamOptions.tools = { show_date_picker: showDatePickerTool }
      // DEBUG: verify tool and prompt are configured
      console.log('[chat/route] onboarding context detected')
      console.log('[chat/route] tools passed to streamText:', Object.keys(streamOptions.tools ?? {}))
      console.log('[chat/route] todayISO:', todayISO, 'tomorrowISO:', tomorrowISO)
      console.log('[chat/route] system prompt contains DATE COLLECTION RULES:', systemPrompt.includes('DATE COLLECTION RULES'))
      console.log('[chat/route] system prompt contains show_date_picker:', systemPrompt.includes('show_date_picker'))
    }
    const result = streamText(streamOptions)

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
        if (context === 'onboarding') {
          const parts = (responseMessage as UIMessage).parts ?? []
          console.log('[chat/route] onFinish - response message parts:', JSON.stringify(parts, null, 2))
          console.log(
            '[chat/route] onFinish - had tool calls:',
            parts.some((p: { type?: string }) => p.type?.includes?.('tool'))
          )
        }
        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toISOString(),
        }

        const messagesToSave: StoredMessage[] = []

        if (isNewDiscussion) {
          const greetingUiMessage = uiMessages.find(
            (m) => m.role === 'assistant' && m.id === 'harvey-greeting'
          )
          if (greetingUiMessage) {
            const greetingText = greetingUiMessage.parts
              ?.find((p: { type: string }) => p.type === 'text')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?.text ?? (greetingUiMessage as any).content ?? ''
            if (greetingText) {
              messagesToSave.push({
                role: 'assistant',
                content: greetingText,
                timestamp: new Date(Date.now() - 1000).toISOString(),
              })
            }
          }
        }

        messagesToSave.push(userMessage, assistantMessage)

        await appendMessages(discussionId, messagesToSave)
        // Project title/description and other fields are extracted by POST /api/onboarding/extract
        // (triggered by the client after each Harvey response). No early extraction here.

        if (user?.id) {
          try {
            const usage = await result.usage
            if (usage) {
              logApiUsage({
                userId: user.id,
                feature: context === 'onboarding' ? 'onboarding_chat' : 'general_chat',
                model: MODEL_ID,
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
              }).catch(() => {})
            }
          } catch {
            // ignore
          }
        }
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
