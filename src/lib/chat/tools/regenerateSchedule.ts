/**
 * Tool: regenerate_schedule
 *
 * Rebuild the schedule for remaining tasks.
 * Two modes:
 * - "remaining": Completed tasks are locked. Pending/skipped tasks get
 *   reassigned to available slots using a greedy algorithm.
 * - "full_rebuild": Starts from scratch using the original project
 *   conversation and schedule generation pipeline.
 */

import { prisma } from '../../db/prisma'
import type { Prisma } from '@prisma/client'
import type { RegenerateScheduleResult, ContextData } from '../types'
import type { Task } from '@prisma/client'
import {
  parseTimeToHours,
  formatHoursToTime,
  getDayName,
  addDays,
  getEffectiveAvailableTimeBlocks,
} from '../../schedule/task-scheduler'
import {
  extractConstraints,
  generateTasks,
  parseTasks,
  convertSuccessCriteriaToJson,
  calculateTotalAvailableHours,
  buildContextDataFromProjectAndUser,
  buildConstraintsFromProjectAndUser,
} from '../../schedule/schedule-generation'
import { assignTasksToSchedule, calculateStartDate, getTaskScheduleData } from '../../schedule/task-scheduler'
import { localTimeInTimezoneToUTC } from '../../timezone'

interface RegenerateScheduleParams {
  scope: 'remaining' | 'full_rebuild'
  focus_area?: string
  notes?: string
}

/**
 * Sort tasks so dependencies are always before dependents.
 * Tasks with depends_on (task IDs) are scheduled after those they depend on.
 * Then by priority, then by original scheduled date.
 */
function sortTasksByDependenciesThenPriority(tasks: Task[]): Task[] {
  const idToIndex = new Map<string, number>()
  tasks.forEach((t, i) => idToIndex.set(t.id, i))
  const n = tasks.length
  const inDegree = new Array(n).fill(0)
  const dependents: number[][] = Array.from({ length: n }, () => [])

  for (let j = 0; j < n; j++) {
    const deps = (tasks[j] as unknown as { depends_on?: string[] }).depends_on ?? []
    for (const depId of deps) {
      const i = idToIndex.get(depId)
      if (i !== undefined && i !== j) {
        dependents[i].push(j)
        inDegree[j]++
      }
    }
  }

  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i)
  }
  const order: number[] = []
  while (queue.length > 0) {
    const i = queue.shift()!
    order.push(i)
    for (const j of dependents[i]) {
      inDegree[j]--
      if (inDegree[j] === 0) queue.push(j)
    }
  }
  const seen = new Set(order)
  const remaining = tasks.map((_, i) => i).filter((i) => !seen.has(i))
  if (remaining.length > 0) {
    console.warn(
      `[regenerateSchedule] Dependency order: ${remaining.length} task(s) have cycles or invalid depends_on; appended at end. Indices: ${remaining.join(', ')}`
    )
    for (const i of remaining) order.push(i)
  }

  const ordered = order.map((i) => tasks[i])
  return ordered.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const dateA = a.scheduledDate?.getTime() || Infinity
    const dateB = b.scheduledDate?.getTime() || Infinity
    return dateA - dateB
  })
}

/**
 * Greedy slot-finding for rescheduling.
 *
 * Sorts tasks by dependency order (dependencies first), then priority, then date.
 * Assigns each to the earliest available slot that fits, so dependents never run before dependencies.
 */
