/**
 * Discussion API Route Handler
 *
 * GET /api/discussions/[projectId]
 *
 * Fetches the conversation history for a specific project.
 * Used to display the onboarding conversation in the dashboard sidebar.
 *
 * URL Parameters:
 * - projectId: Project UUID to fetch discussion for
 *
 * Response:
 * - messages: ChatMessage[] - Conversation messages
 * - projectTitle: string - Project title
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getDiscussionByProjectId } from '@/lib/discussions/discussion-service'
import { prisma } from '@/lib/db/prisma'
import type { ChatMessage } from '@/lib/types/chat.types'
import type { StoredMessage } from '@/lib/types/api.types'

/**
 * Response type for GET /api/discussions/[projectId]
 */
interface DiscussionApiResponse {
  messages: ChatMessage[]
  projectTitle: string
}

/**
 * Transform StoredMessage to ChatMessage for frontend
 *
 * StoredMessage has: role, content, timestamp (ISO string)
 * ChatMessage needs: id, role, content, timestamp (Date), status
 */
function transformToClientMessages(storedMessages: StoredMessage[]): ChatMessage[] {
  return storedMessages.map((msg, index) => ({
    id: `msg-${index}`,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.timestamp), // Convert ISO string to Date
    status: 'complete' as const,
  }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  console.log('[DiscussionAPI] ========== Fetching discussion for project:', projectId, '==========')

  try {
    // ===== STEP 1: Authenticate User =====
    console.log('[DiscussionAPI] Step 1: Authenticating user')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[DiscussionAPI] Authentication failed:', authError?.message)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    console.log('[DiscussionAPI] User authenticated:', user.email)

    // ===== STEP 2: Verify Project Ownership =====
    console.log('[DiscussionAPI] Step 2: Verifying project ownership')

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: user.id,
      },
    })

    if (!project) {
      console.error('[DiscussionAPI] Project not found or not owned by user')
      return NextResponse.json(
        { error: 'Project not found', code: 'NOT_OWNER' },
        { status: 403 }
      )
    }

    console.log('[DiscussionAPI] Project verified:', project.title)

    // ===== STEP 3: Fetch Discussion =====
    console.log('[DiscussionAPI] Step 3: Fetching discussion')

    const discussion = await getDiscussionByProjectId(projectId, user.id)

    if (!discussion) {
      console.error('[DiscussionAPI] Discussion not found')
      return NextResponse.json(
        { error: 'Discussion not found', code: 'DISCUSSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    // ===== STEP 4: Transform and Return =====
    console.log('[DiscussionAPI] Step 4: Preparing response')

    const clientMessages = transformToClientMessages(discussion.messages)

    console.log('[DiscussionAPI] Returning', clientMessages.length, 'messages')
    console.log('[DiscussionAPI] ========== Fetch complete ==========')

    const response: DiscussionApiResponse = {
      messages: clientMessages,
      projectTitle: project.title,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[DiscussionAPI] Error fetching discussion:', errorMessage)

    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch discussion', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
