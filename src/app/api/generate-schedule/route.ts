/**
 * Generate Schedule API Route Handler
 *
 * POST /api/generate-schedule
 *
 * Extracts constraints from completed onboarding conversation and
 * generates tasks using Claude AI. This is called when user clicks
 * "Build my schedule" and the loading page is shown.
 *
 * Flow:
 * 1. Authenticate user via Supabase
 * 2. Get projectId from request body
 * 3. Load Discussion from database
 * 4. Convert messages to conversation text
 * 5. Extract constraints using Claude
 * 6. Generate tasks using Claude
 * 7. Parse tasks
 * 8. Save constraints to Project.contextData
 * 9. Create Task records in database
 * 10. Return success with task count
 *
 * Request Body:
 * - projectId: string (required) - Project to generate schedule for
 *
 * Response:
 * - success: boolean
 * - taskCount?: number - Number of tasks created
 * - milestones?: string - Milestones text
 * - error?: string - Error message if failed
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import {
  extractConstraints,
  generateTasks,
  parseTasks,
} from '@/lib/schedule/schedule-generation'
import type {
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  StoredMessage,
  ExtractedConstraints,
} from '@/lib/types/api.types'
import type { Prisma } from '@prisma/client'

export async function POST(request: NextRequest) {
  console.log('[GenerateScheduleAPI] ========== New schedule generation request ==========')

  try {
    // ===== STEP 1: Authenticate User =====
    console.log('[GenerateScheduleAPI] Step 1: Authenticating user')

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[GenerateScheduleAPI] Authentication failed:', authError?.message)
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    console.log('[GenerateScheduleAPI] User authenticated:', user.email)

    // ===== STEP 2: Parse Request Body =====
    console.log('[GenerateScheduleAPI] Step 2: Parsing request body')

    let body: GenerateScheduleRequest
    try {
      body = await request.json()
    } catch {
      console.error('[GenerateScheduleAPI] Invalid JSON in request body')
      return NextResponse.json(
        { success: false, error: 'Invalid request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { projectId } = body

    if (!projectId || typeof projectId !== 'string') {
      console.error('[GenerateScheduleAPI] Missing projectId')
      return NextResponse.json(
        { success: false, error: 'Project ID is required', code: 'MISSING_PROJECT_ID' },
        { status: 400 }
      )
    }

    console.log('[GenerateScheduleAPI] Project ID:', projectId)

    // ===== STEP 3: Load Discussion from Database =====
    console.log('[GenerateScheduleAPI] Step 3: Loading discussion')

    const discussion = await prisma.discussion.findFirst({
      where: {
        projectId: projectId,
        userId: user.id, // Ensure user owns the discussion
      },
    })

    if (!discussion) {
      console.error('[GenerateScheduleAPI] Discussion not found for project')
      return NextResponse.json(
        { success: false, error: 'Discussion not found', code: 'DISCUSSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    console.log('[GenerateScheduleAPI] Discussion found:', discussion.id)

    // ===== STEP 4: Convert Messages to Conversation Text =====
    console.log('[GenerateScheduleAPI] Step 4: Converting messages to text')

    // Cast Prisma JSON to StoredMessage array
    const messages = (discussion.messages as unknown as StoredMessage[]) || []

    // Format as "ROLE: content" for Claude
    const conversationText = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')

    console.log('[GenerateScheduleAPI] Conversation has', messages.length, 'messages')

    // ===== STEP 5: Extract Constraints =====
    console.log('[GenerateScheduleAPI] Step 5: 🔍 Extracting constraints from conversation...')

    const constraints = await extractConstraints(conversationText)

    console.log('[GenerateScheduleAPI] ✅ Extracted constraints:', JSON.stringify(constraints, null, 2))

    // ===== STEP 6: Generate Tasks =====
    console.log('[GenerateScheduleAPI] Step 6: 🎯 Generating tasks...')

    const tasksResponse = await generateTasks(conversationText, constraints)

    // ===== STEP 7: Parse Tasks =====
    console.log('[GenerateScheduleAPI] Step 7: Parsing tasks')

    const { tasks, milestones } = parseTasks(tasksResponse)

    console.log(`[GenerateScheduleAPI] ✅ Generated ${tasks.length} tasks`)

    // Log each task for debugging
    console.log('\n[GenerateScheduleAPI] 📋 GENERATED TASKS:')
    tasks.forEach((task, index) => {
      console.log(`\n[GenerateScheduleAPI] Task ${index + 1}: ${task.title}`)
      console.log(`  Hours: ${task.hours}`)
      console.log(`  Priority: ${task.priority}`)
      console.log(`  Success: ${task.success}`)
      console.log(`  Description: ${task.description.substring(0, 100)}...`)
    })

    if (milestones) {
      console.log('\n[GenerateScheduleAPI] 📍 MILESTONES:')
      console.log(milestones)
    }

    // ===== STEP 8: Save Constraints to Project.contextData =====
    console.log('[GenerateScheduleAPI] Step 8: Saving constraints to Project.contextData')

    await prisma.project.update({
      where: { id: projectId },
      data: {
        contextData: constraints as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    })

    console.log('[GenerateScheduleAPI] ✅ Saved constraints to Project.contextData')

    // ===== STEP 9: Create Task Records in Database =====
    console.log('[GenerateScheduleAPI] Step 9: Creating task records')

    // Map priority string to integer (high=1, medium=3, low=5)
    const priorityMap: Record<string, number> = {
      high: 1,
      medium: 3,
      low: 5,
    }

    // Prepare task records for bulk creation
    const taskRecords = tasks.map((task) => ({
      userId: user.id,
      projectId: projectId,
      title: task.title,
      description: task.description,
      successCriteria: task.success,
      estimatedDuration: Math.round(task.hours * 60), // Convert hours to minutes
      priority: priorityMap[task.priority] || 3,
      type: 'project',
      status: 'pending',
      // scheduledDate, scheduledStartTime, scheduledEndTime remain null for now
    }))

    // Bulk create tasks
    await prisma.task.createMany({ data: taskRecords })

    console.log(`[GenerateScheduleAPI] ✅ Created ${taskRecords.length} task records in database`)

    // ===== STEP 10: Return Success Response =====
    console.log('[GenerateScheduleAPI] Step 10: Preparing response')
    console.log('[GenerateScheduleAPI] ========== Schedule generation complete ==========')

    const response: GenerateScheduleResponse = {
      success: true,
      taskCount: tasks.length,
      milestones: milestones || undefined,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[GenerateScheduleAPI] ❌ Error generating schedule:', errorMessage)

    // Check if it's a Claude API error
    if (errorMessage.includes('anthropic') || errorMessage.includes('API')) {
      return NextResponse.json(
        { success: false, error: 'AI service unavailable', code: 'AI_ERROR' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { success: false, error: errorMessage || 'Failed to generate schedule', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
