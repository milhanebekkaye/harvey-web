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
 * 9. Schedule tasks to specific dates/times using algorithm
 * 10. Create Task records in database with scheduled dates
 * 11. Return success with task count
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
  convertSuccessCriteriaToJson,
} from '@/lib/schedule/schedule-generation'
import {
  assignTasksToSchedule,
  calculateStartDate,
  getTaskScheduleData,
} from '@/lib/schedule/task-scheduler'
import type {
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  StoredMessage,
  ExtractedConstraints,
} from '@/types/api.types'

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

    // ===== STEP 3.5: Check if tasks already exist for this project =====
    // This prevents duplicate task creation from double API calls (React Strict Mode, network retries)
    const existingTasks = await prisma.task.findMany({
      where: { projectId: projectId },
      select: { id: true },
    })

    if (existingTasks.length > 0) {
      console.log(`[GenerateScheduleAPI] ⚠️ Tasks already exist for project (${existingTasks.length} tasks). Skipping generation.`)
      return NextResponse.json(
        {
          success: true,
          taskCount: existingTasks.length,
          message: 'Schedule already generated',
        },
        { status: 200 }
      )
    }

    console.log('[GenerateScheduleAPI] No existing tasks found, proceeding with generation')

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

    let constraints: ExtractedConstraints
    try {
      constraints = await extractConstraints(conversationText)
    } catch (constraintError) {
      console.error('[GenerateScheduleAPI] ❌ Failed to extract constraints:', constraintError)
      return NextResponse.json(
        {
          error: 'Failed to analyze your conversation. Please try generating your schedule again.',
          details: constraintError instanceof Error ? constraintError.message : 'Unknown error',
        },
        { status: 500 }
      )
    }

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
        contextData: constraints as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    })

    console.log('[GenerateScheduleAPI] ✅ Saved constraints to Project.contextData')

    // ===== STEP 9: Schedule Tasks =====
    console.log('[GenerateScheduleAPI] Step 9: 📅 Scheduling tasks to specific dates/times...')

    // Calculate start date based on user preference (or default to tomorrow/next Monday)
    // Get user's timezone from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { timezone: true },
    })

    const userTimezone = dbUser?.timezone || 'UTC'
    console.log(`[GenerateScheduleAPI] User timezone: ${userTimezone}`)

    // Calculate start date in user's timezone
    const startDate = calculateStartDate(constraints, userTimezone)
    const durationWeeks = constraints.schedule_duration_weeks || 2

    console.log(`[GenerateScheduleAPI] Start date: ${startDate.toISOString().split('T')[0]}`)
    console.log(`[GenerateScheduleAPI] Duration: ${durationWeeks} weeks`)

    // Run the scheduling algorithm to assign tasks to available time slots
    const scheduleResult = assignTasksToSchedule(tasks, constraints, startDate, durationWeeks)

    console.log(`[GenerateScheduleAPI] ✅ Scheduled ${scheduleResult.scheduledTasks.length} task blocks`)
    console.log(`[GenerateScheduleAPI]   Total hours scheduled: ${scheduleResult.totalHoursScheduled.toFixed(1)}`)
    if (scheduleResult.unscheduledTaskIndices.length > 0) {
      console.log(`[GenerateScheduleAPI]   ⚠️ ${scheduleResult.unscheduledTaskIndices.length} tasks couldn't fit in available time`)
    }

    // ===== STEP 10: Create Task Records in Database =====
    console.log('[GenerateScheduleAPI] Step 10: Creating task records from scheduled assignments')

    // Map priority string to integer (high=1, medium=3, low=5)
    const priorityMap: Record<string, number> = {
      high: 1,
      medium: 3,
      low: 5,
    }

    /**
     * CRITICAL FIX: Create ONE Task record per ScheduledTaskAssignment
     * 
     * Previously, we created one Task per original task, which meant split tasks
     * only appeared on the first day. Now we create a separate Task record for
     * each scheduled block, so split tasks appear on multiple days.
     * 
     * For split tasks:
     * - Part 1: Gets "(Part 1)" appended to title
     * - Part 2: Gets "(Part 2)" appended to title
     * - All parts share the same description, success criteria, priority
     * - Each part has its own scheduledDate, startTime, endTime
     */
    const taskRecords = scheduleResult.scheduledTasks.map((scheduledTask) => {
      // Get the original task data
      const originalTask = tasks[scheduledTask.taskIndex]
      
      // Build the title - append part number if task was split
      let taskTitle = originalTask.title
      if (scheduledTask.partNumber !== undefined) {
        taskTitle = `${originalTask.title} (Part ${scheduledTask.partNumber})`
      }
      
      // Convert hours assigned to this block into minutes
      const durationMinutes = Math.round(scheduledTask.hoursAssigned * 60)
      
      return {
        userId: user.id,
        projectId: projectId,
        title: taskTitle,
        description: originalTask.description,
        successCriteria: convertSuccessCriteriaToJson(originalTask.success),
        estimatedDuration: durationMinutes, // Duration of THIS part, not the whole task
        priority: priorityMap[originalTask.priority] || 3,
        type: 'project',
        status: 'pending',
        // CRITICAL: Use the scheduled date/time from THIS specific block
        scheduledDate: scheduledTask.date,
        scheduledStartTime: scheduledTask.startTime,
        scheduledEndTime: scheduledTask.endTime,
      }
    })

    // Log scheduled tasks for debugging
    console.log('\n[GenerateScheduleAPI] 📅 TASK RECORDS TO CREATE:')
    taskRecords.forEach((record, index) => {
      const date = record.scheduledDate.toISOString().split('T')[0]
      const start = record.scheduledStartTime.toTimeString().substring(0, 5)
      const end = record.scheduledEndTime.toTimeString().substring(0, 5)
      const duration = `${(record.estimatedDuration / 60).toFixed(1)}h`
      console.log(`  ${index + 1}. ${date} ${start}-${end} (${duration}) - ${record.title}`)
    })

    // Bulk create all task records (including split parts)
    await prisma.task.createMany({ data: taskRecords })

    console.log(`[GenerateScheduleAPI] ✅ Created ${taskRecords.length} task records in database (including split parts)`)

    // ===== STEP 11: Return Success Response =====
    console.log('[GenerateScheduleAPI] Step 11: Preparing response')
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
