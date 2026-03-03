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
 * 9. Schedule tasks to specific dates/times using Claude + validation + fallback
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
import { Prisma } from '@prisma/client'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { isRetryableAnthropicError } from '@/lib/ai/claude-client'
import {
  buildConstraintsFromProjectAndUser,
  generateTasks,
  parseTasks,
  convertSuccessCriteriaToJson,
  generateScheduleCoachingMessage,
  type ScheduleCoachingContext,
} from '@/lib/schedule/schedule-generation'
import { getProjectById } from '@/lib/projects/project-service'
import { getUserById } from '@/lib/users/user-service'
import {
  assignTasksWithClaude,
  calculateStartDate,
  type SchedulerOptions,
} from '@/lib/schedule/task-scheduler'
import { enforceSchedulingConstraints } from '@/lib/schedule/assignment-post-processor'
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

    // ===== STEP 5: Load constraints from DB only (no re-extraction) =====
    console.log('[GenerateScheduleAPI] Step 5: Loading constraints from DB (no re-extraction) ✅')
    // project from getProjectById is full Prisma Project (contextData, target_deadline, etc.)
    type ProjectForConstraints = Parameters<typeof buildConstraintsFromProjectAndUser>[0]
    const constraints = buildConstraintsFromProjectAndUser(project as ProjectForConstraints, dbUser)
    const windowsCount = Array.isArray(constraints.available_time) ? constraints.available_time.length : 0
    console.log(
      `[GenerateScheduleAPI] Loaded: energy_peak=${constraints.energy_peak ?? '—'}, skill_level=${constraints.skill_level ?? '—'}, weekly_hours=${constraints.weekly_hours_commitment ?? '—'}, windows=${windowsCount}`
    )

    // ===== STEP 5.5: Save contextData from built constraints (Settings and chat tools read available_time from here) =====
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

    const tasksResponse = await generateTasks(conversationTextFull, constraints, user.id)

    // ===== STEP 7: Parse Tasks =====
    console.log('[GenerateScheduleAPI] Step 7: Parsing tasks')
    console.log('[GenerateScheduleAPI] Raw Claude response length:', tasksResponse.length)
    console.log('[GenerateScheduleAPI] Raw Claude response (first 800 chars):', tasksResponse.substring(0, 800))

    const { tasks, milestones } = parseTasks(tasksResponse)

    console.log(`[GenerateScheduleAPI] ✅ Generated ${tasks.length} tasks`)

    // Log each task in detail (same format as before)
    console.log('\n[GenerateScheduleAPI] 📋 GENERATED TASKS:')
    if (tasks.length === 0) {
      console.log('[GenerateScheduleAPI] ⚠️ No tasks parsed. Check [ScheduleGeneration] parseTasks logs above for block split and title extraction.')
      console.log('[GenerateScheduleAPI] Claude response (first 1000 chars) for format check:', tasksResponse.substring(0, 1000))
    } else {
      tasks.forEach((task, index) => {
        console.log(`\n[GenerateScheduleAPI] Task ${index + 1}: ${task.title}`)
        console.log(`  Hours: ${task.hours}`)
        console.log(`  Priority: ${task.priority}`)
        console.log(`  Success: ${task.success}`)
        console.log(`  Description: ${task.description ? task.description.substring(0, 100) + (task.description.length > 100 ? '...' : '') : '(none)'}`)
        console.log(`  energy_required: ${task.energy_required ?? '—'}, preferred_slot: ${task.preferred_slot ?? '—'}`)
      })
    }

    if (milestones) {
      console.log('\n[GenerateScheduleAPI] 📍 MILESTONES:')
      console.log(milestones)
    }

    // ===== STEP 8: Schedule Tasks =====
    console.log('[GenerateScheduleAPI] Step 8: 📅 Scheduling tasks to specific dates/times...')

    // Calculate start date: prefer project.schedule_start_date when set; else from constraints (tomorrow/next Monday)
    const userTimezone = dbUser?.timezone || 'UTC'
    console.log(`[GenerateScheduleAPI] User timezone: ${userTimezone}`)

    let startDate: Date
    const projectStart = (project as { schedule_start_date?: Date | null }).schedule_start_date ?? null
    if (projectStart != null) {
      const d = new Date(projectStart)
      if (!Number.isNaN(d.getTime())) {
        startDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0))
        console.log(`[GenerateScheduleAPI] Using project schedule_start_date: ${startDate.toISOString().split('T')[0]}`)
      } else {
        startDate = calculateStartDate(constraints, userTimezone)
      }
    } else {
      startDate = calculateStartDate(constraints, userTimezone)
    }
    const durationWeeks = constraints.schedule_duration_weeks || 2

    console.log(`[GenerateScheduleAPI] Start date: ${startDate.toISOString().split('T')[0]}`)
    console.log(`[GenerateScheduleAPI] Duration: ${durationWeeks} weeks`)

    // Run Claude slot assignment with hard-constraint validation and deterministic fallback.
    // Slot times are interpreted in user TZ and stored as UTC datetimes.
    const userBlocked =
      constraints.work_schedule || constraints.commute?.morning || constraints.commute?.evening
        ? { workSchedule: constraints.work_schedule ?? null, commute: constraints.commute ?? null }
        : null

    const notesText = [
      ...(constraints.user_notes ?? []).map((n) => n.note),
      ...(constraints.project_notes ?? []).map((n) => n.note),
    ].join(' ')
    const rampUpDay1 = /losing motivation|lacking motivation|low motivation/i.test(notesText)

    const schedulerOptions: SchedulerOptions = {
      energyPeak: constraints.energy_peak ?? dbUser?.energy_peak ?? null,
      preferredSessionLength: constraints.preferred_session_length ?? null,
      userNotes: constraints.user_notes ?? null,
      projectNotes: constraints.project_notes ?? null,
      projectGoals: project.goals ?? null,
      projectMotivation: project.motivation ?? null,
      phases: constraints.phases ?? null,
      rampUpDay1,
    }
    console.log(
      '[GenerateScheduleAPI] SchedulerOptions:',
      JSON.stringify(
        {
          energyPeak: schedulerOptions.energyPeak,
          preferredSessionLength: schedulerOptions.preferredSessionLength,
          rampUpDay1: schedulerOptions.rampUpDay1,
          hasUserNotes: (schedulerOptions.userNotes?.length ?? 0) > 0,
          hasProjectNotes: (schedulerOptions.projectNotes?.length ?? 0) > 0,
          phasesActivePhaseId: schedulerOptions.phases?.active_phase_id,
        },
        null,
        2
      )
    )

    const scheduleResult = await assignTasksWithClaude(
      tasks,
      constraints,
      startDate,
      durationWeeks,
      userTimezone,
      userBlocked,
      schedulerOptions,
      user.id
    )

    console.log(`[GenerateScheduleAPI] ✅ Scheduled ${scheduleResult.scheduledTasks.length} task blocks`)
    console.log(`[GenerateScheduleAPI]   Total hours scheduled: ${scheduleResult.totalHoursScheduled.toFixed(1)}`)
    if (scheduleResult.unscheduledTaskIndices.length > 0) {
      console.log(`[GenerateScheduleAPI]   ⚠️ ${scheduleResult.unscheduledTaskIndices.length} tasks couldn't fit in available time`)
    }

    // Post-process: enforce part consecutiveness and dependency ordering before DB write
    const scheduledTasksToPersist = enforceSchedulingConstraints(
      scheduleResult.scheduledTasks,
      tasks,
      userTimezone
    )

    // Assign position (per-day, 1-based) for deterministic list order. Group by date; within each day order is already date → startTime.
    const positionByIndex = new Map<number, number>()
    const dateToIndices = new Map<string, number[]>()
    for (let i = 0; i < scheduledTasksToPersist.length; i++) {
      const dateStr = scheduledTasksToPersist[i].date.toISOString().split('T')[0]
      if (!dateToIndices.has(dateStr)) dateToIndices.set(dateStr, [])
      dateToIndices.get(dateStr)!.push(i)
    }
    for (const indices of dateToIndices.values()) {
      indices.forEach((idx, order) => positionByIndex.set(idx, order + 1))
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
    const taskRecords = scheduledTasksToPersist.map((scheduledTask, index) => {
      const originalTask = tasks[scheduledTask.taskIndex]
      let taskTitle = originalTask.title
      if (scheduledTask.partNumber !== undefined) {
        taskTitle = `${originalTask.title} (Part ${scheduledTask.partNumber})`
      }
      const durationMinutes = Math.round(scheduledTask.hoursAssigned * 60)
      const isFlexible = scheduledTask.isFlexible === true
      const position = positionByIndex.get(index) ?? null
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
          scheduledStartTime: isFlexible ? null : scheduledTask.startTime,
          scheduledEndTime: isFlexible ? null : scheduledTask.endTime,
          window_start: isFlexible ? (scheduledTask.windowStart ?? null) : null,
          window_end: isFlexible ? (scheduledTask.windowEnd ?? null) : null,
          is_flexible: isFlexible,
          position,
          label: normalizeTaskLabel(originalTask.label),
          energy_required: originalTask.energy_required ?? null,
          preferred_slot: originalTask.preferred_slot ?? null,
        },
      }
    })

    // Log each task record with energy_required, preferred_slot, is_flexible
    console.log('[GenerateScheduleAPI] Task records (energy_required, preferred_slot, is_flexible):')
    taskRecords.forEach((record, index) => {
      const d = record.data
      const date = d.scheduledDate.toISOString().split('T')[0]
      const timeStr =
        d.is_flexible && d.window_start != null && d.window_end != null
          ? `During ${d.window_start}-${d.window_end} (flexible)`
          : d.scheduledStartTime != null && d.scheduledEndTime != null
            ? `${d.scheduledStartTime.toTimeString().substring(0, 5)}-${d.scheduledEndTime.toTimeString().substring(0, 5)}`
            : '—'
      const duration = `${(d.estimatedDuration / 60).toFixed(1)}h`
      console.log(
        `[GenerateScheduleAPI] TaskRecord #${index + 1}: ${d.title} | ${date} ${timeStr} (${duration}) | energy_required=${d.energy_required ?? '—'} preferred_slot=${d.preferred_slot ?? '—'} is_flexible=${d.is_flexible ?? false}`
      )
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

    /** For dependency validation: get earliest start (ms) for "this" task and latest end (ms) for a dependency. */
    function getEarliestStartMs(data: (typeof taskRecords)[0]['data']): number {
      if (data.scheduledStartTime != null) return data.scheduledStartTime.getTime()
      if (data.is_flexible && data.window_start) {
        const [h, m] = data.window_start.split(':').map((x) => parseInt(x, 10) || 0)
        const d = data.scheduledDate
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0, 0)
      }
      return data.scheduledDate.getTime()
    }
    function getLatestEndMs(data: (typeof taskRecords)[0]['data']): number {
      if (data.scheduledEndTime != null) return data.scheduledEndTime.getTime()
      if (data.scheduledStartTime != null) return data.scheduledStartTime.getTime() + 60 * 60 * 1000
      if (data.is_flexible && data.window_end) {
        const [h, m] = data.window_end.split(':').map((x) => parseInt(x, 10) || 0)
        const d = data.scheduledDate
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0, 0)
      }
      return data.scheduledDate.getTime() + 60 * 60 * 1000
    }

    // Resolve depends_on (1-based indices) to task IDs; only keep dependencies that end at or before this task starts
    for (let i = 0; i < taskRecords.length; i++) {
      const taskIndex = taskRecords[i].taskIndex
      const originalTask = tasks[taskIndex]
      const depIndices = originalTask.depends_on || []
      const dependantIds = depIndices.flatMap((oneBased) => taskIndexToIds[oneBased - 1] ?? [])
      const uniqueIds = [...new Set(dependantIds)]
      const thisData = taskRecords[i].data
      const thisEarliestStartMs = getEarliestStartMs(thisData)
      const thisTaskId = createdIds[i]
      const thisTitle = thisData.title
      const thisDateStr = thisData.scheduledDate.toISOString().split('T')[0]

      const validIds: string[] = []
      for (const depId of uniqueIds) {
        const depIdx = createdIds.indexOf(depId)
        if (depIdx < 0) continue
        const depRecord = taskRecords[depIdx]
        const depData = depRecord.data
        const depDateStr = depData.scheduledDate.toISOString().split('T')[0]
        const bothFlexibleSameDay =
          thisData.is_flexible === true &&
          depData.is_flexible === true &&
          thisDateStr === depDateStr

        let valid: boolean
        if (bothFlexibleSameDay) {
          // Same-day flexible tasks share window boundaries; use position order. If either position is null, don't drop.
          valid =
            depData.position == null ||
            thisData.position == null ||
            depData.position < thisData.position
        } else {
          const depLatestEndMs = getLatestEndMs(depData)
          valid = depLatestEndMs <= thisEarliestStartMs
        }

        if (valid) {
          validIds.push(depId)
        } else {
          const depTitle = depData.title ?? depId
          const thisTimeStr =
            thisData.is_flexible && thisData.window_start != null && thisData.window_end != null
              ? `flexible ${thisData.window_start}-${thisData.window_end}`
              : thisData.scheduledStartTime?.toTimeString().slice(0, 5) ?? 'flexible'
          const depTimeStr =
            depData.is_flexible && depData.window_start != null && depData.window_end != null
              ? `flexible ${depData.window_start}-${depData.window_end}`
              : depData.scheduledStartTime?.toTimeString().slice(0, 5) ?? 'flexible'
          console.warn(
            `[GenerateScheduleAPI] ⚠️ DEPENDS_ON validation: task "${thisTitle}" (${thisTaskId}) depends on "${depTitle}" (${depId}) but that task is scheduled AFTER this one. Dropping invalid dependency. This task: ${thisData.scheduledDate.toISOString().split('T')[0]} ${thisTimeStr}; dependency: ${depData.scheduledDate.toISOString().split('T')[0]} ${depTimeStr}.`
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

    // ===== Persist milestones and schedule_duration_days on project =====
    const milestonesForDb: Array<{ title: string }> = []
    if (milestones && milestones.trim()) {
      const lines = milestones.trim().split(/\r?\n/)
      const skipPatterns = /^(this represents|next period|~?\d+% of|full project)/i
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.length > 300) continue
        if (skipPatterns.test(trimmed)) continue
        const numberedDot = trimmed.match(/^\d+\.\s*(.+)$/)
        const numberedParen = trimmed.match(/^\d+\)\s*(.+)$/)
        const bullet = trimmed.match(/^[-*•]\s*(.+)$/)
        const title = (numberedDot?.[1] ?? numberedParen?.[1] ?? bullet?.[1] ?? trimmed).trim()
        if (title.length >= 3 && title.length <= 250) milestonesForDb.push({ title })
      }
    }
    let scheduleDurationDays: number | null = null
    if (taskRecords.length > 0) {
      const dates = taskRecords.map((r) => r.data.scheduledDate)
      const first = new Date(Math.min(...dates.map((d) => d.getTime())))
      const last = new Date(Math.max(...dates.map((d) => d.getTime())))
      const msPerDay = 24 * 60 * 60 * 1000
      scheduleDurationDays = Math.ceil((last.getTime() - first.getTime()) / msPerDay) + 1
    }
    await prisma.project.update({
      where: { id: projectId },
      data: {
        milestones: milestonesForDb.length > 0 ? (milestonesForDb as Prisma.InputJsonValue) : null,
        // TODO: move to a Schedule/Batch model when Feature 8 (multi-generation) ships
        schedule_duration_days: scheduleDurationDays,
        updatedAt: new Date(),
      } as Prisma.ProjectUpdateInput,
    })
    if (milestonesForDb.length > 0 || scheduleDurationDays != null) {
      console.log('[GenerateScheduleAPI] ✅ Saved project milestones and schedule_duration_days')
    }

    // ===== STEP 9.5: Create project discussion with Harvey coaching message (Session 2) =====
    const fallbackGreeting =
      "Here's your schedule! Take a look and let me know if anything needs adjusting — you can ask me to move tasks, add new ones, or change your availability anytime."

    const slotTypeCounts: Record<string, number> = {
      peak_energy: 0,
      normal: 0,
      flexible: 0,
      emergency: 0,
    }
    for (const st of scheduledTasksToPersist) {
      const t = st.slotType ?? 'normal'
      if (t in slotTypeCounts) slotTypeCounts[t] += 1
    }
    const tasksSplit = new Set(
      scheduledTasksToPersist.filter((st) => st.partNumber != null && st.partNumber > 1).map((st) => st.taskIndex)
    ).size

    // Recompute weekend hours from corrected list so coaching message reflects final schedule
    const weekendHoursUsedFromCorrected = scheduledTasksToPersist.reduce((sum, st) => {
      const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, weekday: 'short' }).format(st.date)
      if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') return sum + st.hoursAssigned
      return sum
    }, 0)

    const coachingContext: ScheduleCoachingContext = {
      totalTasksScheduled: scheduledTasksToPersist.length,
      totalHoursScheduled: scheduleResult.totalHoursScheduled,
      slotTypeCounts,
      weekendHoursUsed: weekendHoursUsedFromCorrected,
      weekendHoursAvailable: scheduleResult.weekendHoursAvailable ?? 0,
      tasksSplit,
      startDate: startDate.toISOString().split('T')[0],
      durationWeeks,
      energy_peak: constraints.energy_peak ?? null,
      preferred_session_length: constraints.preferred_session_length ?? null,
      projectTitle: project.title ?? 'Project',
      target_deadline: project.target_deadline
        ? typeof project.target_deadline === 'string'
          ? project.target_deadline
          : project.target_deadline.toISOString()
        : null,
      phasesSummary:
        constraints.phases?.phases?.length &&
        constraints.phases.active_phase_id != null
          ? `Phase ${constraints.phases.active_phase_id}: ${constraints.phases.phases[constraints.phases.active_phase_id - 1]?.title ?? 'active'}`
          : undefined,
    }

    let coachingContent: string
    const COACHING_TIMEOUT_MS = 15_000
    try {
      coachingContent = await Promise.race([
        generateScheduleCoachingMessage(coachingContext, user.id),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Coaching message timeout')), COACHING_TIMEOUT_MS)
        ),
      ])
    } catch (err) {
      console.warn('[GenerateScheduleAPI] Coaching message generation failed, using fallback:', err)
      coachingContent = fallbackGreeting
    }

    const harveyMessage: StoredMessage = {
      role: 'assistant',
      content: coachingContent,
      timestamp: new Date().toISOString(),
    }
    const existingProjectDiscussion = await getProjectDiscussion(projectId, user.id)
    if (!existingProjectDiscussion) {
      const createResult = await createDiscussion({
        projectId,
        userId: user.id,
        type: 'project',
        initialMessage: harveyMessage,
      })
      if (createResult.success) {
        console.log('[GenerateScheduleAPI] ✅ Created project discussion with Harvey coaching message')
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

    // Retries exhausted for overload/rate limit → user-friendly message
    if (isRetryableAnthropicError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'The AI service is temporarily overloaded. Please try again in a minute.',
          code: 'AI_OVERLOADED',
        },
        { status: 503 }
      )
    }

    // Other Claude/API errors
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