function greedyReschedule(
  tasks: Task[],
  contextData: ContextData,
  userTimezone: string
): Array<{ taskId: string; date: Date; startTime: Date; endTime: Date }> {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)

  const results: Array<{ taskId: string; date: Date; startTime: Date; endTime: Date }> = []
  const occupied: Array<{ dateStr: string; startHours: number; endHours: number }> = []

  const sorted = sortTasksByDependenciesThenPriority(tasks)

  for (const task of sorted) {
    const durationHours = task.estimatedDuration / 60
    let assigned = false

    // Search up to 21 days ahead
    for (let dayOffset = 0; dayOffset < 21 && !assigned; dayOffset++) {
      const currentDate = addDays(now, dayOffset)
      const dayName = getDayName(currentDate)
      const dateStr = currentDate.toISOString().split('T')[0]

      // Check one-off blocks
      const isBlocked = contextData.one_off_blocks?.some(
        (b) => b.date === dateStr && b.all_day
      )
      if (isBlocked) continue

      // Get available slots for this day
      const daySlots = (contextData.available_time || []).filter(
        (slot) => slot.day.toLowerCase() === dayName
      )

      for (const slot of daySlots) {
        const slotStart = parseTimeToHours(slot.start)
        const slotEnd = parseTimeToHours(slot.end)
        const adjustedEnd = slotEnd > slotStart ? slotEnd : slotEnd + 24

        // Get occupied intervals for this date
        const dayOccupied = occupied
          .filter((o) => o.dateStr === dateStr)
          .sort((a, b) => a.startHours - b.startHours)

        // Also add one-off non-all-day blocks
        const dayOneOffs = (contextData.one_off_blocks || [])
          .filter((b) => b.date === dateStr && !b.all_day && b.start_time && b.end_time)
          .map((b) => ({ startHours: parseTimeToHours(b.start_time!), endHours: parseTimeToHours(b.end_time!) }))

        const allOccupied = [
          ...dayOccupied.map((o) => ({ startHours: o.startHours, endHours: o.endHours })),
          ...dayOneOffs,
        ].sort((a, b) => a.startHours - b.startHours)

        let searchStart = slotStart
        for (const occ of allOccupied) {
          if (occ.startHours >= adjustedEnd) break
          if (occ.startHours - searchStart >= durationHours) {
            // Found a gap: build UTC from user-local date/time
            const sH = Math.floor(searchStart)
            const sM = Math.round((searchStart - sH) * 60)
            const startTime = localTimeInTimezoneToUTC(dateStr, sH, sM, userTimezone)
            const endTime = new Date(startTime.getTime() + task.estimatedDuration * 60 * 1000)
            results.push({ taskId: task.id, date: new Date(currentDate), startTime, endTime })
            occupied.push({ dateStr, startHours: searchStart, endHours: searchStart + durationHours })
            assigned = true
            break
          }
          searchStart = Math.max(searchStart, occ.endHours)
        }

        if (!assigned && adjustedEnd - searchStart >= durationHours) {
          const sH = Math.floor(searchStart)
          const sM = Math.round((searchStart - sH) * 60)
          const startTime = localTimeInTimezoneToUTC(dateStr, sH, sM, userTimezone)
          const endTime = new Date(startTime.getTime() + task.estimatedDuration * 60 * 1000)
          results.push({ taskId: task.id, date: new Date(currentDate), startTime, endTime })
          occupied.push({ dateStr, startHours: searchStart, endHours: searchStart + durationHours })
          assigned = true
        }

        if (assigned) break
      }
    }
  }

  return results
}

/**
 * Execute the regenerate_schedule tool.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Result with rescheduled task count
 */
