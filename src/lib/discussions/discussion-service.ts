/**
 * Discussion Service
 *
 * Handles all database operations for discussions.
 * Manages the messages JSON array within Discussion records.
 *
 * Discussion stores conversation between user and Harvey:
 * - Linked to a Project and User
 * - Messages stored as JSON array for flexibility
 * - Each message has role, content, timestamp
 */

import { prisma } from '../db/prisma'
import type { StoredMessage } from '../../types/api.types'
import type { Prisma } from '@prisma/client'

/** Discussion type: onboarding (during intake), project (post-schedule chat), or task (future) */
export type DiscussionType = 'onboarding' | 'project' | 'task'

/**
 * Data needed to create a new discussion
 */
export interface CreateDiscussionData {
  /**
   * Project this discussion belongs to
   */
  projectId: string

  /**
   * User who owns this discussion (matches Supabase Auth ID)
   */
  userId: string

  /**
   * Discussion type: "onboarding" | "project" | "task"
   * Defaults to "project" when not provided.
   */
  type?: DiscussionType

  /**
   * Only set when type = "task" — references Task id
   */
  taskId?: string

  /**
   * Optional initial message to include
   */
  initialMessage?: StoredMessage
}

/**
 * Response wrapper for discussion operations
 */
export interface DiscussionServiceResponse {
  success: boolean
  discussion?: {
    id: string
    projectId: string
    userId: string
    messages: StoredMessage[]
    createdAt: Date
    updatedAt: Date
  }
  error?: {
    message: string
    code?: string
    details?: unknown
  }
}

/**
 * Helper to safely cast Prisma JSON to StoredMessage[]
 *
 * Prisma's JSON type is not directly compatible with our types,
 * so we need to cast through unknown first.
 */
function toStoredMessages(json: Prisma.JsonValue): StoredMessage[] {
  if (!json || !Array.isArray(json)) {
    return []
  }
  return json as unknown as StoredMessage[]
}

/**
 * Helper to cast StoredMessage[] to Prisma JSON input
 */
function toJsonInput(messages: StoredMessage[]): Prisma.InputJsonValue {
  return messages as unknown as Prisma.InputJsonValue
}

/**
 * Check if error indicates missing type/taskId columns (migration not applied yet).
 */
function isColumnMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    /column.*["']?type["']?.*does not exist/i.test(msg) ||
    /column.*["']?taskId["']?.*does not exist/i.test(msg) ||
    /does not exist/i.test(msg)
  )
}

/**
 * Create a new discussion for a project
 *
 * Called during onboarding when project is created.
 * Initializes with empty messages array or optional initial message.
 *
 * @param data - Discussion creation data
 * @returns Created discussion or error
 */
export async function createDiscussion(
  data: CreateDiscussionData
): Promise<DiscussionServiceResponse> {
  try {
    console.log('[DiscussionService] Creating discussion for project:', data.projectId)

    // Initialize messages array (empty or with initial message)
    const messages: StoredMessage[] = data.initialMessage
      ? [data.initialMessage]
      : []

    const discussion = await prisma.discussion.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        type: data.type ?? 'project',
        taskId: data.taskId ?? null,
        messages: toJsonInput(messages),
      },
    })

    console.log('[DiscussionService] Discussion created:', discussion.id)

    return {
      success: true,
      discussion: {
        ...discussion,
        messages: toStoredMessages(discussion.messages),
      },
    }
  } catch (error: unknown) {
    // Fallback: if type/taskId columns don't exist (migration not applied), use raw insert
    if (isColumnMissingError(error)) {
      console.warn('[DiscussionService] type/taskId columns missing, using raw insert (run migrations or scripts/apply-discussion-migrations.sql)')
      try {
        const messages: StoredMessage[] = data.initialMessage ? [data.initialMessage] : []
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string; projectId: string; userId: string; messages: unknown; createdAt: Date; updatedAt: Date }>>(
          `INSERT INTO discussions (id, "projectId", "userId", messages, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, now(), now())
           RETURNING id, "projectId", "userId", messages, "createdAt", "updatedAt"`,
          data.projectId,
          data.userId,
          JSON.stringify(messages)
        )
        const row = rows[0]
        if (row) {
          return {
            success: true,
            discussion: {
              ...row,
              messages: toStoredMessages(row.messages as Prisma.JsonValue),
            },
          }
        }
      } catch (retryError) {
        console.error('[DiscussionService] Raw insert fallback failed:', retryError)
      }
    }

    console.error('[DiscussionService] Error creating discussion:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create discussion'
    return {
      success: false,
      error: { message: errorMessage, details: error },
    }
  }
}

