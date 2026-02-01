/**
 * Chat API Route Handler
 *
 * POST /api/chat
 *
 * Handles AI conversation for project intake during onboarding.
 * This is the main endpoint connecting the frontend chat UI to Claude.
 *
 * Flow:
 * 1. Authenticate user via Supabase
 * 2. First message: Create User (if needed), Project, Discussion
 * 3. Continuing: Load existing Discussion
 * 4. Call Claude API with conversation history
 * 5. Save response and return
 *
 * Request Body:
 * - message: string (required) - User's message
 * - projectId: string (optional) - For continuing conversation
 *
 * Response:
 * - response: string - Claude's response (cleaned)
 * - isComplete: boolean - True if intake is complete
 * - projectId: string - Project ID (created or existing)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { createUser, userExists } from '@/lib/users/user-service'
import { createProject, getProjectById } from '@/lib/projects/project-service'
import {
  createDiscussion,
  getDiscussionByProjectId,
  appendMessages,
} from '@/lib/discussions/discussion-service'
import {
  getChatCompletion,
  formatMessagesForClaude,
  isIntakeComplete,
  cleanResponse,
} from '@/lib/ai/claude-client'
import { ONBOARDING_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import type { ChatRequest, ChatResponse, StoredMessage } from '@/lib/types/api.types'

export async function POST(request: NextRequest) {
  console.log('[ChatAPI] ========== New chat request ==========')

  try {
    // ===== STEP 1: Authenticate User =====
    console.log('[ChatAPI] Step 1: Authenticating user')

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

    console.log('[ChatAPI] User authenticated:', user.email)

    // ===== STEP 2: Parse Request Body =====
    console.log('[ChatAPI] Step 2: Parsing request body')

    let body: ChatRequest
    try {
      body = await request.json()
    } catch {
      console.error('[ChatAPI] Invalid JSON in request body')
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { message, projectId } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      console.error('[ChatAPI] Missing or empty message')
      return NextResponse.json(
        { error: 'Message is required', code: 'MISSING_MESSAGE' },
        { status: 400 }
      )
    }

    console.log('[ChatAPI] Message received, length:', message.length)
    console.log('[ChatAPI] Project ID:', projectId || 'NEW CONVERSATION')

    // ===== STEP 3: Handle First Message vs Continuing =====
    let currentProjectId: string
    let discussionId: string
    let existingMessages: StoredMessage[] = []

    if (!projectId) {
      // ===== FIRST MESSAGE: Create User, Project, Discussion =====
      console.log('[ChatAPI] Step 3: First message - creating entities')

      // 3a. Ensure user exists in database
      const userInDb = await userExists(user.id)
      if (!userInDb) {
        console.log('[ChatAPI] Creating database user')
        const userResult = await createUser({
          id: user.id,
          email: user.email!,
          name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          timezone: 'Europe/Paris',
        })

        if (!userResult.success) {
          console.error('[ChatAPI] Failed to create user:', userResult.error)
          // Continue anyway - user might already exist from different flow
        }
      }

      // 3b. Create Project
      console.log('[ChatAPI] Creating new project')
      const projectResult = await createProject({
        userId: user.id,
        title: 'Untitled Project',
      })

      if (!projectResult.success || !projectResult.project) {
        console.error('[ChatAPI] Failed to create project:', projectResult.error)
        return NextResponse.json(
          { error: 'Failed to create project', code: 'PROJECT_CREATE_FAILED' },
          { status: 500 }
        )
      }

      currentProjectId = projectResult.project.id
      console.log('[ChatAPI] Project created:', currentProjectId)

      // 3c. Create Discussion
      console.log('[ChatAPI] Creating new discussion')
      const discussionResult = await createDiscussion({
        projectId: currentProjectId,
        userId: user.id,
      })

      if (!discussionResult.success || !discussionResult.discussion) {
        console.error('[ChatAPI] Failed to create discussion:', discussionResult.error)
        return NextResponse.json(
          { error: 'Failed to create discussion', code: 'DISCUSSION_CREATE_FAILED' },
          { status: 500 }
        )
      }

      discussionId = discussionResult.discussion.id
      console.log('[ChatAPI] Discussion created:', discussionId)
    } else {
      // ===== CONTINUING CONVERSATION: Load existing Discussion =====
      console.log('[ChatAPI] Step 3: Continuing conversation')

      // 3a. Validate project ownership
      const project = await getProjectById(projectId, user.id)
      if (!project) {
        console.error('[ChatAPI] Project not found or not owned by user')
        return NextResponse.json(
          { error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
          { status: 404 }
        )
      }

      currentProjectId = project.id

      // 3b. Get existing discussion
      const discussion = await getDiscussionByProjectId(projectId, user.id)
      if (!discussion) {
        console.error('[ChatAPI] Discussion not found for project')
        return NextResponse.json(
          { error: 'Discussion not found', code: 'DISCUSSION_NOT_FOUND' },
          { status: 404 }
        )
      }

      discussionId = discussion.id
      existingMessages = discussion.messages || []
      console.log('[ChatAPI] Loaded discussion with', existingMessages.length, 'messages')
    }

    // ===== STEP 4: Prepare User Message =====
    console.log('[ChatAPI] Step 4: Preparing messages for Claude')

    const userMessage: StoredMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    }

    // Combine existing messages with new user message
    const allMessages = [...existingMessages, userMessage]
    const claudeMessages = formatMessagesForClaude(allMessages)

    console.log('[ChatAPI] Total messages for Claude:', claudeMessages.length)

    // ===== STEP 5: Call Claude API =====
    console.log('[ChatAPI] Step 5: Calling Claude API')

    let claudeResponse: string
    try {
      claudeResponse = await getChatCompletion(ONBOARDING_SYSTEM_PROMPT, claudeMessages)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ChatAPI] Claude API error:', errorMessage)
      return NextResponse.json(
        { error: 'AI service unavailable', code: 'AI_ERROR' },
        { status: 503 }
      )
    }

    console.log('[ChatAPI] Claude response received')

    // ===== STEP 6: Create Assistant Message =====
    const assistantMessage: StoredMessage = {
      role: 'assistant',
      content: claudeResponse,
      timestamp: new Date().toISOString(),
    }

    // ===== STEP 7: Save Both Messages to Discussion =====
    console.log('[ChatAPI] Step 7: Saving messages to database')

    const saveResult = await appendMessages(discussionId, [userMessage, assistantMessage])

    if (!saveResult.success) {
      console.error('[ChatAPI] Failed to save messages:', saveResult.error)
      // Don't fail the request - user still got a response
      // Just log and continue
    }

    // ===== STEP 8: Check for Completion and Return =====
    console.log('[ChatAPI] Step 8: Preparing response')

    const isComplete = isIntakeComplete(claudeResponse)
    console.log('[ChatAPI] Intake complete:', isComplete)

    // Clean the completion marker from response before sending to frontend
    const cleanedResponse = cleanResponse(claudeResponse)

    const response: ChatResponse = {
      response: cleanedResponse,
      isComplete,
      projectId: currentProjectId,
    }

    console.log('[ChatAPI] ========== Request complete ==========')

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ChatAPI] Unexpected error:', errorMessage)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