export async function executeRegenerateSchedule(
  params: RegenerateScheduleParams,
  projectId: string,
  userId: string
): Promise<RegenerateScheduleResult> {
  try {
    const { scope } = params

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { tasks: true, discussions: true },
    })

    if (!project) {
      return { success: false, message: 'Project not found.' }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const userTimezone = user?.timezone || 'Europe/Paris'
    const rawContext = user
      ? buildContextDataFromProjectAndUser(project, user)
      : ({ available_time: [], preferences: {} } as ContextData)
    const userBlocked = user
      ? {
          workSchedule: (user as { workSchedule?: import('@/types/api.types').WorkScheduleShape | null }).workSchedule ?? null,
          commute: (user as { commute?: import('@/types/api.types').CommuteShape | null }).commute ?? null,
        }
      : null
    const effectiveAvailable = getEffectiveAvailableTimeBlocks(
      rawContext.available_time || [],
      userBlocked
    )
    const contextData: ContextData = {
      ...rawContext,
      available_time: effectiveAvailable.length > 0 ? effectiveAvailable : (rawContext.available_time || []),
    }

    // Increment generation count
    const newGenCount = ((project as Record<string, unknown>).generationCount as number || 1) + 1
    const newBatch = Math.max(...project.tasks.map((t) => (t as unknown as { batchNumber: number }).batchNumber ?? 1), 1) + 1

    if (scope === 'remaining') {
      // ===== REMAINING: Greedy reschedule of pending/skipped tasks =====

      const completedTasks = project.tasks.filter((t) => t.status === 'completed')
      const toReschedule = project.tasks.filter(
        (t) => t.status === 'pending' || t.status === 'skipped' || t.status === 'in_progress'
      )

      if (toReschedule.length === 0) {
        return { success: true, message: 'No tasks to reschedule — all tasks are completed!', rescheduled_count: 0, locked_count: completedTasks.length }
      }

      // Capture old state for change summary and logging
      const idToTask = new Map(toReschedule.map((t) => [t.id, t]))
      const oldCompletionMs = Math.max(
        ...toReschedule.map((t) => t.scheduledEndTime?.getTime() ?? 0),
        0
      )
      const formatDay = (d: Date) =>
        d.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'short', month: 'short', day: 'numeric' })

      console.log(`[regenerateSchedule] scope=remaining: rescheduling ${toReschedule.length} tasks (dependencies respected)`)

      // Adjust time estimates based on feedback if available
      const withActual = completedTasks.filter((t) => (t as unknown as { actualDuration?: number | null }).actualDuration != null)
      let accuracyRatio = 1.0
      if (withActual.length >= 3) {
        accuracyRatio = withActual.reduce((acc, t) => acc + (t as unknown as { actualDuration: number }).actualDuration / t.estimatedDuration, 0) / withActual.length
      }

      const adjustedTasks = toReschedule.map((t) => ({
        ...t,
        estimatedDuration: Math.round(t.estimatedDuration * accuracyRatio),
      }))

      const assignments = greedyReschedule(adjustedTasks, contextData, userTimezone)

      // Detailed logging: what moved and why
      let movedCount = 0
      for (const a of assignments) {
        const task = idToTask.get(a.taskId)
        const oldDate = task?.scheduledDate
        const oldDay = oldDate ? formatDay(oldDate) : 'unscheduled'
        const newDay = formatDay(a.date)
        const changed = !oldDate || oldDate.toISOString().split('T')[0] !== a.date.toISOString().split('T')[0]
        if (changed) movedCount++
        console.log(
          `[regenerateSchedule]   ${task?.title ?? a.taskId}: ${oldDay} → ${newDay}${changed ? ' (moved)' : ''}`
        )
      }

      const newCompletionMs =
        assignments.length > 0
          ? Math.max(...assignments.map((a) => a.endTime.getTime()))
          : 0
      const oldCompletionStr = oldCompletionMs
        ? formatDay(new Date(oldCompletionMs))
        : null
      const newCompletionStr = newCompletionMs ? formatDay(new Date(newCompletionMs)) : null

      // Apply assignments to DB
      let rescheduledCount = 0
      for (const assignment of assignments) {
        await prisma.task.update({
          where: { id: assignment.taskId },
          data: {
            scheduledDate: assignment.date,
            scheduledStartTime: assignment.startTime,
            scheduledEndTime: assignment.endTime,
            batchNumber: newBatch,
            status: 'pending',
          } as Prisma.TaskUncheckedUpdateInput,
        })
        rescheduledCount++
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { generationCount: newGenCount } as unknown as Prisma.ProjectUncheckedUpdateInput,
      })

      // Concise recap for Harvey (cost-friendly, clear for user)
      const recapParts: string[] = [
        `Rescheduled ${rescheduledCount} task(s); ${completedTasks.length} completed kept in place.`,
      ]
      if (movedCount > 0) recapParts.push(`${movedCount} task(s) moved to new days.`)
      if (oldCompletionStr && newCompletionStr && oldCompletionStr !== newCompletionStr) {
        recapParts.push(`New completion date: ${newCompletionStr} (was ${oldCompletionStr}).`)
      } else if (newCompletionStr) {
        recapParts.push(`Completion date: ${newCompletionStr}.`)
      }
      if (accuracyRatio !== 1.0) {
        recapParts.push(`Time estimates adjusted by ${Math.round(accuracyRatio * 100)}% from past performance.`)
      }
      const message = recapParts.join(' ')

      console.log(`[regenerateSchedule] Done. ${message}`)

      return {
        success: true,
        message,
        rescheduled_count: rescheduledCount,
        locked_count: completedTasks.length,
        change_summary: {
          rescheduled_count: rescheduledCount,
          moved_count: movedCount,
          completion_date_before: oldCompletionStr ?? undefined,
          completion_date_after: newCompletionStr ?? undefined,
        },
      }
    }

    if (scope === 'full_rebuild') {
      // ===== FULL REBUILD: Use original schedule generation pipeline =====

      console.log('[regenerateSchedule] scope=full_rebuild: starting full schedule rebuild')

      const onboardingDiscussion = project.discussions[0]
      if (!onboardingDiscussion) {
        return { success: false, message: 'No onboarding conversation found. Cannot do a full rebuild.' }
      }

      const messages = onboardingDiscussion.messages as Array<{ role: string; content: string }>
      const conversationText = messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n')

      const constraints =
        contextData.available_time?.length && user
          ? buildConstraintsFromProjectAndUser(project, user)
          : await extractConstraints(conversationText, userId)

      const taskText = await generateTasks(conversationText, constraints, userId)
      const { tasks: parsedTasks } = parseTasks(taskText)

      if (parsedTasks.length === 0) {
        return { success: false, message: 'Failed to generate tasks. Try again.' }
      }

      const startDate = calculateStartDate(constraints, userTimezone)
      const durationWeeks = constraints.schedule_duration_weeks || 2
      const scheduleResult =       assignTasksToSchedule(
        parsedTasks,
        constraints,
        startDate,
        durationWeeks,
        userTimezone,
        userBlocked as import('../../schedule/task-scheduler').UserBlockedInput | null
      )

      // Log scheduled order (dependencies respected by task-scheduler)
      const formatDay = (d: Date) =>
        d.toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'short', month: 'short', day: 'numeric' })
      console.log(`[regenerateSchedule] full_rebuild: ${scheduleResult.scheduledTasks.length} task blocks scheduled (dependencies respected)`)
      scheduleResult.scheduledTasks.forEach((st, idx) => {
        console.log(`[regenerateSchedule]   ${idx + 1}. ${formatDay(st.date)} — ${st.task.title}${st.partNumber ? ` (Part ${st.partNumber})` : ''}`)
      })

      const lastBlock = scheduleResult.scheduledTasks[scheduleResult.scheduledTasks.length - 1]
      const completionDateStr = lastBlock
        ? formatDay(lastBlock.endTime)
        : null

      await prisma.task.deleteMany({
        where: {
          projectId,
          status: { in: ['pending', 'skipped', 'in_progress'] },
        },
      })

      const taskIdMap = new Map<number, string>()

      for (let i = 0; i < parsedTasks.length; i++) {
        const parsed = parsedTasks[i]
        const scheduleData = getTaskScheduleData(i, scheduleResult.scheduledTasks)
        const priorityMap: Record<string, number> = { high: 1, medium: 3, low: 5 }

        const createData = {
          projectId,
          userId,
          title: parsed.title,
          description: parsed.description || null,
          estimatedDuration: Math.round(parsed.hours * 60),
          successCriteria: convertSuccessCriteriaToJson(parsed.success),
          scheduledDate: scheduleData?.scheduledDate || null,
          scheduledStartTime: scheduleData?.scheduledStartTime ?? null,
          scheduledEndTime: scheduleData?.scheduledEndTime ?? null,
          window_start: scheduleData?.window_start ?? null,
          window_end: scheduleData?.window_end ?? null,
          is_flexible: scheduleData?.is_flexible ?? false,
          status: 'pending',
          priority: priorityMap[parsed.priority] || 3,
          label: parsed.label || null,
          batchNumber: newBatch,
          depends_on: [] as string[],
        } as Prisma.TaskUncheckedCreateInput
        const newTask = await prisma.task.create({ data: createData })
        taskIdMap.set(i, newTask.id)
      }

      for (let i = 0; i < parsedTasks.length; i++) {
        const parsed = parsedTasks[i]
        if (parsed.depends_on && parsed.depends_on.length > 0) {
          const resolvedDeps = parsed.depends_on
            .map((idx) => taskIdMap.get(idx - 1))
            .filter((id): id is string => id !== undefined)

          if (resolvedDeps.length > 0) {
            await prisma.task.update({
              where: { id: taskIdMap.get(i)! },
              data: { depends_on: resolvedDeps } as Prisma.TaskUncheckedUpdateInput,
            })
          }
        }
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { generationCount: newGenCount } as unknown as Prisma.ProjectUncheckedUpdateInput,
      })

      const message = completionDateStr
        ? `Full rebuild complete: ${parsedTasks.length} tasks generated and scheduled. Completion date: ${completionDateStr}.`
        : `Full rebuild complete: ${parsedTasks.length} tasks generated and scheduled.`

      console.log(`[regenerateSchedule] full_rebuild done. ${message}`)

      return {
        success: true,
        message,
        new_task_count: parsedTasks.length,
        change_summary: {
          rescheduled_count: parsedTasks.length,
          completion_date_after: completionDateStr ?? undefined,
        },
      }
    }

    return { success: false, message: `Unknown scope: ${scope}` }
  } catch (error) {
    console.error('[regenerateSchedule] Error:', error)
    return {
      success: false,
      message: `Failed to regenerate schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
