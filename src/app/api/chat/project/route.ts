/**
 * Post-Onboarding Project Chat API Route
 *
 * POST /api/chat/project
 *
 * Streaming chat endpoint for the post-onboarding project coach.
 * Uses Vercel AI SDK with Claude and 8 tools for schedule management.
 *
 * Architecture:
 * 1. Authenticate user via Supabase
 * 2. Load or create the "project" Discussion
 * 3. Assemble dynamic system prompt with live DB context
 * 4. Define 8 tools (modify_schedule, update_constraints, add_task,
 *    suggest_next_action, get_progress_summary, regenerate_schedule,
 *    update_project_notes, delete_task)
 * 5. Stream response via streamText() with maxSteps: 3
 * 6. Persist messages to Discussion on completion
 *
 * Request body: { messages: UIMessage[], projectId: string }
 * Response: UI Message Stream protocol (toUIMessageStreamResponse)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { streamText, tool, createUIMessageStream, createUIMessageStreamResponse, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import type { UIMessage } from 'ai'

// Context assembly
import { assembleProjectChatContext } from '@/lib/chat/assembleContext'

// Tool execute functions
import { executeModifySchedule } from '@/lib/chat/tools/modifySchedule'
import { executeUpdateConstraints } from '@/lib/chat/tools/updateConstraints'
import { executeAddTask } from '@/lib/chat/tools/addTask'
import { executeSuggestNextAction } from '@/lib/chat/tools/suggestNextAction'
import { executeGetProgressSummary } from '@/lib/chat/tools/getProgressSummary'
import { executeRegenerateSchedule } from '@/lib/chat/tools/regenerateSchedule'
import { executeUpdateProjectNotes } from '@/lib/chat/tools/updateProjectNotes'
import { executeDeleteTask } from '@/lib/chat/tools/deleteTask'

// Discussion persistence
import {
  getProjectDiscussion,
  createDiscussion,
  appendMessages,
} from '@/lib/discussions/discussion-service'
import { getProjectById } from '@/lib/projects/project-service'
import { userExists, createUser } from '@/lib/users/user-service'
import type { StoredMessage } from '@/types/api.types'
import { MODELS } from '@/lib/ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'

/** Max messages to send to Claude for conversation history (reduced for cost during MVP testing) */
const MAX_HISTORY_MESSAGES = 10

