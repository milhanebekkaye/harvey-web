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
    console.error('[DiscussionService] Error creating discussion:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create discussion'

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
 * Get discussion by project ID
 *
 * A project typically has one active discussion.
 * Returns the most recent if multiple exist.
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Discussion or null if not found
 */
export async function getDiscussionByProjectId(
  projectId: string,
  userId: string
): Promise<DiscussionServiceResponse['discussion'] | null> {
  try {
    console.log('[DiscussionService] Fetching discussion for project:', projectId)

    const discussion = await prisma.discussion.findFirst({
      where: {
        projectId: projectId,
        userId: userId, // Ensures user owns the discussion
      },
      orderBy: {
        createdAt: 'desc', // Get most recent if multiple exist
      },
    })

    if (!discussion) {
      console.log('[DiscussionService] Discussion not found')
      return null
    }

    const messages = toStoredMessages(discussion.messages)
    console.log('[DiscussionService] Discussion found with', messages.length, 'messages')

    return {
      ...discussion,
      messages,
    }
  } catch (error) {
    console.error('[DiscussionService] Error fetching discussion:', error)
    return null
  }
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
      console.error('[DiscussionService] Discussion not found:', discussionId)
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

    return {
      success: true,
      discussion: {
        ...discussion,
        messages: toStoredMessages(discussion.messages),
      },
    }
  } catch (error: unknown) {
    console.error('[DiscussionService] Error appending messages:', error)

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
