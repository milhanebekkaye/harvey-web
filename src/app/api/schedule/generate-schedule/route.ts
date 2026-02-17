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
 * 3. Load Discussion and full Project + User from database
 * 4. Convert messages to conversation text
 * 5. Build constraints from last extracted data (Project + User) — no second extraction
 * 6. Generate tasks using Claude
 * 7. Parse tasks
 * 8. Save contextData from built constraints (so Settings/tools have available_time)
 * 9. Schedule tasks to specific dates/times using algorithm
 * 10. Create Task records in database with scheduled dates
 * 10.5. Append Harvey's post-schedule message to Discussion (so user sees it in chat sidebar)
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
import type { Prisma } from '@prisma/client'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import {
  buildConstraintsFromProjectAndUser,
  generateTasks,
  parseTasks,
  convertSuccessCriteriaToJson,
} from '@/lib/schedule/schedule-generation'
import { getProjectById } from '@/lib/projects/project-service'
import { getUserById } from '@/lib/users/user-service'
import {
  assignTasksToSchedule,
  calculateStartDate,
  getTaskScheduleData,
} from '@/lib/schedule/task-scheduler'
import { normalizeTaskLabel } from '@/types/task.types'
import {
  createDiscussion,
  getOnboardingDiscussion,
  getProjectDiscussion,
} from '@/lib/discussions/discussion-service'
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

    // ===== STEP 3: Load Onboarding Discussion from Database =====
    console.log('[GenerateScheduleAPI] Step 3: Loading onboarding discussion')

    const discussion = await getOnboardingDiscussion(projectId, user.id)

    if (!discussion) {
      console.error('[GenerateScheduleAPI] Onboarding discussion not found for project')
      return NextResponse.json(
        { success: false, error: 'Discussion not found', code: 'DISCUSSION_NOT_FOUND' },
        { status: 404 }
      )
    }

    console.log('[GenerateScheduleAPI] Onboarding discussion found:', discussion.id)

    // ===== STEP 3.5: Load full Project and User (last extracted data from onboarding) =====
    const project = await getProjectById(projectId, user.id)
    const dbUser = await getUserById(user.id)
    if (!project) {
      console.error('[GenerateScheduleAPI] Project not found or not owned by user')
      return NextResponse.json(
        { success: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' },
        { status: 404 }
      )
    }
    if (!dbUser) {
      console.error('[GenerateScheduleAPI] User record not found')
      return NextResponse.json(
        { success: false, error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    // ===== STEP 3.6: Check if tasks already exist for this project =====
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

    // Full conversation for task generation
    const conversationTextFull = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')

    console.log('[GenerateScheduleAPI] Conversation has', messages.length, 'messages')

    // ===== STEP 5: Build constraints from last extracted data (Project + User) =====
    console.log('[GenerateScheduleAPI] Step 5: Building constraints from DB (last onboarding extraction)...')
    // project from getProjectById is full Prisma Project (contextData, target_deadline, etc.)
    type ProjectForConstraints = Parameters<typeof buildConstraintsFromProjectAndUser>[0]
    const constraints = buildConstraintsFromProjectAndUser(project as ProjectForConstraints, dbUser)
    console.log('[GenerateScheduleAPI] ✅ Built constraints:', JSON.stringify(constraints, null, 2))

    // ===== STEP 5.5: Save contextData from built constraints (Settings and chat tools read available_time from here) =====
    const constraintsAny = constraints as unknown as Record<string, unknown>
    const existingContext = (project.contextData ?? {}) as Record<string, unknown>
    const contextDataSubset = {
      schedule_duration_weeks: constraints.schedule_duration_weeks,
      available_time: constraints.available_time,
      preferences: constraints.preferences,
      exclusions: constraints.exclusions,
      ...(existingContext.one_off_blocks != null && { one_off_blocks: existingContext.one_off_blocks }),
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        contextData: contextDataSubset as unknown as Parameters<typeof prisma.project.update>[0]['data']['contextData'],
        updatedAt: new Date(),
      },
    })
    console.log('[GenerateScheduleAPI] ✅ Saved project contextData (available_time, preferences; no blocked_time)')
    // Project/User enrichment is not rewritten here — it already comes from the last onboarding extraction.

    // ===== STEP 6: Generate Tasks =====
    console.log('[GenerateScheduleAPI] Step 6: 🎯 Generating tasks...')

    const tasksResponse = await generateTasks(conversationTextFull, constraints)

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

    // ===== STEP 8: Schedule Tasks =====
    console.log('[GenerateScheduleAPI] Step 8: 📅 Scheduling tasks to specific dates/times...')

    // Calculate start date based on user preference (or default to tomorrow/next Monday)
    // Use timezone from the user we already loaded (dbUser from Step 3.5)
    const userTimezone = dbUser?.timezone || 'UTC'
    console.log(`[GenerateScheduleAPI] User timezone: ${userTimezone}`)

    // Calculate start date in user's timezone
    const startDate = calculateStartDate(constraints, userTimezone)
    const durationWeeks = constraints.schedule_duration_weeks || 2

    console.log(`[GenerateScheduleAPI] Start date: ${startDate.toISOString().split('T')[0]}`)
    console.log(`[GenerateScheduleAPI] Duration: ${durationWeeks} weeks`)

    // Run the scheduling algorithm (slot times in user TZ, stored as UTC).
    // Blocked time is derived from User workSchedule/commute and subtracted from available_time.
    const userBlocked =
      constraints.work_schedule || constraints.commute?.morning || constraints.commute?.evening
        ? { workSchedule: constraints.work_schedule ?? null, commute: constraints.commute ?? null }
        : null
    const scheduleResult = assignTasksToSchedule(
      tasks,
      constraints,
      startDate,
      durationWeeks,
      userTimezone,
      userBlocked
    )

    console.log(`[GenerateScheduleAPI] ✅ Scheduled ${scheduleResult.scheduledTasks.length} task blocks`)
    console.log(`[GenerateScheduleAPI]   Total hours scheduled: ${scheduleResult.totalHoursScheduled.toFixed(1)}`)
    if (scheduleResult.unscheduledTaskIndices.length > 0) {
      console.log(`[GenerateScheduleAPI]   ⚠️ ${scheduleResult.unscheduledTaskIndices.length} tasks couldn't fit in available time`)
    }

    // ===== STEP 9: Create Task Records in Database =====
    console.log('[GenerateScheduleAPI] Step 9: Creating task records from scheduled assignments')

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
     *
     * Task dependencies: We create tasks one-by-one to get IDs, then set
     * depends_on (array of task IDs this task depends on) in a second pass.
     */
    const taskRecords = scheduleResult.scheduledTasks.map((scheduledTask) => {
      const originalTask = tasks[scheduledTask.taskIndex]
      let taskTitle = originalTask.title
      if (scheduledTask.partNumber !== undefined) {
        taskTitle = `${originalTask.title} (Part ${scheduledTask.partNumber})`
      }
      const durationMinutes = Math.round(scheduledTask.hoursAssigned * 60)
      return {
        taskIndex: scheduledTask.taskIndex,
        data: {
          userId: user.id,
          projectId: projectId,
          title: taskTitle,
          description: originalTask.description,
          successCriteria: convertSuccessCriteriaToJson(originalTask.success),
          estimatedDuration: durationMinutes,
          priority: priorityMap[originalTask.priority] || 3,
          type: 'project',
          status: 'pending',
          scheduledDate: scheduledTask.date,
          scheduledStartTime: scheduledTask.startTime,
          scheduledEndTime: scheduledTask.endTime,
          label: normalizeTaskLabel(originalTask.label),
        },
      }
    })

    // Log scheduled tasks for debugging
    console.log('\n[GenerateScheduleAPI] 📅 TASK RECORDS TO CREATE:')
    taskRecords.forEach((record, index) => {
      const d = record.data
      const date = d.scheduledDate.toISOString().split('T')[0]
      const start = d.scheduledStartTime.toTimeString().substring(0, 5)
      const end = d.scheduledEndTime.toTimeString().substring(0, 5)
      const duration = `${(d.estimatedDuration / 60).toFixed(1)}h`
      console.log(`  ${index + 1}. ${date} ${start}-${end} (${duration}) - ${d.title}`)
    })

    // Create tasks one-by-one to get IDs, then set depends_on
    const createdIds: string[] = []
    const taskIndexToIds: Record<number, string[]> = {}

    for (const { taskIndex, data } of taskRecords) {
      const created = await prisma.task.create({ data })
      createdIds.push(created.id)
      if (!taskIndexToIds[taskIndex]) taskIndexToIds[taskIndex] = []
      taskIndexToIds[taskIndex].push(created.id)
    }

    // Map: task id → scheduled start time (ms) for validation
    const idToScheduledTime = new Map<string, number>()
    for (let j = 0; j < taskRecords.length; j++) {
      idToScheduledTime.set(createdIds[j], taskRecords[j].data.scheduledStartTime.getTime())
    }

    // Resolve depends_on (1-based indices) to task IDs; only keep dependencies scheduled before this task
    for (let i = 0; i < taskRecords.length; i++) {
      const taskIndex = taskRecords[i].taskIndex
      const originalTask = tasks[taskIndex]
      const depIndices = originalTask.depends_on || []
      const dependantIds = depIndices.flatMap((oneBased) => taskIndexToIds[oneBased - 1] ?? [])
      const uniqueIds = [...new Set(dependantIds)]
      const thisTaskTime = taskRecords[i].data.scheduledStartTime.getTime()
      const thisTaskId = createdIds[i]
      const thisTitle = taskRecords[i].data.title

      // Only allow dependencies that are scheduled at or before this task (never future tasks)
      const validIds: string[] = []
      for (const depId of uniqueIds) {
        const depTime = idToScheduledTime.get(depId)
        if (depTime === undefined) continue
        if (depTime <= thisTaskTime) {
          validIds.push(depId)
        } else {
          const depRecord = taskRecords[createdIds.indexOf(depId)]
          const depTitle = depRecord?.data.title ?? depId
          console.warn(
            `[GenerateScheduleAPI] ⚠️ DEPENDS_ON validation: task "${thisTitle}" (${thisTaskId}) depends on "${depTitle}" (${depId}) but that task is scheduled AFTER this one. Dropping invalid dependency. This task scheduled: ${taskRecords[i].data.scheduledDate.toISOString().split('T')[0]} ${taskRecords[i].data.scheduledStartTime.toTimeString().slice(0, 5)}; dependency scheduled: ${depRecord?.data.scheduledDate?.toISOString().split('T')[0]} ${depRecord?.data.scheduledStartTime?.toTimeString().slice(0, 5)}.`
          )
        }
      }
      if (validIds.length > 0) {
        await prisma.task.update({
          where: { id: thisTaskId },
          data: { depends_on: validIds } as Prisma.TaskUpdateInput,
        })
      }
    }

    console.log(`[GenerateScheduleAPI] ✅ Created ${taskRecords.length} task records in database (including split parts)`)

    // ===== STEP 9.5: Create project discussion with Harvey greeting =====
    const harveyGreeting: StoredMessage = {
      role: 'assistant',
      content:
        "Here's your schedule! Take a look and let me know if anything needs adjusting — you can ask me to move tasks, add new ones, or change your availability anytime.",
      timestamp: new Date().toISOString(),
    }
    const existingProjectDiscussion = await getProjectDiscussion(projectId, user.id)
    if (!existingProjectDiscussion) {
      const createResult = await createDiscussion({
        projectId,
        userId: user.id,
        type: 'project',
        initialMessage: harveyGreeting,
      })
      if (createResult.success) {
        console.log('[GenerateScheduleAPI] ✅ Created project discussion with Harvey greeting')
      } else {
        console.error('[GenerateScheduleAPI] ⚠️ Failed to create project discussion:', createResult.error?.message)
      }
    } else {
      console.log('[GenerateScheduleAPI] Project discussion already exists, skipping creation')
    }

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