/** Harvey's greeting when project discussion is created (matches generate-schedule) */
const HARVEY_GREETING: StoredMessage = {
  role: 'assistant',
  content:
    "Here's your schedule! Take a look and let me know if anything needs adjusting — you can ask me to move tasks, add new ones, or change your availability anytime.",
  timestamp: new Date().toISOString(),
}

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
  console.log('[ProjectChat] ========== New project chat request ==========')

  try {
    // ===== STEP 1: Authenticate User =====
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[ProjectChat] Authentication failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    // ===== STEP 2: Parse Request Body =====
    let body: { messages?: UIMessage[]; projectId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { messages: uiMessages = [], projectId } = body

    const lastUserContent = getLastUserMessage(uiMessages)
    console.log('[ProjectChat] route.ts body parsed', {
      keys: Object.keys(body),
      uiMessagesLength: uiMessages?.length ?? 0,
      projectId,
      lastUserContentTruncated: lastUserContent ? lastUserContent.slice(0, 60) : null,
    })

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required', code: 'MISSING_PROJECT_ID' },
        { status: 400 }
      )
    }

    if (!lastUserContent || lastUserContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required', code: 'MISSING_MESSAGE' },
        { status: 400 }
      )
    }

    // ===== STEP 3: Validate Project Ownership =====
    const project = await getProjectById(projectId, user.id)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
        { status: 404 }
      )
    }
    console.log('[ProjectChat] route.ts project validated', { projectId, projectTitle: project.title })

    // ===== STEP 3b: Ensure user exists in DB (assembleProjectChatContext requires it) =====
    const userInDb = await userExists(user.id)
    if (!userInDb) {
      const createResult = await createUser({
        id: user.id,
        email: user.email ?? '',
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        timezone: 'Europe/Paris',
      })
      if (!createResult.success) {
        console.error('[ProjectChat] Failed to ensure user in DB:', createResult.error?.message)
        return NextResponse.json(
          { error: 'Failed to initialize user', code: 'INTERNAL_ERROR' },
          { status: 500 }
        )
      }
      console.log('[ProjectChat] User record created for chat context')
    }

    // ===== STEP 4: Get or Create Project Discussion =====
    let discussion = await getProjectDiscussion(projectId, user.id)

    if (!discussion) {
      const result = await createDiscussion({
        projectId,
        userId: user.id,
        type: 'project',
        initialMessage: HARVEY_GREETING,
      })
      if (!result.success || !result.discussion) {
        return NextResponse.json(
          { error: 'Failed to create discussion', code: 'DISCUSSION_CREATE_FAILED' },
          { status: 500 }
        )
      }
      discussion = result.discussion
    }
    const existingMessages: StoredMessage[] = discussion.messages || []
    console.log('[ProjectChat] route.ts discussion ready', {
      discussionId: discussion.id,
      existingMessagesLength: existingMessages.length,
    })

    // ===== STEP 5: Build conversation history for Claude =====
    // Take last N messages for context
    const recentMessages = existingMessages.slice(-MAX_HISTORY_MESSAGES)

    // Add the new user message
    const userMessage: StoredMessage = {
      role: 'user',
      content: lastUserContent.trim(),
      timestamp: new Date().toISOString(),
    }
    const allMessagesForClaude = [...recentMessages, userMessage]
    console.log('[ProjectChat] route.ts building model messages', {
      recentMessagesLength: recentMessages.length,
      allMessagesForClaudeLength: allMessagesForClaude.length,
    })

    // Persist user message immediately so it's stored even if the stream fails
    const appendResult = await appendMessages(discussion.id, [userMessage])
    if (!appendResult.success) {
      console.error('[ProjectChat] Failed to persist user message:', appendResult.error?.message)
    } else {
      console.log('[ProjectChat] User message persisted to discussion')
    }

    const modelMessages = allMessagesForClaude.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // ===== STEP 6: Assemble Dynamic System Prompt =====
    console.log('[ProjectChat] route.ts calling assembleProjectChatContext(projectId, userId)', {
      projectId,
      userId: user.id,
    })
    const systemPrompt = await assembleProjectChatContext(projectId, user.id)
    console.log('[ProjectChat] route.ts systemPrompt length', systemPrompt.length)

    // ===== STEP 7: Define Tools using AI SDK tool() helper =====
    const chatTools = {
      modify_schedule: tool({
        description:
          'Move or resize a specific task in the schedule. Use when the user wants to change when a task happens or how long it takes.',
        inputSchema: z.object({
          task_id: z.string().describe('The ID of the task to modify'),
          new_date: z.string().optional().describe('New date in YYYY-MM-DD format'),
          new_start_time: z.string().optional().describe('New start time in HH:MM 24h format'),
          new_end_time: z.string().optional().describe('New end time in HH:MM 24h format'),
          new_duration: z.number().optional().describe('New duration in minutes'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: modify_schedule', { task_id: (params as { task_id?: string }).task_id })
          return executeModifySchedule(params, projectId, user.id)
        },
      }),

      update_constraints: tool({
        description:
          "Update user availability or scheduling constraints. Use for permanent changes (e.g., \"I don't work Fridays anymore\") or one-off blocks (e.g., \"I can't work this Friday\"). After updating, ask the user if they want to rebuild the schedule.",
        inputSchema: z.object({
          change_type: z.enum(['permanent', 'one_off']).describe('Whether this is a recurring change or a one-time block'),
          action: z.enum(['add', 'remove', 'modify']).describe('What action to take on the constraint'),
          constraint_type: z.enum(['available_time', 'blocked_time', 'preference']).describe('Which type of constraint to change'),
          description: z.string().describe('Natural language description of the change'),
          date: z.string().optional().describe('Specific date for one-off blocks: YYYY-MM-DD'),
          date_start: z.string().optional().describe('Start date for one-off range'),
          date_end: z.string().optional().describe('End date for one-off range'),
          time_start: z.string().optional().describe('Start time in HH:MM 24h format'),
          time_end: z.string().optional().describe('End time in HH:MM 24h format'),
          all_day: z.boolean().optional().describe('Whether this blocks the entire day'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: update_constraints', { change_type: (params as { change_type?: string }).change_type })
          return executeUpdateConstraints(params, projectId, user.id)
        },
      }),

      add_task: tool({
        description:
          "Add a new task to the schedule. Find the best available time slot based on the user's constraints, task dependencies, and logical ordering.",
        inputSchema: z.object({
          title: z.string().describe('Title of the new task'),
          description: z.string().optional().describe('Detailed description or success criteria'),
          estimated_duration: z.number().describe('Estimated duration in minutes'),
          label: z.string().optional().describe('Category: coding, research, design, marketing, communication, personal, planning'),
          depends_on: z.array(z.string()).optional().describe('Array of task IDs this task depends on'),
          preferred_date: z.string().optional().describe('Preferred date in YYYY-MM-DD if user specified'),
          preferred_time: z.string().optional().describe('Preferred start time in HH:MM if user specified'),
          placement_hint: z.string().optional().describe('Logical placement hint'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: add_task', { title: (params as { title?: string }).title })
          return executeAddTask(params, projectId, user.id)
        },
      }),

      suggest_next_action: tool({
        description:
          'Get structured data about the current schedule state to recommend what the user should do next. Use when the user asks what to work on, has free time, or needs direction.',
        inputSchema: z.object({
          available_minutes: z.number().optional().describe('How many minutes the user has available'),
          context: z.string().optional().describe('Any additional context from the user'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: suggest_next_action')
          return executeSuggestNextAction(params, projectId, user.id)
        },
      }),

      get_progress_summary: tool({
        description:
          'Get simple progress statistics for the current project schedule. Use when the user asks about their progress or how the week is going.',
        inputSchema: z.object({
          period: z.enum(['today', 'this_week', 'all']).optional().describe('Time period for the summary'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: get_progress_summary', { period: (params as { period?: string }).period })
          return executeGetProgressSummary(params, projectId, user.id)
        },
      }),

      regenerate_schedule: tool({
        description:
          'Rebuild the schedule for remaining tasks. Completed tasks are locked. Skipped and pending tasks get reassigned. "remaining" keeps progress, "full_rebuild" starts from scratch.',
        inputSchema: z.object({
          scope: z.enum(['remaining', 'full_rebuild']).describe('"remaining" reschedules pending/skipped tasks. "full_rebuild" regenerates everything.'),
          focus_area: z.string().optional().describe('What to prioritize in the new schedule'),
          notes: z.string().optional().describe('Additional context for regeneration'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: regenerate_schedule', { scope: (params as { scope?: string }).scope })
          return executeRegenerateSchedule(params, projectId, user.id)
        },
      }),

      update_project_notes: tool({
        description:
          'Store an important insight about the user or their project for future reference. Only call this when you learn something genuinely new. Do NOT call this on every message.',
        inputSchema: z.object({
          note: z.string().describe('The insight to remember'),
          action: z.enum(['append', 'replace']).optional().describe('"append" adds to existing notes, "replace" overwrites them'),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: update_project_notes', { action: (params as { action?: string }).action })
          return executeUpdateProjectNotes(params, projectId, user.id)
        },
      }),

      delete_task: tool({
        description:
          'Delete a task permanently. ' +
          'IMPORTANT: You MUST call this tool to actually delete the task. ' +
          'Saying "done" or "deleted" without calling this tool does nothing. ' +
          'When the user confirms deletion (yes / go ahead / do it / any affirmative): ' +
          'call this tool immediately in the same response. ' +
          'Do not narrate deletion without a tool call result.',
        inputSchema: z.object({
          task_id: z
            .string()
            .describe(
              'The exact ID of the task to delete. ' +
                'You must resolve this from the task list in context before calling.'
            ),
        }),
        execute: async (params) => {
          console.log('[ProjectChat] route.ts tool execute: delete_task', params)
          return executeDeleteTask(params, projectId, user.id)
        },
      }),
    }

    // ===== STEP 8: Stream Response =====
    console.log('[ProjectChat] route.ts calling streamText', {
      model: MODELS.PROJECT_CHAT,
      modelMessagesLength: modelMessages.length,
      tools: Object.keys(chatTools),
    })
    const result = streamText({
      model: anthropic(MODELS.PROJECT_CHAT),
      system: systemPrompt,
      messages: modelMessages,
      tools: chatTools,
      stopWhen: stepCountIs(3),
    })

    // ===== STEP 9: Return UI Message Stream Response =====
    // Using the same pattern as the onboarding chat route
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        console.log('[ProjectChat] route.ts stream execute started')
        try {
          writer.merge(result.toUIMessageStream())
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const stack = err instanceof Error ? err.stack : undefined
          console.error('[ProjectChat] route.ts stream execute ERROR', msg, stack)
          throw err
        }
      },
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage }) => {
        const fullText = getMessageText(responseMessage as UIMessage)
        console.log('[ProjectChat] route.ts onFinish called', {
          responseMessageRole: (responseMessage as UIMessage).role,
          responseTextLength: fullText.length,
        })
        if (!fullText || fullText.trim().length === 0) {
          console.warn('[ProjectChat] route.ts onFinish WARNING: assistant message text is empty')
          return
        }
        // Persist assistant message only when non-empty (user message already persisted)
        try {
          const assistantMessage: StoredMessage = {
            role: 'assistant',
            content: fullText.trim(),
            timestamp: new Date().toISOString(),
          }
          const appendResult = await appendMessages(discussion!.id, [assistantMessage])
          if (appendResult.success) {
            console.log('[ProjectChat] Assistant message persisted to discussion')
          } else {
            console.error('[ProjectChat] Failed to persist assistant message:', appendResult.error?.message)
          }
        } catch (err) {
          console.error('[ProjectChat] Failed to persist assistant message:', err)
        }

        if (user?.id) {
          try {
            const usage = await result.usage
            if (usage) {
              logApiUsage({
                userId: user.id,
                feature: 'project_chat',
                model: MODELS.PROJECT_CHAT,
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
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[ProjectChat] route.ts Unexpected error:', err.message, err.stack)
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
