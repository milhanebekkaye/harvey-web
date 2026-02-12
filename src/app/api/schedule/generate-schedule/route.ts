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
  extractConstraints,
  generateTasks,
  parseTasks,
  convertSuccessCriteriaToJson,
} from '@/lib/schedule/schedule-generation'
import { updateProject } from '@/lib/projects/project-service'
import { updateUser } from '@/lib/users/user-service'
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

    // Full conversation for task generation
    const conversationTextFull = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')
    // Last 15 messages for extraction (cost constraint)
    const messagesForExtraction = messages.slice(-15)
    const conversationTextForExtraction = messagesForExtraction
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n')

    console.log('[GenerateScheduleAPI] Conversation has', messages.length, 'messages (extraction uses last', messagesForExtraction.length, ')')

    // ===== STEP 5: Extract Constraints =====
    console.log('[GenerateScheduleAPI] Step 5: 🔍 Extracting constraints from conversation...')

    let constraints: ExtractedConstraints
    try {
      constraints = await extractConstraints(conversationTextForExtraction)
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

    // ===== STEP 5.5: Save project allocations to contextData (no blocked_time); User life constraints to User =====
    const constraintsAny = constraints as unknown as Record<string, unknown>
    const contextDataSubset = {
      schedule_duration_weeks: constraints.schedule_duration_weeks,
      available_time: constraints.available_time,
      preferences: constraints.preferences,
      exclusions: constraints.exclusions,
      ...(constraintsAny.one_off_blocks != null && {
        one_off_blocks: constraintsAny.one_off_blocks,
      }),
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        contextData: contextDataSubset as unknown as Parameters<typeof prisma.project.update>[0]['data']['contextData'],
        updatedAt: new Date(),
      },
    })
    console.log('[GenerateScheduleAPI] ✅ Saved project contextData (available_time, preferences; no blocked_time)')

    // Project enrichment (only defined values; fail gracefully)
    const projectEnrichment: Record<string, unknown> = {}
    if (constraints.target_deadline != null && constraints.target_deadline !== '') {
      projectEnrichment.target_deadline = new Date(constraints.target_deadline)
    }
    if (constraints.skill_level != null && constraints.skill_level !== '') projectEnrichment.skill_level = constraints.skill_level
    if (constraints.tools_and_stack != null && constraints.tools_and_stack.length > 0) projectEnrichment.tools_and_stack = constraints.tools_and_stack
    if (constraints.project_type != null && constraints.project_type !== '') projectEnrichment.project_type = constraints.project_type
    if (constraints.weekly_hours_commitment != null) projectEnrichment.weekly_hours_commitment = constraints.weekly_hours_commitment
    if (constraints.motivation != null && constraints.motivation !== '') projectEnrichment.motivation = constraints.motivation
    if (constraints.phases != null) projectEnrichment.phases = constraints.phases
    // TODO: Before Feature 8 (Schedule Regeneration), change this to MERGE
    // existing projectNotes with new extraction results rather than overwriting.
    // Current behavior (overwrite) is safe only on first generation.
    if (constraints.project_notes != null && constraints.project_notes.length > 0) {
      projectEnrichment.projectNotes = constraints.project_notes
    }

    if (Object.keys(projectEnrichment).length > 0) {
      try {
        await updateProject(projectId, user.id, projectEnrichment as Parameters<typeof updateProject>[2])
        console.log('[GenerateScheduleAPI] ✅ Saved project enrichment')
      } catch (err) {
        console.error('[GenerateScheduleAPI] ⚠️ Project enrichment update failed (non-fatal):', err)
      }
    }

    // User: life constraints (workSchedule, commute) + enrichment (preferred_session_length, communication_style, userNotes)
    const userEnrichment: Record<string, unknown> = {}
    if (constraints.work_schedule != null && constraints.work_schedule.workDays?.length) {
      userEnrichment.workSchedule = constraints.work_schedule
    }
    if (constraints.commute != null && (constraints.commute.morning || constraints.commute.evening)) {
      userEnrichment.commute = constraints.commute
    }
    if (constraints.preferred_session_length != null) userEnrichment.preferred_session_length = constraints.preferred_session_length
    if (constraints.communication_style != null && constraints.communication_style !== '') userEnrichment.communication_style = constraints.communication_style
    if (constraints.user_notes != null && constraints.user_notes.length > 0) userEnrichment.userNotes = constraints.user_notes

    if (Object.keys(userEnrichment).length > 0) {
      try {
        await updateUser(user.id, userEnrichment as Parameters<typeof updateUser>[1])
        console.log('[GenerateScheduleAPI] ✅ Saved user (workSchedule, commute, enrichment)')
      } catch (err) {
        console.error('[GenerateScheduleAPI] ⚠️ User update failed (non-fatal):', err)
      }
    }

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
