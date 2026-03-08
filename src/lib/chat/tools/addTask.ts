/**
 * Tool: add_task
 *
 * Add a new task to the schedule.
 * Finds the best available time slot based on user constraints,
 * task dependencies, and logical ordering.
 */

import { prisma } from '../../db/prisma'
import type { Prisma } from '@prisma/client'
import type { AddTaskResult, ContextData } from '../types'
import {
  parseTimeToHours,
  formatHoursToTime,
  getDayName,
  addDays,
  getEffectiveAvailableTimeBlocks,
} from '../../schedule/task-scheduler'
import { buildContextDataFromProjectAndUser } from '../../schedule/schedule-generation'
import { localTimeInTimezoneToUTC, getHourDecimalInTimezone, formatTimeInTimezone } from '../../timezone'
import { generateSuccessCriteria } from '../generateSuccessCriteria'

interface AddTaskParams {
  title: string
  description?: string
  estimated_duration: number  // minutes
  label?: string
  depends_on?: string[]       // task IDs
  preferred_date?: string     // YYYY-MM-DD
  preferred_time?: string     // HH:MM
  placement_hint?: string     // "before task_id", "as_early_as_possible", "end_of_week", "after task_id"
}

/**
 * Find the earliest available slot for a task of the given duration.
 *
 * Scans available time windows day-by-day, skipping slots that
 * conflict with existing tasks or one-off blocks.
 *
 * @param durationMinutes - Required duration in minutes
 * @param contextData - User's availability constraints
 * @param existingTasks - All tasks in the project
 * @param fromDate - Start searching from this date
 * @param maxDays - Maximum number of days to search ahead
 * @param userTimezone - User's IANA timezone (e.g. Europe/Paris) for storing times in UTC
 * @returns A slot { date, startTime, endTime } or null if nothing found
 */
function findAvailableSlot(
  durationMinutes: number,
  contextData: ContextData,
  existingTasks: Array<{ scheduledDate: Date | null; scheduledStartTime: Date | null; scheduledEndTime: Date | null; status: string }>,
  fromDate: Date,
  maxDays: number = 14,
  userTimezone: string = 'UTC'
): { date: Date; startTime: Date; endTime: Date } | null {
  const durationHours = durationMinutes / 60

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const currentDate = addDays(fromDate, dayOffset)
    const dayName = getDayName(currentDate)
    const dateStr = currentDate.toISOString().split('T')[0]

    // Check if this date is blocked by one-off blocks
    const isOneOffBlocked = contextData.one_off_blocks?.some((block) => {
      if (block.date === dateStr && block.all_day) return true
      if (block.date_start && block.date_end) {
        return dateStr >= block.date_start && dateStr <= block.date_end && block.all_day
      }
      return false
    })
    if (isOneOffBlocked) continue

    // Get available slots for this day of week
    const daySlots = (contextData.available_time || []).filter(
      (slot) => slot.day.toLowerCase() === dayName
    )

    for (const slot of daySlots) {
      const slotStartHours = parseTimeToHours(slot.start)
      const slotEndHours = parseTimeToHours(slot.end)
      const slotDuration = slotEndHours > slotStartHours
        ? slotEndHours - slotStartHours
        : 24 - slotStartHours + slotEndHours // overnight

      if (slotDuration < durationHours) continue

      // Get existing tasks for this day that are active
      const dayTasks = existingTasks.filter((t) => {
        if (!t.scheduledDate || t.status === 'completed' || t.status === 'skipped') return false
        return t.scheduledDate.toISOString().split('T')[0] === dateStr
      })

      // Build list of occupied intervals in user's local hours (for comparison with slot)
      const occupied = dayTasks
        .filter((t) => t.scheduledStartTime && t.scheduledEndTime)
        .map((t) => ({
          start: getHourDecimalInTimezone(t.scheduledStartTime!, userTimezone),
          end: getHourDecimalInTimezone(t.scheduledEndTime!, userTimezone),
        }))
        .sort((a, b) => a.start - b.start)

      // Also add one-off blocks for this day (non-all-day)
      const dayOneOffs = (contextData.one_off_blocks || []).filter(
        (b) => b.date === dateStr && !b.all_day && b.start_time && b.end_time
      )
      for (const b of dayOneOffs) {
        occupied.push({
          start: parseTimeToHours(b.start_time!),
          end: parseTimeToHours(b.end_time!),
        })
      }
      occupied.sort((a, b) => a.start - b.start)

      // Find a gap that fits the duration
      let searchStart = slotStartHours
      for (const occ of occupied) {
        if (occ.start >= slotEndHours) break
        if (occ.start - searchStart >= durationHours) {
          // Found a gap: build UTC times from user-local date/time
          const startH = Math.floor(searchStart)
          const startM = Math.round((searchStart - startH) * 60)
          const startTime = localTimeInTimezoneToUTC(dateStr, startH, startM, userTimezone)
          const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)
          return { date: new Date(currentDate), startTime, endTime }
        }
        searchStart = Math.max(searchStart, occ.end)
      }

      // Check remaining time after all occupied blocks
      if (slotEndHours - searchStart >= durationHours) {
        const startH = Math.floor(searchStart)
        const startM = Math.round((searchStart - startH) * 60)
        const startTime = localTimeInTimezoneToUTC(dateStr, startH, startM, userTimezone)
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)
        return { date: new Date(currentDate), startTime, endTime }
      }
    }
  }

  return null
}