/**
 * Get discussion by project ID and type
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @param type - Discussion type to fetch
 * @returns Discussion or null if not found
 */
export async function getDiscussionByProjectIdAndType(
  projectId: string,
  userId: string,
  type: DiscussionType
): Promise<DiscussionServiceResponse['discussion'] | null> {
  try {
    console.log('[DiscussionService] Fetching discussion for project:', projectId, 'type:', type)

    const discussion = await prisma.discussion.findFirst({
      where: {
        projectId,
        userId,
        type,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!discussion) {
      console.log('[DiscussionService] Discussion not found')
      return null
    }

    const messages = toStoredMessages(discussion.messages)
    console.log('[DiscussionService] Discussion found with', messages.length, 'messages')
    console.log('[DiscussionService] discussion-service.ts getDiscussionByProjectIdAndType returning', {
      type,
      messagesLength: messages.length,
    })

    return {
      ...discussion,
      messages,
    }
  } catch (error) {
    // Fallback: if type column doesn't exist (migration not applied), use raw query
    if (isColumnMissingError(error)) {
      console.warn('[DiscussionService] type column missing, falling back to raw query (run migrations or scripts/apply-discussion-migrations.sql)')
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string; projectId: string; userId: string; messages: unknown; createdAt: Date; updatedAt: Date }>>(
          `SELECT id, "projectId", "userId", messages, "createdAt", "updatedAt" FROM discussions WHERE "projectId" = $1 AND "userId" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
          projectId,
          userId
        )
        const row = rows[0]
        if (!row) return null
        return {
          ...row,
          messages: toStoredMessages(row.messages as Prisma.JsonValue),
        }
      } catch {
        return null
      }
    }
    console.error('[DiscussionService] Error fetching discussion:', error)
    return null
  }
}

/**
 * Get the project discussion (post-schedule chat).
 * Used by dashboard chat and project chat API.
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Project discussion or null if not found
 */
export async function getProjectDiscussion(
  projectId: string,
  userId: string
): Promise<DiscussionServiceResponse['discussion'] | null> {
  return getDiscussionByProjectIdAndType(projectId, userId, 'project')
}

/**
 * Get the onboarding discussion.
 * Used by onboarding chat and schedule generation (for extracting conversation text).
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Onboarding discussion or null if not found
 */
export async function getOnboardingDiscussion(
  projectId: string,
  userId: string
): Promise<DiscussionServiceResponse['discussion'] | null> {
  return getDiscussionByProjectIdAndType(projectId, userId, 'onboarding')
}

/**
 * Get the task discussion for a given task.
 * Used by task chat view to load existing messages.
 *
 * @param projectId - Project UUID (for ownership)
 * @param userId - User ID for ownership validation
 * @param taskId - Task UUID
 * @returns Task discussion or null if not found
 */
export async function getTaskDiscussion(
  projectId: string,
  userId: string,
  taskId: string
): Promise<DiscussionServiceResponse['discussion'] | null> {
  try {
    const discussion = await prisma.discussion.findFirst({
      where: {
        projectId,
        userId,
        type: 'task',
        taskId,
      },
    })
    if (!discussion) return null
    return {
      ...discussion,
      messages: toStoredMessages(discussion.messages),
    }
  } catch (error) {
    console.error('[DiscussionService] Error fetching task discussion:', error)
    return null
  }
}

/**
 * List all task discussions for a project.
 * Used by dashboard on load to repopulate open task chats after refresh.
 * Excludes discussions whose task was deleted (task relation null).
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Array of task discussions with task title/label
 */
export async function listTaskDiscussions(
  projectId: string,
  userId: string
): Promise<
  Array<
    DiscussionServiceResponse['discussion'] & {
      taskId: string | null
      task: { title: string; label: string | null } | null
    }
  >
> {
  try {
    const rows = await prisma.discussion.findMany({
      where: {
        projectId,
        userId,
        type: 'task',
      },
      include: {
        task: { select: { title: true, label: true } },
      },
    })
    const withMessages = rows.map((d) => ({
      ...d,
      messages: toStoredMessages(d.messages),
      task: d.task,
    }))
    return withMessages.filter((d) => d.task != null) as Array<
      DiscussionServiceResponse['discussion'] & {
        taskId: string | null
        task: { title: string; label: string | null }
      }
    >
  } catch (error) {
    console.error('[DiscussionService] Error listing task discussions:', error)
    return []
  }
}

/**
 * Get discussion by project ID (legacy).
 * Fetches onboarding discussion for backward compatibility.
 *
 * @deprecated Prefer getProjectDiscussion or getOnboardingDiscussion
 */
export async function getDiscussionByProjectId(
  projectId: string,
  userId: string
): Promise<DiscussionServiceResponse['discussion'] | null> {
  return getOnboardingDiscussion(projectId, userId)
}

/**
 * Append a single message to discussion
 *
 * Loads existing messages, appends new one, saves back.
 *
 * @param discussionId - Discussion UUID
 * @param message - Message to append
 * @returns Updated discussion or error
 */
export async function appendMessage(
  discussionId: string,
  message: StoredMessage
): Promise<DiscussionServiceResponse> {
  return appendMessages(discussionId, [message])
}

/**
 * Append multiple messages to discussion
 *
 * Used when adding both user message and AI response at once.
 * More efficient than two separate calls.
 *
 * @param discussionId - Discussion UUID
 * @param messages - Array of messages to append
 * @returns Updated discussion or error
 */
export async function appendMessages(
  discussionId: string,
  messages: StoredMessage[]
): Promise<DiscussionServiceResponse> {
  try {
    console.log('[DiscussionService] Appending', messages.length, 'messages to:', discussionId)

    // First, get current messages
    const current = await prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { messages: true },
    })

    if (!current) {
      console.error('[DiscussionService] discussion-service.ts appendMessages FAILED: Discussion not found', {
        discussionId,
      })
      return {
        success: false,
        error: {
          message: 'Discussion not found',
          code: 'DISCUSSION_NOT_FOUND',
        },
      }
    }

    // Parse current messages and append new ones
    const currentMessages = toStoredMessages(current.messages)
    const updatedMessages = [...currentMessages, ...messages]

    // Update with new messages array
    const discussion = await prisma.discussion.update({
      where: { id: discussionId },
      data: {
        messages: toJsonInput(updatedMessages),
        updatedAt: new Date(),
      },
    })

    console.log('[DiscussionService] Messages appended, total:', updatedMessages.length)
    console.log('[DiscussionService] discussion-service.ts appendMessages success', {
      discussionId,
      appendedCount: messages.length,
    })

    return {
      success: true,
      discussion: {
        ...discussion,
        messages: toStoredMessages(discussion.messages),
      },
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[DiscussionService] discussion-service.ts appendMessages FAILED', errMsg, error)

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to append messages'

    return {
      success: false,
      error: {
        message: errorMessage,
        details: error,
      },
    }
  }
}

/**
 * Get all messages from a discussion
 *
 * Convenience method when you only need the messages,
 * not the full discussion object.
 *
 * @param discussionId - Discussion UUID
 * @returns Array of messages or empty array if not found
 */
export async function getMessages(discussionId: string): Promise<StoredMessage[]> {
  try {
    const discussion = await prisma.discussion.findUnique({
      where: { id: discussionId },
      select: { messages: true },
    })

    return toStoredMessages(discussion?.messages ?? null)
  } catch (error) {
    console.error('[DiscussionService] Error getting messages:', error)
    return []
  }
}