/**
 * Execute the add_task tool.
 *
 * Creates a new task and finds the best available slot.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Result with the created task details
 */
export async function executeAddTask(
  params: AddTaskParams,
  projectId: string,
  userId: string
): Promise<AddTaskResult> {
  try {
    const { title, description, estimated_duration, label, depends_on, preferred_date, preferred_time } = params

    // 1. Get project and all existing tasks
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { tasks: true },
    })

    if (!project) {
      return { success: false, message: 'Project not found.' }
    }

    // 2. Get user and build context from User + Project (no contextData)
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const userTimezone = user?.timezone || 'Europe/Paris'
    const rawContext = user
      ? buildContextDataFromProjectAndUser(project, user)
      : ({ available_time: [], preferences: {} } as ContextData)
    const userBlocked = user
      ? { workSchedule: user.workSchedule as import('@/types/api.types').WorkScheduleShape | null, commute: user.commute as import('@/types/api.types').CommuteShape | null }
      : null
    const effectiveAvailable = getEffectiveAvailableTimeBlocks(
      rawContext.available_time || [],
      userBlocked
    )
    const contextData: ContextData = {
      ...rawContext,
      available_time: effectiveAvailable.length > 0 ? effectiveAvailable : (rawContext.available_time || []),
    }

    // 3. Get current batch number
    const currentBatch = Math.max(...project.tasks.map((t) => (t as unknown as { batchNumber: number }).batchNumber ?? 1), 1)

    // 4. Find an available slot (all times stored in UTC from user's local intent)
    let slotDate: Date | null = null
    let slotStart: Date | null = null
    let slotEnd: Date | null = null

    if (preferred_date && preferred_time) {
      // User specified exact date and time in their timezone — convert to UTC
      const [h, m] = preferred_time.split(':').map(Number)
      slotStart = localTimeInTimezoneToUTC(preferred_date, h, m ?? 0, userTimezone)
      slotEnd = new Date(slotStart.getTime() + estimated_duration * 60 * 1000)
      slotDate = new Date(slotStart)
      slotDate.setUTCHours(0, 0, 0, 0)
    } else if (preferred_date) {
      // Date specified but no time — find a slot on that day
      const fromDate = new Date(preferred_date + 'T00:00:00.000Z')
      const slot = findAvailableSlot(estimated_duration, contextData, project.tasks, fromDate, 1, userTimezone)
      if (slot) {
        slotDate = slot.date
        slotStart = slot.startTime
        slotEnd = slot.endTime
      }
    } else {
      // No preference — find earliest available slot from today
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const slot = findAvailableSlot(estimated_duration, contextData, project.tasks, today, 14, userTimezone)
      if (slot) {
        slotDate = slot.date
        slotStart = slot.startTime
        slotEnd = slot.endTime
      }
    }

    // 5. Convert priority label to number
    const priorityMap: Record<string, number> = { high: 1, medium: 3, low: 5 }

    // 6. Generate 2–4 success criteria for the task (same quality as onboarding tasks)
    const successCriteria = await generateSuccessCriteria(title, description, userId)

    // 7. Create the task
    const data = {
      projectId,
      userId,
      title,
      description: description || null,
      estimatedDuration: estimated_duration,
      label: label || null,
      depends_on: depends_on || [],
      successCriteria: successCriteria.length > 0 ? successCriteria : undefined,
      scheduledDate: slotDate,
      scheduledStartTime: slotStart,
      scheduledEndTime: slotEnd,
      status: 'pending',
      priority: 3,
      batchNumber: currentBatch,
    } as Prisma.TaskUncheckedCreateInput
    const task = await prisma.task.create({ data })

    if (!slotDate) {
      return {
        success: true,
        message: `Task "${title}" created but no available slot was found in the next 2 weeks. It has been added as unscheduled. Want me to suggest alternatives or rebuild the schedule?`,
        task: {
          id: task.id,
          title: task.title,
          scheduled_date: null,
          scheduled_start_time: null,
          scheduled_end_time: null,
        },
      }
    }

    const dateStr = slotDate.toISOString().split('T')[0]
    // Show times in user's timezone so the message matches what they asked for
    const startStr = slotStart
      ? formatTimeInTimezone(slotStart, userTimezone, { hour12: false })
      : null
    const endStr = slotEnd
      ? formatTimeInTimezone(slotEnd, userTimezone, { hour12: false })
      : null

    return {
      success: true,
      message: `Task "${title}" added and scheduled for ${dateStr} at ${startStr}–${endStr} (${estimated_duration} minutes).`,
      task: {
        id: task.id,
        title: task.title,
        scheduled_date: dateStr,
        scheduled_start_time: startStr,
        scheduled_end_time: endStr,
      },
    }
  } catch (error) {
    console.error('[addTask] Error:', error)
    return {
      success: false,
      message: `Failed to add task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
